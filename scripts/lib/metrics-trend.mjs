// scripts/lib/metrics-trend.mjs — persist metric snapshots + alert on drift (DEEPEN W2).
//
// Why it exists: gov-metrics and the eval runner print point-in-time numbers and
// throw them away — their own warnings (e.g. R2-share < 40%, eval pass-rate drop)
// can never show a TREND or fire on a delta. This appends dated rows to
// .great_cto/metrics-history.jsonl (never truncated) and flags any metric whose
// latest value drifts beyond a threshold from its trailing-window baseline.
//
// Row format (one JSON object per line):
//   {"ts":"2026-06-27T17:00:00Z","key":"eval_pass_rate","value":0.92,"source":"runner"}
//
// Usage:
//   node scripts/lib/metrics-trend.mjs record --key eval_pass_rate --value 0.92 --source runner
//   node scripts/lib/metrics-trend.mjs record --json '{"eval_pass_rate":0.92,"r2_share":0.45}' --source gov-metrics
//   node scripts/lib/metrics-trend.mjs check --window 5 --threshold 0.1
//
// `check` exits 1 if any metric drifted beyond threshold (alert), else 0.

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const HISTORY_PATH = join(PROJ_DIR, 'metrics-history.jsonl');

/** Parse a metrics-history JSONL string into rows (skips blank/malformed). */
export function parseHistory(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o.key === 'string' && typeof o.value === 'number') out.push(o);
    } catch { /* skip */ }
  }
  return out;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Per-key drift vs the trailing window (excluding the latest point).
 * @param {Array<{key,value}>} rows  chronological (oldest→newest)
 * @param {object} [opts]
 * @param {number} [opts.window=5]      how many prior points form the baseline
 * @param {number} [opts.threshold=0.1] absolute drift that triggers an alert
 * @returns {Array<{key,latest,baseline,drift,n,alert}>}
 */
export function detectDrift(rows, opts = {}) {
  const window = Number.isFinite(opts.window) ? opts.window : 5;
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.1;
  const byKey = new Map();
  for (const r of rows) {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r.value);
  }
  const out = [];
  for (const [key, values] of byKey) {
    if (values.length < 2) {
      out.push({ key, latest: values[values.length - 1], baseline: null, drift: 0, n: values.length, alert: false });
      continue;
    }
    const latest = values[values.length - 1];
    const priors = values.slice(0, -1).slice(-window);
    const baseline = mean(priors);
    const drift = latest - baseline;
    out.push({ key, latest, baseline: round(baseline), drift: round(drift), n: values.length, alert: Math.abs(drift) > threshold });
  }
  return out;
}

function round(n) { return Math.round(n * 10000) / 10000; }

// ── CLI ───────────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

function appendRows(rows) {
  for (const r of rows) appendFileSync(HISTORY_PATH, JSON.stringify(r) + '\n');
}

function cmdRecord(argv) {
  const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
  const source = get('--source') || 'manual';
  const ts = nowIso();
  const jsonArg = get('--json');
  const rows = [];
  if (jsonArg) {
    let obj;
    try { obj = JSON.parse(jsonArg); } catch { console.error('ERROR: --json must be valid JSON'); process.exit(2); }
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') rows.push({ ts, key, value, source });
    }
  } else {
    const key = get('--key');
    const value = parseFloat(get('--value'));
    if (!key || !Number.isFinite(value)) { console.error('Usage: record --key K --value N [--source S]  |  record --json \'{...}\''); process.exit(2); }
    rows.push({ ts, key, value, source });
  }
  appendRows(rows);
  console.log(`metrics-trend: recorded ${rows.length} metric(s) → ${HISTORY_PATH}`);
  process.exit(0);
}

function cmdCheck(argv) {
  const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
  const window = parseInt(get('--window') || '5', 10);
  const threshold = parseFloat(get('--threshold') || '0.1');
  if (!existsSync(HISTORY_PATH)) { console.log('metrics-trend: no history yet — nothing to check.'); process.exit(0); }

  const rows = parseHistory(readFileSync(HISTORY_PATH, 'utf8'));
  const drifts = detectDrift(rows, { window, threshold });
  console.log(`metrics-trend: ${drifts.length} metric(s), window=${window}, threshold=${threshold}`);
  let alerts = 0;
  for (const d of drifts) {
    const arrow = d.drift > 0 ? '▲' : d.drift < 0 ? '▼' : '·';
    const tag = d.alert ? ' ⚠ DRIFT' : '';
    console.log(`  ${arrow} ${d.key}: ${d.latest}${d.baseline !== null ? ` vs baseline ${d.baseline} (Δ${d.drift >= 0 ? '+' : ''}${d.drift})` : ' (first point)'}${tag}`);
    if (d.alert) alerts++;
  }
  if (alerts > 0) { console.error(`\nmetrics-trend: ${alerts} metric(s) drifted beyond ${threshold}.`); process.exit(1); }
  console.log('metrics-trend: no drift beyond threshold.');
  process.exit(0);
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'record') return cmdRecord(argv.slice(1));
  if (cmd === 'check') return cmdCheck(argv.slice(1));
  console.error('Usage: metrics-trend.mjs <record|check> [...]');
  process.exit(2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
