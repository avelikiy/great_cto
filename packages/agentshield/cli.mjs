#!/usr/bin/env node
/**
 * agentshield CLI — standalone entry point.
 *
 *   agentshield scan [path]            scan a directory (default: cwd)
 *   agentshield scan --sarif out.sarif emit SARIF for GitHub Code Scanning
 *   agentshield scan --json            emit JSON to stdout
 *   agentshield scan --severity high   filter by minimum severity
 *   agentshield scan --scanner ssrf    only run one scanner
 *   agentshield list-rules             print catalog
 *   agentshield --version              print version
 *
 * Exit codes:
 *   0  no findings (or all below --severity threshold)
 *   1  findings at or above threshold (CI-friendly)
 *   2  scan failed (rules invalid, root not found, etc.)
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')).version;

// Lazy import compiled module (works for both `npm pack` install and dev)
const { scan, loadRules } = await import('./dist/index.js');
const { toSarif } = await import('./dist/sarif.js');

const argv = process.argv.slice(2);

function flag(name) {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0;
}

function value(name, def) {
  const idx = argv.indexOf(`--${name}`);
  if (idx < 0 || idx === argv.length - 1) return def;
  return argv[idx + 1];
}

function help() {
  console.log(`agentshield ${VERSION}

USAGE:
  agentshield scan [path]              scan a directory (default: .)
  agentshield list-rules               print rule catalog
  agentshield --version                print version

OPTIONS for scan:
  --sarif <file>     emit SARIF 2.1.0 to <file> (for GitHub Code Scanning)
  --json             emit JSON report to stdout
  --severity <lvl>   minimum: info, low, medium, high, critical (default: info)
  --scanner <name>   only run one scanner (repeatable):
                       prompt-injection, secrets-in-prompts, ssrf-in-tools,
                       rag-poisoning, cost-runaway
  --max <n>          stop after N findings
  --exclude <regex>  add path exclude pattern (repeatable)
  --quiet            don't print human-readable output (use with --json/--sarif)

EXIT:
  0  no findings (or all below threshold)
  1  findings at/above threshold
  2  scan failed
`);
}

if (argv.length === 0 || flag('help') || flag('h')) { help(); process.exit(0); }
if (flag('version') || flag('v')) { console.log(VERSION); process.exit(0); }

const cmd = argv[0];

if (cmd === 'list-rules') {
  const rules = loadRules();
  for (const r of rules) {
    console.log(`${r.id.padEnd(8)} ${r.severity.padEnd(8)} ${r.scanner.padEnd(20)} ${r.title}`);
  }
  console.log(`\n${rules.length} rule(s) loaded.`);
  process.exit(0);
}

if (cmd !== 'scan') { help(); process.exit(2); }

const root = (argv[1] && !argv[1].startsWith('--')) ? argv[1] : '.';

const scanners = argv
  .map((a, i) => (a === '--scanner' ? argv[i + 1] : null))
  .filter(Boolean);

const exclude = argv
  .map((a, i) => (a === '--exclude' ? argv[i + 1] : null))
  .filter(Boolean);

const opts = {
  scanners: scanners.length > 0 ? scanners : undefined,
  minSeverity: value('severity', 'info'),
  exclude: exclude.length > 0 ? exclude : undefined,
  maxFindings: value('max') ? parseInt(value('max'), 10) : undefined,
};

const sarifPath = value('sarif');
const wantsJson = flag('json');
const quiet = flag('quiet');

const report = scan(resolve(root), opts);

// SARIF output
if (sarifPath) {
  writeFileSync(sarifPath, JSON.stringify(toSarif(report), null, 2));
  if (!quiet) console.error(`✓ SARIF written → ${sarifPath}`);
}

// JSON output
if (wantsJson) {
  console.log(JSON.stringify(report, null, 2));
}

// Human-readable output
if (!quiet && !wantsJson) {
  const COLORS = {
    critical: '\x1b[1;31m', high: '\x1b[31m', medium: '\x1b[33m',
    low: '\x1b[36m', info: '\x1b[2m', reset: '\x1b[0m',
  };
  const useColor = process.stdout.isTTY;
  const c = (sev, s) => useColor ? `${COLORS[sev] || ''}${s}${COLORS.reset}` : s;

  console.error(`\nagentshield ${VERSION} — scanned ${report.filesScanned} file(s) in ${report.durationMs}ms\n`);

  if (report.errors.length > 0) {
    console.error(`\x1b[33m⚠ ${report.errors.length} error(s):\x1b[0m`);
    for (const e of report.errors) console.error(`    ${e}`);
    console.error('');
  }

  if (report.findings.length === 0) {
    console.error(`\x1b[32m✓ No findings.\x1b[0m\n`);
  } else {
    for (const f of report.findings) {
      const tag = c(f.rule.severity, `[${f.rule.severity.toUpperCase()}]`);
      console.error(`${tag} ${f.rule.id}  ${f.location.file}:${f.location.line}`);
      console.error(`        ${f.rule.title}`);
      console.error(`        ${c('info', f.location.snippet)}`);
      if (f.rule.owasp) console.error(`        ${c('info', f.rule.owasp)}`);
      console.error('');
    }

    // Summary
    const counts = {};
    for (const f of report.findings) {
      counts[f.rule.severity] = (counts[f.rule.severity] || 0) + 1;
    }
    const order = ['critical', 'high', 'medium', 'low', 'info'];
    const parts = order.filter((s) => counts[s]).map((s) => c(s, `${counts[s]} ${s}`));
    console.error(`\x1b[1m${report.findings.length} finding(s)\x1b[0m  —  ${parts.join(', ')}\n`);
  }
}

// Exit code: 1 if any findings (CI-friendly)
process.exit(report.findings.length > 0 ? 1 : 0);
