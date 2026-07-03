// scripts/lib/quality.mjs — unified product-quality verdict (QUALITY-DEEPEN #5).
//
// Runs all three quality lenses on a product and blends them into one verdict, so the
// pipeline has a single command/gate instead of three tools:
//   • floor    — product-score   (presence of quality machinery, static)
//   • ceiling  — product-eval    (executed: tests/typecheck/lint/audit/secrets)
//   • domain   — archetype-contracts (does the suite cover the dangerous domain paths)
// Optionally records the verdict to metrics-history for trend, and gates deploy.
//
// Usage:
//   node scripts/lib/quality.mjs <dir> [--archetype a] [--json] [--record] [--gate --min N] [--baseline prev.json]
//   node scripts/lib/quality.mjs --trend [--history file] [--last N]

import { existsSync, statSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreProduct, inspect, detectArchetype } from './product-score.mjs';
import { runEval, scoreExecution } from './product-eval.mjs';
import { checkContracts, readTestText } from './archetype-contracts.mjs';
import { parseHistory } from './metrics-trend.mjs';

/** Blend the three lenses → overall 0-100. ceiling weighted most (execution > shape);
 *  contracts dropped+renormalized when the archetype has none. */
export function combinedScore({ floor, ceiling, contracts }) {
  const parts = [{ k: 'floor', v: floor, w: 30 }, { k: 'ceiling', v: ceiling, w: 50 }];
  if (typeof contracts === 'number') parts.push({ k: 'domain', v: contracts, w: 20 });
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const overall = Math.round(parts.reduce((a, p) => a + (p.v * p.w / wsum), 0));
  return { overall, grade: grade(overall), weights: Object.fromEntries(parts.map(p => [p.k, round2(p.w / wsum)])) };
}
function round2(n) { return Math.round(n * 100) / 100; }
function grade(t) { return t >= 90 ? 'A' : t >= 75 ? 'B' : t >= 60 ? 'C' : t >= 45 ? 'D' : 'F'; }

/** Full assessment of a product dir across all three lenses. */
export function assess(dir, archetypeFlag = null) {
  const archetype = detectArchetype(dir, archetypeFlag);
  const floor = scoreProduct(inspect(dir, archetype), archetype).total;
  const ceiling = scoreExecution(runEval(dir)).total;
  const c = checkContracts(archetype, readTestText(dir));
  const contracts = c.coverage; // null when archetype has no contracts
  const combined = combinedScore({ floor, ceiling, contracts });
  return { archetype: archetype || 'web', floor, ceiling, contracts, contractDetail: c, ...combined };
}

/**
 * F5a: gate decision — parity with product-eval.mjs's --gate --baseline (scripts/lib/
 * product-eval.mjs main()). Pure so it's unit-testable without a subprocess.
 *   • fails if `overall < min` (absolute floor, default 70)
 *   • fails if a baseline is given and `overall < baselineTotal - 2` (regression gate;
 *     >2-point drop, same threshold/semantics as product-eval)
 * `readBaseline(path)` reads a JSON file and must return the previous overall/total
 * (or null/throw if unavailable) — injected so callers can pass the right field name.
 * @returns {{ ok: boolean, reason: string }}
 */
export function evaluateGate(overall, { min = 70, baselineTotal = null } = {}) {
  if (overall < min) return { ok: false, reason: `score ${overall} < min ${min}` };
  if (typeof baselineTotal === 'number' && overall < baselineTotal - 2) {
    return { ok: false, reason: `regression ${overall} < baseline ${baselineTotal}` };
  }
  return { ok: true, reason: '' };
}

/** Read a baseline JSON file's overall score. quality.mjs's own --json output uses
 *  `overall`; product-eval.mjs's baseline files use `total` — accept either so a
 *  product-eval baseline file can also be reused here. Returns null on any failure
 *  (missing file, bad JSON, missing field) — gate then just skips the regression check. */
export function readBaselineOverall(path) {
  if (!path) return null;
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    const v = typeof j.overall === 'number' ? j.overall : (typeof j.total === 'number' ? j.total : null);
    return typeof v === 'number' ? v : null;
  } catch { return null; }
}

// ── F5b: --trend — quality-scoped view over metrics-trend.mjs's history ───────
// Not a replacement for metrics-trend.mjs (generic, any metric key) — this is a thin
// view filtered to the `quality.*` keys quality.mjs --record writes, rendered as a
// terminal sparkline + delta so a regression is visible at a glance without --json.

const SPARK_TICKS = '▁▂▃▄▅▆▇█';

/** value (0-100 scale expected, but works for any range within [lo,hi]) → one tick char. */
function sparkChar(v, lo, hi) {
  if (hi <= lo) return SPARK_TICKS[0];
  const idx = Math.round(((v - lo) / (hi - lo)) * (SPARK_TICKS.length - 1));
  return SPARK_TICKS[Math.max(0, Math.min(SPARK_TICKS.length - 1, idx))];
}

