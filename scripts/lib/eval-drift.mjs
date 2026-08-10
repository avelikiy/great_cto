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

/**
 * Parse results-history.jsonl → rows {eval, rate, stddev, split, samples}.
 *
 * `split` and `samples` used to be dropped here, and dropping them is what made
 * this detector compare apples with oranges. The history holds 285 holdout rows,
 * 148 full-split rows and 5 tuning rows interleaved; a scheduled
 * `--split holdout --samples 3` run was compared against whatever happened to
 * run last, which on this machine was often a one-sample full-split run. The
 * resulting "regressions" of -0.4 and -0.5 were two different questions being
 * subtracted from each other.
 */
export function parseEvalHistory(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o.eval === 'string' && typeof o.rate === 'number') {
        // A file whose cases never reached the provider carries `rate: 0` and a
        // severe dropout. The runner no longer writes those, but 13 are already
        // in this history from the run that found the problem, and a detector
        // that trusts what is on disk must still refuse them: they would read as
        // thirteen evals collapsing to zero overnight, which is an empty wallet
        // rather than a regression.
        if (o.dropout?.severe) continue;
        out.push({
          eval: o.eval,
          rate: o.rate,
          stddev: Number(o.stddev) || 0,
          split: typeof o.split === 'string' ? o.split : null,
          samples: Number(o.samples) || 1,
        });
      }
    } catch { /* skip */ }
  }
  return out;
}

/** Only the rows that answer the same question as the run being judged. */
export function sameShape(rows, { split = null } = {}) {
  if (!split) return rows;
  return rows.filter((r) => r.split === split);
}

/**
 * Mean stddev over rows where variance was ACTUALLY MEASURED, or null.
 *
 * A single-sample run reports stddev 0 because it ran the case once — there was
 * no second observation to differ from. Averaging those in produced a recent
 * mean of 0.00 across a history where 416 of 438 rows are single-sample, so the
 * gate that exists to refuse a noisy signal passed on a signal whose noise
 * nobody had measured.
 *
 * Which is this repository's oldest defect in its purest form: "0 because we did
 * not look" and "0 because it is stable" are opposite facts with identical
 * representations. So unmeasured rows are excluded, and if that leaves nothing,
 * the answer is null — unknown — and unknown must not read as quiet.
 */
export function recentNoise(rows) {
  const lastByEval = new Map();
  for (const r of rows) {
    if ((r.samples ?? 1) < 2) continue;   // variance was never observed here
    lastByEval.set(r.eval, r.stddev);
  }
  const vals = [...lastByEval.values()];
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  const get = (n, d) => { const i = argv.indexOf(n); return i > -1 ? parseFloat(argv[i + 1]) : d; };
  const window = get('--window', 5);
  const threshold = get('--threshold', 0.1);
  const maxNoise = get('--max-noise', 0.1);
  // Which run shape this is judging. The scheduled job runs `--split holdout`, so
  // it must be compared against holdout history and nothing else.
  const si = argv.indexOf('--split');
  const split = si > -1 ? argv[si + 1] : null;

  if (!existsSync(HISTORY)) { console.log('eval-drift: no results-history.jsonl yet — nothing to check.'); process.exit(0); }
  const all = parseEvalHistory(readFileSync(HISTORY, 'utf8'));
  if (all.length === 0) { console.log('eval-drift: history empty.'); process.exit(0); }
  const rows = sameShape(all, { split });
  if (rows.length === 0) {
    console.log(`eval-drift: no history for split="${split}" — nothing comparable to judge against.`);
    process.exit(0);
  }

  // GATE: refuse to alert on a noisy signal — or on one whose noise is unknown.
  const noise = recentNoise(rows);
  if (noise === null) {
    console.log('eval-drift: no multi-sample run in this history — the signal\'s noise has never been measured, '
      + 'and unmeasured is not the same as quiet. Not alerting. Re-run with --samples 3 to establish a baseline.');
    process.exit(0);
  }
  if (noise > maxNoise) {
    console.log(`eval-drift: signal too noisy to judge (recent mean stddev ${noise.toFixed(2)} > ${maxNoise}). Not alerting.`);
    process.exit(0);
  }

  // Map eval→rate into the metrics-trend drift detector.
  const drift = detectDrift(rows.map(r => ({ key: r.eval, value: r.rate })), { window, threshold });
  const alerts = drift.filter(d => d.alert);
  console.log(`eval-drift: ${drift.length} eval(s)${split ? ` in split="${split}"` : ''} of ${all.length} history rows, `
    + `window=${window}, threshold=${threshold}, noise=${noise.toFixed(2)}`);
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
