#!/usr/bin/env node
/**
 * eval-power — what three binary trials can and cannot tell you.
 *
 * Why this exists
 * ---------------
 * A full run on 2026-08-03 moved 26 of 75 evals, every one of them by exactly
 * one case: 1.00 → 0.67 or 0.67 → 0.33. Sixteen down, ten up. The regressions
 * did not cluster on the agents whose prompts had been edited — ten of the
 * sixteen were agents nobody touched, and one was a component eval with no agent
 * at all. That is the signature of sampling, not of change.
 *
 * With three holdout cases the resolution is 0.33, and a `2/3` threshold sits
 * exactly at that resolution: one case flipping turns pass into fail. Decisions
 * about prompt edits were being read off a number whose smallest possible step
 * was larger than the effect being looked for.
 *
 * So the verdict stops being binary when the evidence is not. The vocabulary
 * already exists (scripts/lib/proof-status.mjs): a run whose confidence interval
 * spans the threshold is INCONCLUSIVE — the check ran and settled nothing, which
 * is a different thing to report and a different thing to fix than a failure.
 *
 * Wilson score rather than the normal approximation: at n=3 the normal
 * approximation gives intervals that leave [0,1], which is how a suite ends up
 * reporting a negative pass rate.
 *
 * CLI:
 *   node scripts/lib/eval-power.mjs --passed 2 --n 3 --threshold 0.67
 *   node scripts/lib/eval-power.mjs --resolve 0.15    # cases needed
 */

import { PROOF } from './proof-status.mjs';

/**
 * Wilson score interval for a binomial proportion.
 *
 * @param {number} passed
 * @param {number} n
 * @param {number} [z] 1.96 = 95%
 * @returns {{point: number, low: number, high: number, width: number}|null}
 */
export function wilson(passed, n, z = 1.96) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!Number.isFinite(passed) || passed < 0 || passed > n) return null;
  const p = passed / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const low = Math.max(0, centre - half);
  const high = Math.min(1, centre + half);
  return { point: p, low, high, width: high - low };
}

/**
 * Verdict for a run against its own threshold.
 *
 * The rule: the interval must clear the bar, not the point estimate. An interval
 * that spans the threshold is a result the run did not settle — reporting it as
 * a pass or a fail is asserting something the sample size cannot support.
 *
 * @returns {{status, point, low, high, n, threshold, why}}
 */
/**
 * The share of cases that never reached the provider, and whether they left in
 * a block.
 *
 * A confirmation run on devops reported PASS at 88% having lost eleven of forty
 * cases — and the eleven were H27 and then H31 through H40 unbroken: the run did
 * not drop cases, it stopped. Eight of the errors were `402 insufficient
 * credits`. What survived was the FIRST part of the case list, and in that eval
 * the tail is the newest and hardest material, so the surviving sample was
 * easier than the one that was asked for.
 *
 * Two different faults, so two signals:
 *
 *  - **rate** — scattered timeouts. Independent of case content, so the estimate
 *    is probably unbiased, but n is smaller than the report implies.
 *  - **tail** — a contiguous run to the end of the list. Not noise: the run was
 *    cut off, and the sample is a prefix rather than a subset. Severe at any
 *    rate, because a prefix is not a random sample of the cases.
 *
 * `orderedNums` must be the case order as run; without it only the rate is
 * judged, and a cut-off run reads as scattered loss.
 */
export const DROPOUT_LIMIT = 0.15;

export function dropout({ skippedNums = [], orderedNums = [], skipped, attempted } = {}) {
  const total = Number.isFinite(attempted) ? attempted : orderedNums.length;
  const lost = Number.isFinite(skipped) ? skipped : skippedNums.length;
  if (!total) return { rate: 0, lost: 0, attempted: 0, tail: false, severe: false, why: null };

  const rate = lost / total;
  // A tail: every case from some index to the end is missing, and it is more
  // than one case (a single trailing failure is ordinary noise).
  const gone = new Set(skippedNums.map(String));
  let run = 0;
  for (let i = orderedNums.length - 1; i >= 0 && gone.has(String(orderedNums[i])); i--) run++;
  const tail = run >= 2;

  const severe = tail || rate > DROPOUT_LIMIT;
  const why = !severe ? null
    : tail
      ? `the run stopped: the last ${run} case(s) never reached the provider, so the sample is the start of the list rather than a draw from it`
      : `${lost} of ${total} case(s) never reached the provider (${(rate * 100).toFixed(0)}%)`;
  return { rate, lost, attempted: total, tail, tailRun: run, severe, why };
}

