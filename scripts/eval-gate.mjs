// scripts/eval-gate.mjs — Promotion gate for agent-prompt changes.
//
// SIA insight (hexo-ai/sia, run_evaluation + FEEDBACK loop): a learned prompt
// improvement is worthless until re-run and measured against a HELD-OUT set.
// This gate compares a candidate prompt's eval results against the baseline and
// BLOCKS promotion if the candidate regresses on the holdout split or falls
// below any eval's own pass threshold.
//
// Inputs are results.jsonl files produced by tests/eval/runner.mjs --split holdout
// (one JSON object per line, fields: eval, rate, threshold, belowThreshold, split).
//
// Usage:
//   node scripts/eval-gate.mjs --baseline baseline.jsonl --candidate candidate.jsonl
//   node scripts/eval-gate.mjs --baseline b.jsonl --candidate c.jsonl --epsilon 0.02 --split holdout
//
// Exit 0 = promote (no regression). Exit 1 = block. Exit 2 = bad input.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Parse a results.jsonl string into an array of result objects (skips blank/bad lines). */
export function parseResultsJsonl(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/** Index results by eval name → result object (last one wins). */
function indexByEval(results) {
  const m = new Map();
  for (const r of results) {
    if (r && typeof r.eval === 'string') m.set(r.eval, r);
  }
  return m;
}

/**
 * Decide whether a candidate prompt may be promoted over the baseline.
 *
 * A candidate is BLOCKED if either:
 *   1. Regression — candidate.rate < baseline.rate - effectiveEpsilon on any shared eval.
 *   2. Below threshold — candidate.belowThreshold === true (or rate < threshold) on any eval.
 *
 * Variance-aware (DEEPEN-PIPELINE Wave 1): with n=1 the runner produced a single
 * coin-flip rate and epsilon=0 read any downward jitter as a hard regression. When
 * results carry a `stddev` (from runner --samples N), the tolerated drop is widened
 * to at least the combined sampling noise: effectiveEpsilon = max(epsilon, σ_base + σ_cand).
 * So a "regression" must exceed the noise floor before it blocks.
 *
 * @param {Array} baseline  baseline holdout results
 * @param {Array} candidate candidate holdout results
 * @param {object} [opts]
 * @param {number} [opts.epsilon=0]   floor tolerated rate drop before it counts as a regression
 * @param {string} [opts.split]       if set, only consider rows with this split
 * @returns {{pass:boolean, regressions:Array, belowThreshold:Array, improvements:Array, missing:Array, summary:string}}
 */
export function evaluateGate(baseline, candidate, opts = {}) {
  const epsilon = Number.isFinite(opts.epsilon) ? opts.epsilon : 0;
  const split = opts.split;
  const filt = (rows) => (split ? rows.filter(r => (r.split ?? 'all') === split || r.split === undefined) : rows);

  const base = indexByEval(filt(baseline));
  const cand = indexByEval(filt(candidate));

  const regressions = [];
  const belowThreshold = [];
  const improvements = [];
  const missing = []; // in baseline but absent from candidate

  for (const [name, c] of cand) {
    // Below-threshold check (candidate must clear its own bar)
    const below = c.belowThreshold === true ||
      (typeof c.threshold === 'number' && typeof c.rate === 'number' && c.rate < c.threshold);
    if (below) {
      belowThreshold.push({ eval: name, rate: c.rate, threshold: c.threshold });
    }

    // Regression check vs baseline, widened by sampling noise.
    const b = base.get(name);
    if (b && typeof b.rate === 'number' && typeof c.rate === 'number') {
      const noiseBand = (Number(b.stddev) || 0) + (Number(c.stddev) || 0);
      const effectiveEpsilon = Math.max(epsilon, noiseBand);
      const delta = c.rate - b.rate;
      if (delta < -effectiveEpsilon) {
        regressions.push({ eval: name, baseRate: b.rate, candRate: c.rate, delta: round(delta), effectiveEpsilon: round(effectiveEpsilon) });
      } else if (delta > effectiveEpsilon) {
        improvements.push({ eval: name, baseRate: b.rate, candRate: c.rate, delta: round(delta) });
      }
    }
  }

  for (const name of base.keys()) {
    if (!cand.has(name)) missing.push(name);
  }

  const pass = regressions.length === 0 && belowThreshold.length === 0;
  const summary =
    `${pass ? 'PROMOTE' : 'BLOCK'} — ` +
    `${regressions.length} regression(s), ${belowThreshold.length} below-threshold, ` +
    `${improvements.length} improvement(s)` +
    (missing.length ? `, ${missing.length} missing in candidate` : '');

  return { pass, regressions, belowThreshold, improvements, missing, summary };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  const out = { epsilon: 0, split: 'holdout' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') out.baseline = argv[++i];
    else if (a === '--candidate') out.candidate = argv[++i];
    else if (a === '--epsilon') out.epsilon = parseFloat(argv[++i]);
    else if (a === '--split') out.split = argv[++i];
    else if (a === '--all-splits') out.split = undefined;
  }
  return out;
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.baseline || !args.candidate) {
    console.error('Usage: node scripts/eval-gate.mjs --baseline <jsonl> --candidate <jsonl> [--epsilon N] [--split holdout|--all-splits]');
    process.exit(2);
  }

  let baseline, candidate;
  try {
    baseline = parseResultsJsonl(readFileSync(args.baseline, 'utf8'));
    candidate = parseResultsJsonl(readFileSync(args.candidate, 'utf8'));
  } catch (err) {
    console.error(`ERROR reading results: ${err.message}`);
    process.exit(2);
  }

  const result = evaluateGate(baseline, candidate, { epsilon: args.epsilon, split: args.split });

  const divider = '─'.repeat(70);
  console.log(divider);
  console.log(` Eval Promotion Gate  (split=${args.split ?? 'all'}, epsilon=${args.epsilon})`);
  console.log(divider);
  for (const r of result.improvements) console.log(`  ▲ ${r.eval}: ${pct(r.baseRate)} → ${pct(r.candRate)} (+${pct(r.delta)})`);
  for (const r of result.regressions) console.log(`  ▼ ${r.eval}: ${pct(r.baseRate)} → ${pct(r.candRate)} (${pct(r.delta)})  REGRESSION`);
  for (const r of result.belowThreshold) console.log(`  ✗ ${r.eval}: ${pct(r.rate)} < threshold ${pct(r.threshold)}  BELOW THRESHOLD`);
  for (const name of result.missing) console.log(`  ? ${name}: present in baseline, missing in candidate`);
  console.log(divider);
  console.log(` ${result.summary}`);
  console.log(divider);

  process.exit(result.pass ? 0 : 1);
}

function pct(n) {
  return typeof n === 'number' ? `${(n * 100).toFixed(0)}%` : '—';
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
