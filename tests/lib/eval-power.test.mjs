// A full run moved 26 of 75 evals, every one by exactly one case: 1.00 → 0.67
// or 0.67 → 0.33. Sixteen down, ten up, and ten of the sixteen were agents whose
// prompts nobody had touched. That is sampling, not change.
//
// With three holdout cases the resolution is 0.33 and a 2/3 threshold sits
// exactly on it, so one case flipping turns pass into fail. Prompt edits were
// being judged by a number whose smallest step was bigger than the effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wilson, verdict, casesFor, stepSize, explain } from '../../scripts/lib/eval-power.mjs';
import { PROOF } from '../../scripts/lib/proof-status.mjs';

// ── the interval ───────────────────────────────────────────────────────────

test('the interval never leaves [0,1], which the normal approximation does', () => {
  for (const [k, n] of [[0, 3], [3, 3], [1, 3], [0, 1], [1, 1]]) {
    const ci = wilson(k, n);
    assert.ok(ci.low >= 0 && ci.high <= 1, `${k}/${n} → [${ci.low}, ${ci.high}]`);
  }
});

test('three cases give an interval too wide to decide anything near the middle', () => {
  const ci = wilson(2, 3);
  assert.ok(ci.width > 0.6, `2/3 spans ${ci.width.toFixed(2)} — wider than most thresholds`);
});

test('more trials narrow it', () => {
  assert.ok(wilson(20, 30).width < wilson(2, 3).width);
  assert.ok(wilson(200, 300).width < wilson(20, 30).width);
});

test('a nonsensical count yields null rather than a number', () => {
  assert.equal(wilson(4, 3), null, 'more passes than trials is not a proportion');
  assert.equal(wilson(1, 0), null);
  assert.equal(wilson(-1, 3), null);
});

// ── the verdict ────────────────────────────────────────────────────────────

test('2 of 3 against a 0.67 bar is INCONCLUSIVE, not a pass', () => {
  // This is the case the whole module exists for: the number that decided
  // "pass" all week.
  const v = verdict(2, 3, 0.67);
  assert.equal(v.status, PROOF.INCONCLUSIVE);
  assert.match(v.why, /cannot settle/);
});

test('1 of 3 against a 0.67 bar is also INCONCLUSIVE, not a failure', () => {
  // And this is the other half: the "regressions" that triggered prompt edits.
  assert.equal(verdict(1, 3, 0.67).status, PROOF.INCONCLUSIVE);
});

test('a result far enough from the bar is decided', () => {
  assert.equal(verdict(30, 30, 0.67).status, PROOF.PASSED);
  assert.equal(verdict(0, 30, 0.67).status, PROOF.FAILED);
});

test('the low end must clear the bar, not the point estimate', () => {
  // 24/30 is 80%, which reads as comfortably above a 67% bar — and its interval
  // starts at 63%. The point estimate says pass; the evidence does not settle
  // it. This is the exact reading error the module exists to stop.
  const v = verdict(24, 30, 0.67);
  assert.equal(v.status, PROOF.INCONCLUSIVE);
  assert.ok(v.low < 0.67, 'the point is above the bar and the interval is not');
  assert.equal(verdict(28, 30, 0.67).status, PROOF.PASSED, 'a wider margin does settle it');
});

test('a threshold nobody can parse does not become one everything clears', () => {
  const v = verdict(3, 3, null);
  assert.equal(v.status, PROOF.INCONCLUSIVE);
  assert.match(v.why, /must not become one everything clears/);
});

test('no cases is NOT_RUN, which is distinct from inconclusive', () => {
  assert.equal(verdict(0, 0, 0.67).status, PROOF.NOT_RUN);
});

// ── planning ───────────────────────────────────────────────────────────────

test('the cost of a usable number is an order of magnitude above what we run', () => {
  // We run 3 holdout cases. Resolving even 33 points — the step size of those
  // three cases — takes 32. The suite is not slightly underpowered; the
  // interval at n=3 is wider than the range most thresholds sit in.
  assert.equal(casesFor(0.33), 32);
  assert.equal(casesFor(0.15), 167);
  assert.ok(wilson(2, 3).width > casesFor(0.33) / 100, 'sanity: n=3 is wide');
});

test('the step size is what a single case is worth', () => {
  assert.equal(stepSize(3).toFixed(2), '0.33');
  assert.equal(stepSize(8).toFixed(3), '0.125');
  assert.equal(stepSize(0), null);
});

test('the explanation says what one case is worth, so the reader can size the noise', () => {
  const out = explain(verdict(2, 3, 0.67));
  assert.match(out, /INCONCLUSIVE/);
  assert.match(out, /33 points/);
  assert.match(out, /cannot see an effect smaller than its own step/);
});

test('a decided verdict does not lecture about resolution', () => {
  assert.ok(!/cannot see an effect/.test(explain(verdict(30, 30, 0.67))));
});

// ─── what the current suite can and cannot establish ───────────────────────

test('at three cases a PERFECT score cannot clear a two-thirds bar', () => {
  // This is the whole finding in one assertion. 3/3 has a 95% lower bound of
  // 44%, so the best possible result at n=3 does not settle a 0.67 threshold.
  // Every "OK" the suite printed was this.
  assert.equal(verdict(3, 3, 0.67).status, PROOF.INCONCLUSIVE);
  assert.ok(wilson(3, 3).low < 0.5);
});

test('eight perfect cases is where a two-thirds bar becomes provable', () => {
  assert.equal(verdict(5, 5, 0.67).status, PROOF.INCONCLUSIVE);
  assert.equal(verdict(8, 8, 0.67).status, PROOF.PASSED);
});

test('a total failure at three cases IS conclusive', () => {
  // The asymmetry is real and useful: 0/3 puts the whole interval below the bar,
  // so the suite can prove a failure at a sample size where it cannot prove a
  // pass. Cheap runs are worth keeping for exactly that.
  assert.equal(verdict(0, 3, 0.67).status, PROOF.FAILED);
  assert.equal(verdict(1, 3, 0.67).status, PROOF.INCONCLUSIVE);
});