export function verdict(passed, n, threshold, { z = 1.96, dropout: drop = null } = {}) {
  // A settled verdict over a measurement that did not happen is the failure this
  // whole module exists to stop; dropout is the same fault by a different route.
  if (drop?.severe) {
    const ci = wilson(passed, n, z);
    return { ...(ci ?? { point: null, low: null, high: null, width: null }),
      status: PROOF.INCONCLUSIVE, n, threshold: threshold ?? null,
      why: `${drop.why} — the rate is over what ran, not over what was asked for` };
  }
  const ci = wilson(passed, n, z);
  if (!ci) return { status: PROOF.NOT_RUN, point: null, low: null, high: null, n, threshold, why: 'no cases ran' };
  if (threshold === null || threshold === undefined || !Number.isFinite(threshold)) {
    return { ...ci, status: PROOF.INCONCLUSIVE, n, threshold: null,
      why: 'no numeric threshold — a bar nobody can parse must not become one everything clears' };
  }
  if (ci.low >= threshold) {
    return { ...ci, status: PROOF.PASSED, n, threshold,
      why: `even the low end of the interval (${ci.low.toFixed(2)}) clears ${threshold.toFixed(2)}` };
  }
  if (ci.high < threshold) {
    return { ...ci, status: PROOF.FAILED, n, threshold,
      why: `even the high end (${ci.high.toFixed(2)}) is below ${threshold.toFixed(2)}` };
  }
  return { ...ci, status: PROOF.INCONCLUSIVE, n, threshold,
    why: `the interval [${ci.low.toFixed(2)}, ${ci.high.toFixed(2)}] spans ${threshold.toFixed(2)} — ` +
         `${n} case(s) cannot settle this` };
}

/**
 * How many trials are needed before an interval is narrower than `resolution`?
 *
 * Answered at p=0.5, the widest case — the honest planning number, since an eval
 * near its threshold is exactly where p is near the middle.
 */
export function casesFor(resolution, { z = 1.96 } = {}) {
  if (!Number.isFinite(resolution) || resolution <= 0 || resolution >= 1) return null;
  for (let n = 1; n <= 10000; n++) {
    const ci = wilson(Math.round(n / 2), n, z);
    if (ci && ci.width <= resolution) return n;
  }
  return null;
}

/** The smallest change one case can produce — the floor on what a run can see. */
export function stepSize(n) {
  return (Number.isFinite(n) && n > 0) ? 1 / n : null;
}

export function explain(v) {
  if (v.status === PROOF.NOT_RUN) return 'not run — nothing was measured';
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  const head = `${v.status.toUpperCase()} — ${pct(v.point)} of ${v.n} ` +
               `(95% CI ${pct(v.low)}–${pct(v.high)})`;
  const lines = [head, `  ${v.why}`];
  if (v.status === PROOF.INCONCLUSIVE && v.threshold != null) {
    const need = casesFor(Math.abs(v.point - v.threshold) * 2 || 0.2);
    if (need) lines.push(`  ${need} case(s) would resolve a gap this size; you have ${v.n}`);
    lines.push(`  one case is worth ${(stepSize(v.n) * 100).toFixed(0)} points here — ` +
               'a run cannot see an effect smaller than its own step');
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const num = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : null;
  };

  const resolve = num('--resolve');
  if (resolve !== null) {
    const n = casesFor(resolve);
    console.log(n === null
      ? `--resolve must be between 0 and 1`
      : `${n} case(s) to resolve ${(resolve * 100).toFixed(0)} points at 95% confidence (worst case, p=0.5)`);
    return 0;
  }

  const passed = num('--passed');
  const n = num('--n');
  const threshold = num('--threshold');
  if (passed === null || n === null) {
    console.error('usage: eval-power.mjs --passed <k> --n <n> [--threshold <0..1>]');
    console.error('       eval-power.mjs --resolve <0..1>');
    return 2;
  }
  const v = verdict(passed, n, threshold);
  if (argv.includes('--json')) console.log(JSON.stringify(v, null, 2));
  else console.log(explain(v));
  return v.status === PROOF.FAILED ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
