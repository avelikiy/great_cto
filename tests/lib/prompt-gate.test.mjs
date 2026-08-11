// Step 5 of the loop: may a candidate prompt reach a human at all?
//
// Deliberately hard to pass. `/crystallize approve` shipped ungated for months
// and activated patterns injected into every future run of every project; the
// shape being avoided is an agent editing what it will be judged by. The gate is
// always a human — this only decides whether the human is interrupted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptGateDecision, promptGateBrief } from '../../scripts/lib/prompt-gate.mjs';

const strong = { passed: 38, n: 40, threshold: 0.67 };

test('a candidate that conclusively beats the incumbent on both splits reaches the human', () => {
  const d = promptGateDecision({ tuning: strong, holdout: { passed: 36, n: 40, threshold: 0.67 }, baseline: { rate: 0.6 } });
  assert.equal(d.raise, true);
  assert.match(d.why, /lower bound/);
});

test('a fixture diagnosis never reaches a prompt gate', () => {
  // A harness failure dressed as an agent failure produces a prompt change that
  // fixes nothing and is then defended by its own eval. Three times a low score
  // was read as an agent gap and was the harness.
  const d = promptGateDecision({
    tuning: strong, holdout: { passed: 36, n: 40, threshold: 0.67 }, baseline: { rate: 0.6 },
    diagnosis: { kind: 'fixture', why: 'every case hit the same terminal state' },
  });
  assert.equal(d.raise, false);
  assert.match(d.why, /cannot fix the harness/);
});

test('tuning must settle before a holdout run is earned', () => {
  const d = promptGateDecision({
    tuning: { passed: 11, n: 12, threshold: 0.67 },   // interval spans the bar
    holdout: { passed: 36, n: 40, threshold: 0.67 },
    baseline: { rate: 0.6 },
  });
  assert.equal(d.raise, false);
  assert.match(d.why, /tuning is inconclusive/);
});

test('an inconclusive holdout is not an improvement', () => {
  const d = promptGateDecision({ tuning: strong, holdout: { passed: 9, n: 12, threshold: 0.67 }, baseline: { rate: 0.5 } });
  assert.equal(d.raise, false);
  assert.match(d.why, /interval, not the point/);
});

test('an interval that contains the incumbent has not beaten it', () => {
  // This is the rule that would have stopped four devops iterations: 5 → 11 →
  // 12 → 11 → 10, every one of which looked like progress at the time.
  const d = promptGateDecision({
    tuning: strong,
    holdout: { passed: 36, n: 40, threshold: 0.5 },   // interval roughly [77%, 96%]
    baseline: { rate: 0.85 },                          // sits inside it
  });
  assert.equal(d.raise, false);
  assert.match(d.why, /does not clear the incumbent/);
});

test('a missing measurement is refused rather than assumed', () => {
  assert.equal(promptGateDecision({ tuning: strong }).raise, false);
  assert.equal(promptGateDecision({ holdout: strong }).raise, false);
  assert.equal(promptGateDecision({}).raise, false);
});

test('an unknown incumbent does not silently become zero', () => {
  // With no baseline the candidate still has to clear its own threshold, and the
  // brief says the incumbent is unknown rather than printing 0%.
  const d = promptGateDecision({ tuning: strong, holdout: { passed: 36, n: 40, threshold: 0.67 } });
  assert.equal(d.raise, true);
  const brief = promptGateBrief({ agent: 'architect', decision: d, evalName: 'EVAL-x' });
  assert.match(brief, /incumbent unknown/);
});

test('the brief tells the human what approving costs, before they pay it', () => {
  const d = promptGateDecision({ tuning: strong, holdout: { passed: 36, n: 40, threshold: 0.67 }, baseline: { rate: 0.6 } });
  const brief = promptGateBrief({ agent: 'architect', decision: d, evalName: 'EVAL-architect-scope-creep' });
  assert.match(brief, /gate:prompt — architect/);
  assert.match(brief, /ROTATES/, 'the rotation is a cost of approving and belongs in front of the person paying it');
  assert.match(brief, /Rejecting costs nothing/);
  assert.match(brief, /\[\d+%, \d+%\]/, 'intervals, not point estimates');
});
