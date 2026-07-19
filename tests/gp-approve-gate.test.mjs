// `/crystallize approve` edits an agent's behaviour for every future run. It used
// to do so on the strength of the proposal's own claim: the eval that would back
// the claimed improvement was printed as a recipe AFTER activation and explicitly
// not run, because evals cost real tokens.
//
// The rule pinned here requires the evidence to EXIST, not to be generated on the
// spot — so it closes the zero-evidence hole without forcing spend. A bypass is
// allowed; a silent bypass is not; and a measured regression is never activatable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideApproval, readEvidence } from '../scripts/lib/gp-approve-gate.mjs';

test('no evidence → blocked, with the remedy in the message', () => {
  const v = decideApproval({ delta: null, confidence: null, direction: null });
  assert.equal(v.ok, false);
  assert.equal(v.evidence, 'none');
  assert.match(v.reason, /--no-eval/, 'tells the operator how to proceed deliberately');
});

test('a measured regression is blocked even WITH an override reason', () => {
  const v = decideApproval(
    { delta: -0.12, confidence: 'confident', direction: 'regression' },
    { bypassReason: 'I am sure it is fine' },
  );
  assert.equal(v.ok, false, 'an override must not activate a measured regression');
  assert.equal(v.evidence, 'regression');
  assert.match(v.reason, /REGRESSION/);
});

test('a measured improvement is allowed', () => {
  const v = decideApproval({ delta: 0.21, confidence: 'confident', direction: 'improvement' });
  assert.equal(v.ok, true);
  assert.equal(v.evidence, 'improvement');
  assert.equal(v.bypassed, false);
});

test('a noisy delta is allowed but labelled "not shown to help"', () => {
  const v = decideApproval({ delta: 0.03, confidence: 'noisy', direction: 'noisy' });
  assert.equal(v.ok, true);
  assert.equal(v.evidence, 'noisy');
  assert.match(v.reason, /not shown to help/i, 'never reported as proven');
});

test('an explicit override with a reason is allowed and marked as bypassed', () => {
  const v = decideApproval({}, { bypassReason: 'doc-only change, no runtime effect' });
  assert.equal(v.ok, true);
  assert.equal(v.bypassed, true, 'the bypass is recorded, not hidden');
  assert.match(v.reason, /doc-only change/);
});

test('an empty or whitespace override reason does not count as a reason', () => {
  for (const r of ['', '   ', null, undefined]) {
    const v = decideApproval({}, { bypassReason: r });
    assert.equal(v.ok, false, `reason ${JSON.stringify(r)} must not unlock approval`);
  }
});

test('a negative delta without an explicit direction is still treated as regression', () => {
  const v = decideApproval({ delta: -0.4, confidence: 'confident', direction: null });
  assert.equal(v.ok, false);
  assert.equal(v.evidence, 'regression');
});

test('readEvidence parses the fields gp-eval-trace stamps', () => {
  const gp = [
    '---',
    'id: GP-0009',
    'status: active',
    'eval_delta: 0.18',
    'eval_confidence: confident',
    'eval_direction: improvement',
    '---',
    '',
    '## Eval trace',
  ].join('\n');
  const e = readEvidence(gp);
  assert.equal(e.delta, 0.18);
  assert.equal(e.confidence, 'confident');
  assert.equal(e.direction, 'improvement');
  assert.equal(decideApproval(e).ok, true);
});

test('readEvidence on an unstamped pattern yields nothing, which blocks', () => {
  const gp = '---\nid: GP-0001\nstatus: active\nsymptom: things break\n---\n';
  const e = readEvidence(gp);
  assert.equal(e.delta, null);
  assert.equal(decideApproval(e).ok, false);
});