/** Build a sparkline string for a series of 0-1 scale values (metrics-history convention). */
export function sparkline(values) {
  if (!values.length) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  return values.map(v => sparkChar(v, lo, hi)).join('');
}

/**
 * F5b: quality-scoped trend view. Reads metrics-history rows (as parsed by
 * metrics-trend.mjs's parseHistory), keeps only `quality.*` keys, and returns one
 * series per archetype key: last-N overall scores (0-100 scale) + Δ vs the point
 * before the window. Pure + read-only — never throws, never signals failure; the
 * caller always exits 0 (REQ-4).
 * @param {Array<{key,value,ts}>} rows  chronological (oldest→newest), metrics-trend shape
 * @param {object} [opts]
 * @param {number} [opts.last=10]  how many most-recent points to show per key
 * @returns {Array<{key,archetype,points,scores,delta,latest}>}
 */
export function buildTrend(rows, opts = {}) {
  const last = Number.isFinite(opts.last) ? opts.last : 10;
  const byKey = new Map();
  for (const r of rows) {
    if (typeof r.key !== 'string' || !r.key.startsWith('quality.')) continue;
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r.value);
  }
  const out = [];
  for (const [key, values] of byKey) {
    const scores = values.slice(-last).map(v => Math.round(v * 100)); // stored as 0-1, display 0-100
    const latest = scores[scores.length - 1];
    const prev = scores.length >= 2 ? scores[scores.length - 2] : null;
    const delta = prev === null ? null : latest - prev;
    out.push({ key, archetype: key.slice('quality.'.length), points: scores.length, scores, delta, latest });
  }
  out.sort((a, b) => a.archetype.localeCompare(b.archetype));
  return out;
}

/** Render buildTrend() output as a terminal-friendly table + sparkline. */
export function renderTrendText(trend) {
  if (!trend.length) return 'quality --trend: no recorded quality.* history yet (run with --record first).';
  const lines = ['Quality trend (last-N overall scores per archetype)', ''];
  for (const t of trend) {
    const spark = sparkline(t.scores.map(s => s / 100));
    const deltaStr = t.delta === null ? '(first point)' : `Δ${t.delta >= 0 ? '+' : ''}${t.delta}`;
    lines.push(`  ${t.archetype.padEnd(18)} ${spark}  ${String(t.latest).padStart(3)}/100  ${deltaStr}  (n=${t.points})`);
  }
  return lines.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';

/** F5b: --trend doesn't need a product dir — it's a read-only view over recorded
 *  history. Handled before the dir-required path. Exit 0 always (read-only report). */
function cmdTrend(argv) {
  const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
  const historyPath = get('--history') || join(PROJ_DIR, 'metrics-history.jsonl');
  const last = parseInt(get('--last') || '10', 10);
  let rows = [];
  if (existsSync(historyPath)) {
    try { rows = parseHistory(readFileSync(historyPath, 'utf8')); } catch { /* ignore, render empty */ }
  }
  const trend = buildTrend(rows, { last });
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(trend, null, 2) + '\n');
  else console.log(renderTrendText(trend));
  process.exit(0);
}

function main(argv) {
  if (argv.includes('--trend')) return cmdTrend(argv);

  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) { console.error('Usage: quality.mjs <dir> [--archetype a] [--json] [--record] [--gate --min N] [--baseline prev.json]\n       quality.mjs --trend [--history file] [--last N]'); process.exit(2); }
  const ai = argv.indexOf('--archetype');
  const r = assess(dir, ai > -1 ? argv[ai + 1] : null);

  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ dir, ...r }, null, 2)); }
  else {
    console.log(`Product quality — ${dir}  [${r.archetype}]`);
    console.log(`  floor (presence)   ${String(r.floor).padStart(3)}/100`);
    console.log(`  ceiling (executed) ${String(r.ceiling).padStart(3)}/100`);
    console.log(`  domain (contracts) ${r.contracts == null ? ' n/a' : String(r.contracts).padStart(3) + '/100'}`);
    console.log(`\n  OVERALL: ${r.overall}/100  (grade ${r.grade})`);
  }

  if (argv.includes('--record')) {
    try {
      appendFileSync(join(PROJ_DIR, 'metrics-history.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), key: `quality.${r.archetype}`, value: r.overall / 100, source: 'quality' }) + '\n');
      if (!argv.includes('--json')) console.log(`  recorded → ${PROJ_DIR}/metrics-history.jsonl`);
    } catch { /* ignore */ }
  }

  if (argv.includes('--gate')) {
    const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
    const min = parseFloat(get('--min') || '70');
    const baselineTotal = readBaselineOverall(get('--baseline'));
    const { ok, reason } = evaluateGate(r.overall, { min, baselineTotal });
    if (!ok) { console.error(`\ngate:quality BLOCK — ${reason}`); process.exit(1); }
    if (!argv.includes('--json')) console.log('\ngate:quality PASS');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
