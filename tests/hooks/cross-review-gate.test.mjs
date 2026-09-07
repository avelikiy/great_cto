// The cross-model review is only as good as the moment it is asked for.
//
// `cross-model-review.mjs` has worked since it was written, and it runs when
// somebody remembers to run it. The pipeline measured that shape once already:
// a rule that depends on the model remembering held at 18%; removing the
// remembering took it to 92%. This is that removal for the second opinion — a
// Stop hook that will not end the turn on a diff no other model has read.
//
// Three properties this file exists to hold, all learned the hard way:
//
//   1. OFF unless asked. A gate that runs a second model on every Stop bills
//      the user for it and can loop Claude against Codex; OpenAI's own plugin
//      warns about exactly that. Default off, one env var on.
//   2. "Not reviewed" and "reviewed and blocked" are different. The cross-model
//      CLI already learned this — EXIT.SKIPPED exists because PASS/BLOCK-only
//      made "the review did not happen" indistinguishable from "the review
//      objected". The gate must not re-merge them.
//   3. It blocks a diff ONCE. A hook that can refuse to end the turn forever is
//      a hang, not a guardrail — the same rule pipeline-stall-guard follows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCrossReviewGate } from '../../scripts/hooks/cross-review-gate.mjs';

const ok = (over = {}) => ({
  enabled: true, stopHookActive: false, blockedBefore: false,
  opinion: { state: 'ok', verdict: 'PASS', findings: 0, p0: 0, sha: 'abc1234', why: '' },
  ...over,
});

test('off unless explicitly enabled — the default costs the user nothing', () => {
  const d = decideCrossReviewGate(ok({ enabled: false, opinion: { state: 'unmeasured', why: 'no review line' } }));
  assert.equal(d.block, false);
  assert.match(d.why, /not enabled/i);
});

test('a diff no second model has read does not end the turn', () => {
  const d = decideCrossReviewGate(ok({ opinion: { state: 'unmeasured', why: 'declared (codex), no review line for abc1234' } }));
  assert.equal(d.block, true);
  assert.match(d.reason, /second opinion/i);
  assert.match(d.reason, /cross-model-review/, 'the reason names the command that clears it');
});

test('a review that objected blocks, and says what it found', () => {
  const d = decideCrossReviewGate(ok({ opinion: { state: 'ok', verdict: 'BLOCK', findings: 3, p0: 1, sha: 'abc1234' } }));
  assert.equal(d.block, true);
  assert.match(d.reason, /1 P0/);
  assert.ok(!/has not been reviewed/i.test(d.reason), 'a BLOCK verdict is not reported as an absence');
});

test('a review that passed lets the turn end', () => {
  assert.equal(decideCrossReviewGate(ok()).block, false);
});

test('"not reviewed" and "reviewed and blocked" never collapse into one message', () => {
  const missing = decideCrossReviewGate(ok({ opinion: { state: 'unmeasured', why: 'x' } }));
  const objected = decideCrossReviewGate(ok({ opinion: { state: 'ok', verdict: 'BLOCK', p0: 2, findings: 2 } }));
  assert.notEqual(missing.reason, objected.reason);
  assert.notEqual(missing.kind, objected.kind);
});

test('an unreadable log is neither a pass nor a verdict', () => {
  const d = decideCrossReviewGate(ok({ opinion: { state: 'unreadable', why: '4 lines predate the join key' } }));
  assert.equal(d.block, true);
  assert.equal(d.kind, 'unreadable');
  assert.match(d.reason, /predate|unreadable/i);
});

test('a project that declared no second opinion is not nagged', () => {
  const d = decideCrossReviewGate(ok({ opinion: { state: 'not-run', why: 'second_opinion: none — deliberately off' } }));
  assert.equal(d.block, false, 'declaring none is a decision, not an omission');
  assert.match(d.why, /none|not declared/i);
});

test('it blocks a given diff once, then lets the turn end', () => {
  const opinion = { state: 'unmeasured', why: 'no review line' };
  assert.equal(decideCrossReviewGate(ok({ opinion })).block, true);
  assert.equal(decideCrossReviewGate(ok({ opinion, blockedBefore: true })).block, false,
    'a hook that can refuse to end the turn indefinitely is a hang');
});

test('a Stop that is itself the result of a block never blocks again', () => {
  const d = decideCrossReviewGate(ok({ stopHookActive: true, opinion: { state: 'unmeasured', why: 'x' } }));
  assert.equal(d.block, false);
});
