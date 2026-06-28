// scripts/lib/eval-drift.mjs — detect eval pass-rate drift over time (DEEPEN W3.6).
//
// Reads the append-only tests/eval/results-history.jsonl and flags any eval whose
// recent pass-rate drifts beyond a threshold from its trailing-window baseline —
// the regression alarm the learning loop needs to fire automatically.
//
// GATING (load-bearing, from the design brief): drift detection is only trustworthy
// once the eval signal is. If recent runs are noisy (stddev > --max-noise, default
// 0.1), drift is indistinguishable from sampling noise — so this REFUSES to alert
// and says so, instead of emitting false positives. That guard is why scheduled
// drift must wait for the actor-fidelity fix (a9tp) to bring stddev down.
//
// Usage:
//   node scripts/lib/eval-drift.mjs [--window 5] [--threshold 0.1] [--max-noise 0.1]
// Exit 0 = no actionable drift (or signal too noisy to judge). Exit 1 = real drift.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDrift } from './metrics-trend.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY = join(__dirname, '..', '..', 'tests', 'eval', 'results-history.jsonl');

/** Parse results-history.jsonl → rows {eval, rate, stddev}. */
export function parseEvalHistory(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o.eval === 'string' && typeof o.rate === 'number') {
        out.push({ eval: o.eval, rate: o.rate, stddev: Number(o.stddev) || 0 });
      }
    } catch { /* skip */ }
  }
  return out;
}

/** Mean stddev of the most-recent point per eval — the "is the signal trustworthy" gauge. */
export function recentNoise(rows) {
  const lastByEval = new Map();
  for (const r of rows) lastByEval.set(r.eval, r.stddev); // later rows overwrite → last wins
  const vals = [...lastByEval.values()];
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  const get = (n, d) => { const i = argv.indexOf(n); return i > -1 ? parseFloat(argv[i + 1]) : d; };
  const window = get('--window', 5);
  const threshold = get('--threshold', 0.1);
  const maxNoise = get('--max-noise', 0.1);

  if (!existsSync(HISTORY)) { console.log('eval-drift: no results-history.jsonl yet — nothing to check.'); process.exit(0); }
  const rows = parseEvalHistory(readFileSync(HISTORY, 'utf8'));
  if (rows.length === 0) { console.log('eval-drift: history empty.'); process.exit(0); }

  // GATE: refuse to alert on a noisy signal.
  const noise = recentNoise(rows);
  if (noise > maxNoise) {
    console.log(`eval-drift: signal too noisy to judge (recent mean stddev ${noise.toFixed(2)} > ${maxNoise}). Not alerting — fix actor-fidelity (a9tp) first.`);
    process.exit(0);
  }

  // Map eval→rate into the metrics-trend drift detector.
  const drift = detectDrift(rows.map(r => ({ key: r.eval, value: r.rate })), { window, threshold });
  const alerts = drift.filter(d => d.alert);
  console.log(`eval-drift: ${drift.length} eval(s), window=${window}, threshold=${threshold}, noise=${noise.toFixed(2)}`);
  for (const d of drift) {
    const arrow = d.drift > 0 ? '▲' : d.drift < 0 ? '▼' : '·';
    console.log(`  ${arrow} ${d.key}: ${d.latest}${d.baseline !== null ? ` vs ${d.baseline} (Δ${d.drift >= 0 ? '+' : ''}${d.drift})` : ''}${d.alert ? ' ⚠ DRIFT' : ''}`);
  }
  if (alerts.length > 0) { console.error(`\neval-drift: ${alerts.length} eval(s) drifted beyond ${threshold}.`); process.exit(1); }
  console.log('eval-drift: no actionable drift.');
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
