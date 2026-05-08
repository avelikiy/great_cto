/**
 * Loads YAML rule files from rules/*.yaml.
 *
 * We avoid a YAML dependency by parsing the simple subset we use ourselves —
 * each rule file is a list of dash-prefixed entries with key/value lines.
 * If we ever need real YAML (anchors, complex nesting), we'll add `yaml` as
 * a dep then.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rule, ScannerName } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Default location: `agentshield-rules/` at the cli-package root.
 * Search order accommodates both compiled and direct invocation:
 *   - dist/agentshield/rules-loader.js  →  ../../agentshield-rules
 *   - src/agentshield/rules-loader.ts   →  ../../agentshield-rules (no compile)
 *   - legacy standalone layout         →  ../rules (kept for safety)
 */
function defaultRulesDir(): string {
  const candidates = [
    join(__dirname, '..', '..', 'agentshield-rules'),
    join(__dirname, '..', '..', '..', 'agentshield-rules'),
    join(__dirname, '..', 'rules'),
    join(__dirname, '..', '..', 'rules'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

export function loadRules(rulesDir: string = defaultRulesDir()): Rule[] {
  if (!existsSync(rulesDir)) {
    throw new Error(`agentshield: rules directory not found: ${rulesDir}`);
  }

  const files = readdirSync(rulesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const rules: Rule[] = [];
  for (const f of files) {
    const text = readFileSync(join(rulesDir, f), 'utf8');
    rules.push(...parseRulesFile(text, f));
  }
  return rules;
}

/**
 * Parse a minimal YAML format:
 *
 * - id: PI-001
 *   scanner: prompt-injection
 *   title: "Untrusted user input concatenated into system prompt"
 *   severity: critical
 *   owasp: "LLM01:2025 — Prompt Injection"
 *   description: |
 *     ...
 *   remediation: |
 *     ...
 *   patterns:
 *     - 'system\s*[:=]\s*["`].*\$\{.*\}'
 *   file_globs:
 *     - "**\/*.ts"
 *     - "**\/*.py"
 *   negate:
 *     - "// agentshield:ignore"
 */
export function parseRulesFile(text: string, filename: string): Rule[] {
  // Strip line comments (# at start of line, ignoring # in quoted values)
  const lines = text.split('\n').filter((l) => !/^\s*#/.test(l));
  const stripped = lines.join('\n');

  const rules: Rule[] = [];
  // Split on top-level list markers ("\n- " or "^- "). Each block's first
  // key has its `- ` stripped → manually re-pad so all keys share an indent.
  const blocks = stripped.split(/^-\s/m)
    .filter((b) => b.trim() && /^\s*[a-z_]+:/m.test(b))
    .map((b) => '  ' + b);   // realign first line to match nested keys

  for (const block of blocks) {
    try {
      rules.push(parseBlock(block, filename));
    } catch (e) {
      throw new Error(`agentshield: failed to parse rule in ${filename}: ${(e as Error).message}\n--- block ---\n${block}`);
    }
  }
  return rules;
}

function parseBlock(block: string, filename: string): Rule {
  // Detect the base indent of this block. The first non-empty line is the
  // `id:` field (post-split). Subsequent fields share the same indent as the
  // base (or deeper for list items / block scalars).
  const lines = block.split('\n');
  const out: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;
  let blockScalarLines: string[] | null = null;

  // Find base key indent — the smallest indent of any "key:" line in the block.
  let baseIndent = Infinity;
  for (const raw of lines) {
    const m = raw.match(/^( *)[a-z_]+:/);
    if (m && m[1].length < baseIndent) baseIndent = m[1].length;
  }
  if (baseIndent === Infinity) baseIndent = 0;

  for (const raw of lines) {
    if (!raw.trim()) continue;

    // Block scalar continuation: any line indented deeper than baseIndent
    // belongs to the current block scalar.
    if (blockScalarLines !== null) {
      const indent = raw.match(/^ */)![0].length;
      if (indent > baseIndent) {
        blockScalarLines.push(raw.slice(baseIndent + 2));   // strip baseIndent + 2
        continue;
      } else {
        out[currentKey!] = blockScalarLines.join('\n').trim();
        blockScalarLines = null;
        // fall through to handle this line as a new key
      }
    }

    // List item: indent > baseIndent and starts with "-"
    if (currentList !== null) {
      const indent = raw.match(/^ */)![0].length;
      if (/^\s*-\s+/.test(raw) && indent > baseIndent) {
        const item = raw.replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, '');
        currentList.push(item);
        continue;
      } else {
        out[currentKey!] = currentList;
        currentList = null;
        // fall through
      }
    }

    // Key:value line — indent must equal baseIndent
    const kvMatch = raw.match(/^( *)([a-z_]+):\s*(.*)$/);
    if (!kvMatch) continue;
    const indent = kvMatch[1].length;
    if (indent !== baseIndent) continue;   // nested key handled by parent state

    const key = kvMatch[2];
    const valRaw = kvMatch[3];
    currentKey = key;

    if (valRaw === '|' || valRaw === '|+' || valRaw === '|-') {
      blockScalarLines = [];
    } else if (valRaw === '') {
      currentList = [];
    } else {
      out[key] = valRaw.replace(/^["']|["']$/g, '');
    }
  }

  if (currentList !== null) out[currentKey!] = currentList;
  if (blockScalarLines !== null) out[currentKey!] = blockScalarLines.join('\n').trim();

  for (const required of ['id', 'scanner', 'title', 'severity', 'description', 'remediation', 'patterns']) {
    if (out[required] === undefined) {
      throw new Error(`missing required field "${required}" in rule (block from ${filename})\nparsed: ${JSON.stringify(out)}`);
    }
  }

  return {
    id: out.id as string,
    scanner: out.scanner as ScannerName,
    title: out.title as string,
    severity: out.severity as Rule['severity'],
    owasp: out.owasp as string | undefined,
    description: out.description as string,
    remediation: out.remediation as string,
    patterns: out.patterns as string[],
    file_globs: out.file_globs as string[] | undefined,
    negate: out.negate as string[] | undefined,
  };
}
