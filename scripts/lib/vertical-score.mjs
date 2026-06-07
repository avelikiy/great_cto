// scripts/lib/vertical-score.mjs — service-autopilot vertical quality scorer (0–100).
//
// Dogfoods the service-autopilot doctrine on the verticals themselves: a vertical's quality is a
// MEASURED accuracy-SLA over a golden set, never a declared number. Seven weighted dimensions:
//
//   1 structural integrity        10   pack wired (deterministic)
//   2 detection recall            30   planted/adversarial case → BLOCKED + right finding
//   3 precision / low-FP          15   benign case → not blocked (no over-firing)
//   4 gate correctness            15   right human-gate emitted on must-escalate cases
//   5 citation / domain accuracy  15   named statutes/controls real + current (LLM judge)
//   6 coverage completeness       10   no missing major regime (LLM judge)
//   7 EVAL-suite efficacy          5   pack ships a non-trivial EVAL suite (deterministic proxy)
//
// Pure: no I/O, no API. The runner (scripts/eval/vertical-scorecard.mjs) gathers the inputs.
// A dimension whose input is absent (e.g. behavioural not run without an API key) is reported as
// `measured: false` and EXCLUDED from the headline — partial runs never inflate the score.

export const WEIGHTS = Object.freeze({
  structural: 10,
  recall: 30,
  precision: 15,
  gate: 15,
  citation: 15,
  coverage: 10,
  evalSuite: 5,
});

const SHIP_READY = 85;
const NEEDS_WORK = 70;

/** Headline band — only meaningful on a COMPLETE run. */
export function band(score, complete) {
  if (!complete) return 'incomplete';
  if (score >= SHIP_READY) return 'ship-ready';
  if (score >= NEEDS_WORK) return 'needs-work';
  return 'do-not-ship';
}

const frac = (num, den) => (den > 0 ? num / den : null);

/** A planted/adversarial case is "caught" if the reviewer BLOCKED and matched ≥1 expected keyword. */
function isCaught(c) {
  return String(c.verdict).toUpperCase() === 'BLOCKED' && (c.matchedKeywords || []).length > 0;
}

/**
 * Score one vertical.
 * @param {{
 *   structural?: { wired: boolean },
 *   evalSuite?:  { declaredCases: number },
 *   caseResults?: Array<{ id, kind:'planted'|'benign'|'adversarial', verdict, matchedKeywords?, expectGate?, gateEmitted? }>,
 *   judge?: { citationAccuracy: number, coverageCompleteness: number } | null
 * }} input
 */
