// The two rungs below check facts: a named artefact exists, a named check
// re-runs and passes. Neither catches what happened twice in one session.
//
//   code-reviewer filed a P1. It was fixed. code-reviewer never looked again;
//   the person who wrote the fix declared it fixed.
//
//   security-officer filed two CRITICALs with reproductions. They were fixed.
//   The re-verification produced no output at all, and again the fixer closed
//   them.
//
// Both fixes were probably right. That is not the point: nobody independent
// looked, and a self-closed finding reads identically to a verified one in
// every report that follows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closureDecision, blockedClosures, explainClosures } from '../../scripts/lib/finding-closure.mjs';

const passing = { status: 'passed' };
const ok = {
  id: 'SEC-1', repro: 'node --test tests/lib/gate-state.test.mjs',
  fixedBy: 'senior-dev', fixedAt: '2026-08-06T10:00:00Z',
  verifiedBy: 'security-officer', verifiedAt: '2026-08-06T11:00:00Z',
  reproResult: passing,
};

test('an independent, posterior verification with a passing repro closes', () => {
  const d = closureDecision(ok);
  assert.equal(d.ok, true);
  assert.match(d.why, /independent of senior-dev/);
});

// ── the case this exists for ───────────────────────────────────────────────

test('the fixer cannot verify their own fix', () => {
  // Today's case, twice. Independence is the entire content of a re-check.
  const d = closureDecision({ ...ok, verifiedBy: 'senior-dev' });
  assert.equal(d.ok, false);
  assert.equal(d.reason, 'self-verified');
  assert.match(d.why, /same actor/);
});

test('an agent prefix does not disguise the same actor', () => {
  assert.equal(closureDecision({ ...ok, fixedBy: 'great_cto-senior-dev', verifiedBy: 'Senior-Dev' }).reason, 'self-verified');
});

test('a fix nobody verified does not close', () => {
  const d = closureDecision({ ...ok, verifiedBy: null, verifiedAt: null });
  assert.equal(d.reason, 'not-verified');
  assert.match(d.why, /reads like a reviewed one/);
});

test('a verification that predates the fix verified the bug', () => {
  const d = closureDecision({ ...ok, verifiedAt: '2026-08-06T09:00:00Z' });
  assert.equal(d.reason, 'premature');
  assert.match(d.why, /looked at the bug, not the repair/);
});

test('a finding with no reproduction cannot be shown fixed', () => {
  // The security report called its own weaker items hypotheses for this reason:
  // without a reproduction, closing is an opinion.
  const d = closureDecision({ ...ok, repro: null });
  assert.equal(d.reason, 'no-repro');
  assert.match(d.why, /hypothesis/);
});

// ── the reproduction must actually pass now ────────────────────────────────

test('a reproduction that was never re-run does not close the finding', () => {
  assert.equal(closureDecision({ ...ok, reproResult: null }).reason, 'repro-not-run');
});

test('a reproduction that still fails, times out, or was refused leaves it open', () => {
  for (const status of ['failed', 'not_run', 'refused']) {
    const d = closureDecision({ ...ok, reproResult: { status } });
    assert.equal(d.ok, false, status);
    assert.equal(d.reason, 'repro-not-passing', status);
  }
});

test('an unreadable timestamp does not become a valid ordering', () => {
  // Same polarity as the gate-state staleness rule: an order that cannot be
  // established has not been established.
  assert.equal(closureDecision({ ...ok, verifiedAt: 'not-a-date' }).reason, 'premature');
  assert.equal(closureDecision({ ...ok, fixedAt: '' }).reason, 'premature');
});

test('missing timestamps on both sides are allowed — order is unknowable, not wrong', () => {
  // A finding tracked without times is thin, but the independence rule still
  // does its work; refusing here would fail every finding in a store that does
  // not record times.
  assert.equal(closureDecision({ ...ok, fixedAt: null, verifiedAt: null }).ok, true);
});

// ── the report ─────────────────────────────────────────────────────────────

test('the report names every blocked closure and refuses to overclaim', () => {
  const out = explainClosures([ok, { ...ok, id: 'SEC-2', verifiedBy: 'senior-dev' }, { ...ok, id: 'SEC-3', repro: null }]);
  assert.match(out, /2 finding\(s\)/);
  assert.match(out, /SEC-2/);
  assert.match(out, /SEC-3/);
  assert.ok(!/SEC-1/.test(out), 'a closure that holds must not be listed');
  assert.match(out, /does not say the fixes are wrong/,
    'the check proves absence of review, not presence of a defect — claiming more would be the same overreach it exists to stop');
});

test('nothing blocked says nothing', () => {
  assert.equal(explainClosures([ok]), null);
  assert.equal(explainClosures([]), null);
  assert.deepEqual(blockedClosures(null), []);
});
