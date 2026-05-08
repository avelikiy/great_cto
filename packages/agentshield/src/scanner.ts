/**
 * Scanner orchestrator.
 *
 * Walks the filesystem (or an explicit file list), applies all loaded rules
 * to each file, and produces a ScanReport.
 *
 * Pure regex-based — no AST. This is intentional: AST-aware analysis is
 * fragile across languages and adds dependencies. Regex catches the
 * high-confidence patterns we care about (OWASP LLM Top 10).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import type {
  Rule,
  Finding,
  Location,
  ScanOptions,
  ScanReport,
  Severity,
} from './types.js';
import { severityRank } from './types.js';
import { loadRules } from './rules-loader.js';

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.java', '.kt',
  '.md', '.mdx', '.yaml', '.yml', '.json',
  '.toml', '.ini', '.env',
  '.sh', '.bash',
]);

const DEFAULT_EXCLUDE = [
  /\/node_modules\//,
  /\/dist\//,
  /\/build\//,
  /\/\.git\//,
  /\/\.next\//,
  /\/\.venv\//,
  /\/__pycache__\//,
  /\/coverage\//,
];

function* walk(root: string, exclude: RegExp[]): Generator<string> {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (exclude.some((re) => re.test(full + '/'))) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      yield* walk(full, exclude);
    } else if (TEXT_EXTS.has(extname(full).toLowerCase()) || /\.(env|envrc)/.test(entry)) {
      // Skip very large files to keep scan fast
      if (st.size <= 1_000_000) yield full;
    }
  }
}

function fileMatchesGlobs(file: string, globs: string[] | undefined): boolean {
  if (!globs || globs.length === 0) return true;
  // Tiny glob → regex. Convert globs in two passes:
  //   1. Replace ** and * with sentinel placeholders.
  //   2. Escape remaining regex metachars.
  //   3. Replace placeholders with their regex equivalents.
  return globs.some((g) => {
    const pattern = g
      .replace(/\*\*/g, '')   // ** → SOH
      .replace(/\*/g, '')     // *  → STX
      .replace(/\?/g, '')     // ?  → ETX
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(//g, '.*')
      .replace(//g, '[^/]*')
      .replace(//g, '.');
    try {
      return new RegExp(pattern).test(file);
    } catch {
      return false;
    }
  });
}

function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((p) => new RegExp(p, 'm'));
}

function lineColAt(text: string, idx: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) { line++; lastNewline = i; }
  }
  return { line, column: idx - lastNewline };
}

function snippet(text: string, idx: number, matchLen: number): string {
  const start = text.lastIndexOf('\n', idx - 1) + 1;
  let end = text.indexOf('\n', idx + matchLen);
  if (end === -1) end = text.length;
  return text.slice(start, end).trim().slice(0, 200);
}

export function scanFile(file: string, content: string, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (!fileMatchesGlobs(file, rule.file_globs)) continue;
    const negators = rule.negate ? compilePatterns(rule.negate) : [];
    if (negators.some((re) => re.test(content))) continue;

    const compiled = compilePatterns(rule.patterns);
    for (const re of compiled) {
      const m = re.exec(content);
      if (!m) continue;
      const idx = m.index;
      const { line, column } = lineColAt(content, idx);
      const location: Location = {
        file,
        line,
        column,
        snippet: snippet(content, idx, m[0].length),
      };
      findings.push({ rule, location, match: m[0] });
      // First match per rule per file is enough — avoid noise
      break;
    }
  }
  return findings;
}

export function scan(root: string, options: ScanOptions = {}): ScanReport {
  const start = Date.now();
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  let rules: Rule[];
  try {
    rules = loadRules();
  } catch (e) {
    return {
      startedAt,
      durationMs: Date.now() - start,
      filesScanned: 0,
      rulesEvaluated: 0,
      findings: [],
      errors: [(e as Error).message],
    };
  }

  // Filter scanners
  if (options.scanners && options.scanners.length > 0) {
    const allowed = new Set(options.scanners);
    rules = rules.filter((r) => allowed.has(r.scanner));
  }

  // Filter min severity
  if (options.minSeverity) {
    const minRank = severityRank(options.minSeverity);
    rules = rules.filter((r) => severityRank(r.severity) >= minRank);
  }

  // Build file list
  const exclude = [
    ...DEFAULT_EXCLUDE,
    ...(options.exclude || []).map((g) => new RegExp(g)),
  ];

  let files: string[];
  if (options.files) {
    files = options.files.map((f) => resolve(f));
  } else {
    if (!existsSync(root)) {
      return {
        startedAt,
        durationMs: Date.now() - start,
        filesScanned: 0,
        rulesEvaluated: rules.length,
        findings: [],
        errors: [`root not found: ${root}`],
      };
    }
    // Allow root to be a single file
    const st = statSync(resolve(root));
    if (st.isFile()) {
      files = [resolve(root)];
    } else {
      files = [...walk(resolve(root), exclude)];
    }
  }

  // Scan
  const findings: Finding[] = [];
  let filesScanned = 0;
  const cwd = process.cwd();
  for (const file of files) {
    let content: string;
    try { content = readFileSync(file, 'utf8'); }
    catch (e) { errors.push(`${file}: ${(e as Error).message}`); continue; }
    filesScanned++;
    const rel = relative(cwd, file) || file;
    const fileFindings = scanFile(rel, content, rules);
    findings.push(...fileFindings);
    if (options.maxFindings && findings.length >= options.maxFindings) break;
  }

  // Sort findings: critical→info, then by file
  findings.sort((a, b) => {
    const sev = severityRank(b.rule.severity) - severityRank(a.rule.severity);
    if (sev !== 0) return sev;
    return a.location.file.localeCompare(b.location.file);
  });

  return {
    startedAt,
    durationMs: Date.now() - start,
    filesScanned,
    rulesEvaluated: rules.length,
    findings,
    errors,
  };
}
