// scripts/lib/compress/index.mjs — ContentRouter + unified compress().
//
// Phase 1 of the headroom-inspired compression layer (hybrid plan: native,
// deterministic, $0). Detects content type and routes to the right compressor:
//   json → minify (+ optional crush)   log → template-collapse   text → importance-trim
//
// CLI:  node scripts/lib/compress/index.mjs <file> [--type T] [--budget N] [--crush] [--stats]
//   (reads stdin if no file). Prints compressed output; --stats prints a JSON summary to stderr.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { minifyJson } from './json-minify.mjs';
import { compressLog } from './log-template.mjs';
import { trimByImportance } from './line-importance.mjs';

/** Detect content type: 'json' | 'log' | 'diff' | 'text'. */
export function detectType(text) {
  const s = String(text);
  const t = s.trimStart();
  if ((t.startsWith('{') || t.startsWith('['))) {
    try { JSON.parse(s); return 'json'; } catch { /* not json */ }
  }
  const head = s.split('\n').slice(0, 40);
  if (head.some((l) => /^(diff --git |@@ |index [0-9a-f]+\.\.|\+\+\+ |--- )/.test(l))) return 'diff';
  const logHits = head.filter((l) =>
    /\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL|CRITICAL)\b/.test(l) ||
    /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(l)
  ).length;
  if (head.length >= 3 && logHits >= Math.max(3, Math.ceil(head.length * 0.3))) return 'log';
  return 'text';
}

/**
 * Compress `text`. Returns the compressed string plus stats. Always safe — on any
 * problem it falls back to the original text.
 *
 * @param {string} text
 * @param {{ type?: string, budget?: number, crush?: boolean }} [opts]
 * @returns {{ compressed: string, type: string, before: number, after: number, ratio: number }}
 */
export function compress(text, opts = {}) {
  const input = String(text);
  const type = opts.type || detectType(input);

  // Opt-in headroom-MCP routing (great_cto-k9p, docs/compression/HEADROOM-MCP.md): when
  // PROJECT.md sets `headroom: true` AND the headroom-ai MCP is installed, the caller injects
  // opts.headroom (a compressor fn) for HEAVY blobs — AST / model weights / very large text.
  // Never a default dependency: absent → native only. Must never break compression (fall through).
  if (typeof opts.headroom === 'function' && (opts.heavy || input.length >= (opts.heavyBytes || 200_000))) {
    try {
      const r = opts.headroom(input, { type });
      if (r && typeof r.compressed === 'string' && r.compressed.length < input.length) {
        const a = r.compressed.length;
        return { compressed: r.compressed, type: r.type || type, before: input.length, after: a, ratio: +(1 - a / input.length).toFixed(4), via: 'headroom' };
      }
    } catch { /* fall through to native — headroom never breaks the native path */ }
  }

  let compressed = input;

  if (type === 'json') {
    compressed = minifyJson(input, { crushArrays: !!opts.crush }).text;
  } else if (type === 'log') {
    compressed = compressLog(input).text;
    if (Number.isFinite(opts.budget)) compressed = trimByImportance(compressed, { budget: opts.budget }).text;
  } else { // diff | text
    if (Number.isFinite(opts.budget)) compressed = trimByImportance(input, { budget: opts.budget }).text;
  }

  const before = input.length;
  const after = compressed.length;
  return { compressed, type, before, after, ratio: before ? +(1 - after / before).toFixed(4) : 0, via: 'native' };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { stats: false, crush: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') o.type = argv[++i];
    else if (a === '--budget') o.budget = parseInt(argv[++i], 10);
    else if (a === '--crush') o.crush = true;
    else if (a === '--stats') o.stats = true;
    else if (!a.startsWith('--')) o.file = a;
  }
  return o;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let text = '';
  try {
    text = args.file ? readFileSync(args.file, 'utf8') : readFileSync(0, 'utf8');
  } catch {
    text = '';
  }
  const r = compress(text, args);
  process.stdout.write(r.compressed);
  if (!r.compressed.endsWith('\n')) process.stdout.write('\n');
  if (args.stats) {
    process.stderr.write(`# compress: type=${r.type} ${r.before}→${r.after} chars (${(r.ratio * 100).toFixed(0)}% saved)\n`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
