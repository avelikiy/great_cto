// The pipeline machinery never asked whether a gate was approved. The dispatcher
// computed that a stage sat behind gate:arch and told the orchestrator to run
// `bd list --label gate --status open` and wait — it read nothing itself. So an
// approved gate still read as pending, and the pull view said `awaiting-gate`
// after the bead was closed.
//
// That is the real cost of gates today: approving one is not enough, someone
// must also tell the orchestrator to continue. Two human actions where the
// second carries no decision.
//
// Every test below is about POLARITY, because every way of being wrong here is
// on the same side: a gate read as approved when it was not lets an ungated
// operation through, which is the class ADR-009 exists for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateState, gateStates, titleNamesGate, readGateBeads } from '../../scripts/lib/gate-state.mjs';

const bead = (title, status, updated_at, id = 'b1') => ({ id, title, status, updated_at });
const RAISED = '2026-08-06T10:00:00Z';

// ── the approving case ─────────────────────────────────────────────────────

test('a gate closed after the verdict is approved', () => {
  const r = gateState('gate:arch', [bead('gate:arch — pipeline-position review', 'closed', '2026-08-06T11:00:00Z')], { verdictTs: RAISED });
  assert.equal(r.state, 'approved');
  assert.match(r.why, /approved/);
});

// ── every non-approving case, which must all behave the same ───────────────

test('an absent gate is NOT approval', () => {
  // Silence is the dangerous reading: the question was never asked, and taking
  // that as a yes is how an ungated operation ships.
  const r = gateState('gate:ship', [bead('gate:arch — something else', 'closed', '2026-08-06T11:00:00Z')], { verdictTs: RAISED });
  assert.equal(r.state, 'absent');
  assert.match(r.why, /never|not been asked/i);
});

test('an open gate is pending', () => {
  assert.equal(gateState('gate:arch', [bead('gate:arch — x', 'open', '2026-08-06T11:00:00Z')], { verdictTs: RAISED }).state, 'pending');
});

test('a blocked or in-progress gate is pending, not approved', () => {
  for (const s of ['blocked', 'in_progress', 'in-progress']) {
    assert.equal(gateState('gate:arch', [bead('gate:arch — x', s, '2026-08-06T11:00:00Z')], { verdictTs: RAISED }).state, 'pending', s);
  }
});

test('an unrecognised status is pending, not approved', () => {
  // A status this reader does not know must not be optimistically accepted.
  const r = gateState('gate:arch', [bead('gate:arch — x', 'wontfix', '2026-08-06T11:00:00Z')], { verdictTs: RAISED });
  assert.equal(r.state, 'pending');
  assert.match(r.why, /unrecognised/);
});

test('a gate closed BEFORE the verdict approved an earlier run', () => {
  // gate:plan closed for one feature must not wave through the next one.
  const r = gateState('gate:plan', [bead('gate:plan — weekly-digest', 'closed', '2026-08-01T09:00:00Z')], { verdictTs: RAISED });
  assert.equal(r.state, 'stale');
  assert.match(r.why, /earlier run/);
});

// ── which bead speaks for the gate ─────────────────────────────────────────

test('the newest bead decides, so a new run reopens a gate an old bead closed', () => {
  const r = gateState('gate:arch', [
    bead('gate:arch — last feature', 'closed', '2026-08-01T09:00:00Z', 'old'),
    bead('gate:arch — this feature', 'open', '2026-08-06T11:00:00Z', 'new'),
  ], { verdictTs: RAISED });
  assert.equal(r.state, 'pending');
  assert.equal(r.bead.id, 'new');
});

test('gate names match on the whole segment, not a prefix', () => {
  assert.ok(titleNamesGate('gate:arch — x', 'gate:arch'));
  assert.ok(titleNamesGate('gate:arch — x', 'arch'), 'callers pass both bare and prefixed names');
  assert.ok(!titleNamesGate('gate:architecture-review — x', 'gate:arch'),
    'a longer gate name is a different gate');
  assert.ok(!titleNamesGate('note about gate:arch', 'gate:arch'), 'the title must NAME the gate, not mention it');
});

// ── failing safe ───────────────────────────────────────────────────────────

test('an unreadable store yields no beads, which reads as absent, which waits', () => {
  // A gate that cannot be read is a gate that has not been approved.
  assert.deepEqual(readGateBeads({ cwd: '/nonexistent-path-for-this-test', timeoutMs: 500 }), []);
  assert.equal(gateState('gate:arch', [], { verdictTs: RAISED }).state, 'absent');
  assert.equal(gateState('gate:arch', null).state, 'absent');
});

test('an unparseable date does not become an approval', () => {
  const r = gateState('gate:arch', [bead('gate:arch — x', 'closed', 'not-a-date')], { verdictTs: RAISED });
  assert.equal(r.state, 'approved', 'an unreadable close time falls back to the status, which is closed');
  const r2 = gateState('gate:arch', [bead('gate:arch — x', 'closed', '2026-08-06T11:00:00Z')], { verdictTs: 'not-a-date' });
  assert.equal(r2.state, 'approved');
});

test('several gates on one edge are resolved from one read', () => {
  const beads = [
    bead('gate:qa — x', 'closed', '2026-08-06T11:00:00Z'),
    bead('gate:ship — x', 'open', '2026-08-06T11:00:00Z'),
  ];
  const st = gateStates(['gate:qa', 'gate:ship'], beads, { verdictTs: RAISED });
  assert.equal(st['gate:qa'].state, 'approved');
  assert.equal(st['gate:ship'].state, 'pending', 'one approved gate does not carry the edge');
});
