// The same "we could not measure this" idea was implemented four times in four
// dialects — overall:null + unmeasured, {ok:false,reason:'unreadable'},
// tests.ran=false, and the literal string 'mutation: not configured'. Nothing
// could aggregate them and each new caller invented a fifth.
//
// These tests pin the two properties that make the enum worth having: an
// invented status fails loudly, and neither "don't know" status can be read as
// success anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROOF, PROOF_VALUES, isProofStatus, assertStatus,
  isProven, isMeasured, blocksGate, fromLegacy, describe as describeStatus,
} from '../../scripts/lib/proof-status.mjs';

test('the enum is exactly four values, and closed', () => {
  assert.deepEqual(PROOF_VALUES, ['passed', 'failed', 'not_run', 'inconclusive']);
  assert.equal(Object.isFrozen(PROOF), true, 'no fifth status can be added at runtime');
});

test('only passed counts as proven — absence of evidence is not evidence', () => {
  assert.equal(isProven(PROOF.PASSED), true);
  for (const s of [PROOF.FAILED, PROOF.NOT_RUN, PROOF.INCONCLUSIVE]) {
    assert.equal(isProven(s), false, `${s} must never read as proven`);
  }
});

test('measured distinguishes "we know" from "we do not know"', () => {
  assert.equal(isMeasured(PROOF.PASSED), true);
  assert.equal(isMeasured(PROOF.FAILED), true, 'a failure IS a measurement');
  assert.equal(isMeasured(PROOF.NOT_RUN), false);
  assert.equal(isMeasured(PROOF.INCONCLUSIVE), false);
});

test('every non-pass blocks a gate, including both unknowns', () => {
  assert.equal(blocksGate(PROOF.PASSED), false);
  for (const s of [PROOF.FAILED, PROOF.NOT_RUN, PROOF.INCONCLUSIVE]) {
    assert.equal(blocksGate(s), true, `${s} must block — a gate exists to require evidence`);
  }
});

test('an invented status is rejected loudly, not passed along', () => {
  assert.equal(isProofStatus('probably_fine'), false);
  assert.throws(() => assertStatus('probably_fine', 'qa report'), /not a proof status/);
  assert.throws(() => assertStatus(undefined), /not a proof status/);
  assert.throws(() => assertStatus('PASSED'), /not a proof status/, 'case matters — the enum is exact');
});

test('the rejection message tells the caller which status to use instead', () => {
  try { assertStatus('skipped'); assert.fail('should throw'); }
  catch (e) {
    assert.match(e.message, /not_run/);
    assert.match(e.message, /inconclusive/);
  }
});

// ── legacy mapping: the four dialects this replaces ────────────────────────

test('board reader: a missing file is not_run, not a failure', () => {
  assert.equal(fromLegacy({ ok: false, reason: 'missing' }), PROOF.NOT_RUN);
});

test('board reader: unreadable / unparsable is inconclusive — effort spent, answer unknown', () => {
  assert.equal(fromLegacy({ ok: false, reason: 'unreadable' }), PROOF.INCONCLUSIVE);
  assert.equal(fromLegacy({ ok: false, reason: 'unparsable' }), PROOF.INCONCLUSIVE);
});

test('product-eval: a suite that never ran is not_run', () => {
  assert.equal(fromLegacy({ ran: false, reason: 'no-test-script' }), PROOF.NOT_RUN);
});

test('product-eval: real counts map to passed / failed', () => {
  assert.equal(fromLegacy({ ran: true, total: 269, passed: 269, failed: 0 }), PROOF.PASSED);
  assert.equal(fromLegacy({ ran: true, total: 132, passed: 62, failed: 70 }), PROOF.FAILED);
});

test('a suite that ran but produced no countable result is inconclusive', () => {
  // The exact case that scored a 269-test suite as "1 test, and it failed".
  assert.equal(fromLegacy({ ran: true, total: 0 }), PROOF.INCONCLUSIVE);
});

test('a partial run is inconclusive, never extrapolated to a verdict', () => {
  assert.equal(fromLegacy({ ran: true, total: 40, failed: 0, partial: true }), PROOF.INCONCLUSIVE);
});

test('an empty legacy object is not_run rather than a cheerful default', () => {
  assert.equal(fromLegacy({}), PROOF.NOT_RUN);
  assert.equal(fromLegacy(), PROOF.NOT_RUN);
});

test('describe never renders an unknown as a pass', () => {
  assert.match(describeStatus(PROOF.NOT_RUN), /not a pass/);
  assert.match(describeStatus(PROOF.INCONCLUSIVE), /settles nothing/);
  assert.match(describeStatus(PROOF.PASSED), /passed/);
  assert.match(describeStatus('nonsense'), /unknown status/);
});

test('describe carries the caller detail through', () => {
  assert.match(describeStatus(PROOF.NOT_RUN, 'mutation: not configured'), /mutation: not configured/);
});