export function scoreVertical(input = {}) {
  const { structural, evalSuite, caseResults, judge } = input;
  const dims = [];

  const add = (key, fraction, note, measured) => {
    const w = WEIGHTS[key];
    const f = measured ? Math.max(0, Math.min(1, fraction)) : 0;
    dims.push({ dim: key, weight: w, fraction: measured ? f : null, points: measured ? +(w * f).toFixed(2) : 0, measured, note });
  };

  // 1 — structural (deterministic)
  if (structural && typeof structural.wired === 'boolean') {
    add('structural', structural.wired ? 1 : 0, structural.wired ? 'wired' : 'NOT wired', true);
  } else add('structural', 0, 'not checked', false);

  // 2/3/4 — behavioural (need caseResults)
  const cases = Array.isArray(caseResults) ? caseResults : null;
  if (cases && cases.length) {
    const mustCatch = cases.filter((c) => c.kind === 'planted' || c.kind === 'adversarial');
    const benign = cases.filter((c) => c.kind === 'benign');
    const gateCases = cases.filter((c) => c.expectGate);

    add('recall', frac(mustCatch.filter(isCaught).length, mustCatch.length) ?? 0,
      `${mustCatch.filter(isCaught).length}/${mustCatch.length} planted+adversarial caught`, mustCatch.length > 0);

    const benignPassed = benign.filter((c) => String(c.verdict).toUpperCase() !== 'BLOCKED').length;
    add('precision', frac(benignPassed, benign.length) ?? 0,
      `${benignPassed}/${benign.length} benign not over-blocked`, benign.length > 0);

    const gateOk = gateCases.filter((c) => c.gateEmitted).length;
    add('gate', frac(gateOk, gateCases.length) ?? 0,
      `${gateOk}/${gateCases.length} must-escalate cases emitted the gate`, gateCases.length > 0);
  } else {
    add('recall', 0, 'behavioural not run (no caseResults)', false);
    add('precision', 0, 'behavioural not run', false);
    add('gate', 0, 'behavioural not run', false);
  }

  // 5/6 — LLM judge
  if (judge && typeof judge.citationAccuracy === 'number') {
    add('citation', judge.citationAccuracy, `citation accuracy ${(judge.citationAccuracy * 100).toFixed(0)}%`, true);
  } else add('citation', 0, 'judge not run', false);
  if (judge && typeof judge.coverageCompleteness === 'number') {
    add('coverage', judge.coverageCompleteness, `coverage ${(judge.coverageCompleteness * 100).toFixed(0)}%`, true);
  } else add('coverage', 0, 'judge not run', false);

  // 7 — EVAL-suite efficacy (deterministic proxy: ≥5 declared cases = full marks)
  if (evalSuite && typeof evalSuite.declaredCases === 'number') {
    add('evalSuite', evalSuite.declaredCases / 5, `${evalSuite.declaredCases} EVAL case(s) declared`, true);
  } else add('evalSuite', 0, 'not checked', false);

  const measured = dims.filter((d) => d.measured);
  const score = +measured.reduce((s, d) => s + d.points, 0).toFixed(2);
  const maxPossible = measured.reduce((s, d) => s + d.weight, 0);
  const complete = measured.length === dims.length;
  // Normalised view over the dimensions that WERE measured (for partial runs).
  const normalized = maxPossible > 0 ? +((score / maxPossible) * 100).toFixed(1) : 0;

  return { score, maxPossible, normalized, complete, band: band(score, complete), breakdown: dims };
}

/** One-line-per-dimension text report. */
export function formatScorecard(vertical, result) {
  const out = [`=== Vertical scorecard: ${vertical} ===`];
  for (const d of result.breakdown) {
    const pts = d.measured ? `${d.points}/${d.weight}` : `–/${d.weight}`;
    out.push(`  ${d.measured ? '•' : '·'} ${d.dim.padEnd(11)} ${pts.padStart(7)}  ${d.note}`);
  }
  if (result.complete) {
    out.push(`\n  SCORE: ${result.score}/100  →  ${result.band.toUpperCase()}`);
  } else {
    out.push(`\n  PARTIAL: ${result.score}/${result.maxPossible} measured (${result.normalized}% of measured)  — behavioural/judge not run`);
    out.push(`  (set OPENROUTER_API_KEY for the full 0–100 score)`);
  }
  return out.join('\n');
}

// Dimensions that are deterministic enough to gate on (verdict + keyword based). The LLM-judge
// dims (citation/coverage) carry run-to-run variance and are advisory, not gating.
export const STABLE_DIMS = Object.freeze(['recall', 'precision', 'gate']);

/** Sum of points across the stable, gate-worthy dimensions (max 60). */
export function stableSubscore(result) {
  return +result.breakdown
    .filter((d) => STABLE_DIMS.includes(d.dim) && d.measured)
    .reduce((s, d) => s + d.points, 0)
    .toFixed(2);
}

/**
 * Regression gate: a prompt/pack change must not drop the stable subscore below its baseline by
 * more than `tolerance` (absorbs borderline-case + actor variance). Judge dims are excluded.
 * @returns {{ pass: boolean, drop: number, baseline: number, current: number, message: string }}
 */
export function regressionGate(baselineStable, currentStable, { tolerance = 5 } = {}) {
  const drop = +(baselineStable - currentStable).toFixed(2);
  const pass = drop <= tolerance;
  const delta = (-drop >= 0 ? '+' : '') + (-drop).toFixed(2);
  return {
    pass, drop, baseline: baselineStable, current: currentStable,
    message: pass
      ? `OK — stable subscore ${currentStable}/60 (baseline ${baselineStable}, Δ ${delta}, tol ±${tolerance})`
      : `REGRESSION — stable subscore ${currentStable}/60 dropped ${drop} below baseline ${baselineStable} (tol ±${tolerance}). A reviewer/pack change degraded detection, precision, or gating.`,
  };
}
