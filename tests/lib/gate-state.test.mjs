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
  assert.ok(titleNamesGate('  gate:ARCH — x', 'gate:arch'), 'titles are written by hand; case and leading space are not a different gate');
  assert.ok(titleNamesGate('gate:arch', 'gate:arch'), 'a title with no description still names its gate');
  assert.ok(!titleNamesGate('gate:architecture-review — x', 'gate:arch'),
    'a longer gate name is a different gate');
  assert.ok(!titleNamesGate('note about gate:arch', 'gate:arch'), 'the title must NAME the gate, not mention it');
});

// ── HIGH-3: the two ways the regex version got this wrong ──────────────────
//
// Both filed by security review and reproduced before the fix. Neither had a
// live collision among today's gate names — which is why it was HIGH, and why
// it would have become real the day someone added `gate:arch-review` beside
// `gate:arch`. The name is now PARSED and compared as a string, so there is no
// pattern to escape and no boundary to get wrong.

test('a metacharacter in a gate name is not a wildcard', () => {
  // The escape of the caller's name did not work: `gate:a.b` matched `gate:aXb`.
  assert.ok(!titleNamesGate('gate:aXb — x', 'gate:a.b'));
  assert.ok(titleNamesGate('gate:a.b — x', 'gate:a.b'), 'and the literal name still matches itself');
  for (const g of ['gate:a+b', 'gate:a*b', 'gate:a|b', 'gate:a(b']) {
    assert.ok(!titleNamesGate('gate:aXb — x', g), g);
  }
});

test('a hyphen ends a word but not a gate name', () => {
  // `\b` is a word boundary, so `gate:arch` matched `gate:arch-review`.
  assert.ok(!titleNamesGate('gate:arch-review — x', 'gate:arch'));
  assert.ok(!titleNamesGate('gate:ship-it — x', 'gate:ship'));
  assert.ok(titleNamesGate('gate:arch-review — x', 'gate:arch-review'), 'the longer gate still matches itself');
});

test('the description cannot smuggle a different gate name', () => {
  // Only the first segment counts; everything after the separator is prose.
  assert.ok(!titleNamesGate('gate:arch — actually about gate:ship', 'gate:ship'));
  assert.ok(titleNamesGate('gate:arch — actually about gate:ship', 'gate:arch'));
});

// ── failing safe ───────────────────────────────────────────────────────────

test('an unreadable store yields no beads, which is not approval, which waits', () => {
  // A gate that cannot be read is a gate that has not been approved. That is the
  // property, and it is unchanged.
  //
  // What changed: the failure used to be indistinguishable from an empty store,
  // so the reason given was "the question has not been asked" — which sends a
  // reader off to raise a second gate bead, when the gate may exist and be
  // approved and beads simply did not answer. The read now returns an empty
  // array CARRYING `unreadable`, so iterating still yields nothing (the safe
  // direction) while anyone who asks gets the truth.
  const r = readGateBeads({ cwd: '/nonexistent-path-for-this-test', timeoutMs: 500 });
  assert.deepEqual([...r], [], 'iterating a failed read must still yield no beads');
  assert.equal(r.unreadable, true, 'and it must say that it failed rather than being empty');

  // The safety property, asserted directly rather than via the name of a state:
  // whatever it is called, it must not be approval.
  assert.notEqual(gateState('gate:arch', r).state, 'approved');

  // A store that answered, and had nothing, is still absent.
  assert.equal(gateState('gate:arch', [], { verdictTs: RAISED }).state, 'absent');
  assert.equal(gateState('gate:arch', null).state, 'absent');
});

test('an unparseable date does not become an approval', () => {
  // This test's NAME was right and both its assertions were the other way round,
  // and it shipped green — so "gate-state tests: all passing" bought exactly the
  // confidence the bug should have denied. Security review found it by reading
  // the code rather than the suite. A test that pins the defect its own title
  // forbids is worse than no test.
  assert.equal(gateState('gate:arch', [bead('gate:arch — x', 'closed', 'not-a-date')], { verdictTs: RAISED }).state,
    'stale', 'a close time that cannot be read cannot be shown to be after the verdict');
  assert.equal(gateState('gate:arch', [bead('gate:arch — x', 'closed', '2026-08-06T11:00:00Z')], { verdictTs: 'not-a-date' }).state,
    'stale', 'a verdict time that cannot be read cannot be shown to precede the approval');
  assert.equal(gateState('gate:arch', [bead('gate:arch — x', 'closed', '')], { verdictTs: RAISED }).state,
    'stale', 'a blank updated_at from an export quirk needs no attacker');
});

test('a back-dated verdict cannot make an old approval cover a new run', () => {
  // The first security reproduction, and the one that needed no bd access: an
  // agent writes its own verdict timestamp, and `closed AFTER the verdict` is
  // trivially true of every gate ever closed once the verdict claims to be from
  // 1970. The check meant to stop an old approval carrying a new run did the
  // opposite.
  const NOW = Date.parse('2026-08-06T12:00:00Z');
  const closed = [bead('gate:ship — x', 'closed', '2026-08-06T09:00:00Z')];
  assert.equal(gateState('gate:ship', closed, { verdictTs: '1970-01-01T00:00:00Z', now: NOW }).state, 'stale');
  assert.equal(gateState('gate:ship', closed, { verdictTs: '2027-01-01T00:00:00Z', now: NOW }).state, 'stale',
    'a future-dated verdict is equally impossible to have been approved');
  assert.equal(gateState('gate:ship', closed, { verdictTs: '2026-08-06T08:00:00Z', now: NOW }).state, 'approved',
    'the ordinary case must still pass, or the bound is just a refusal');
});

test('an open gate outranks a newer closed one with a matching title', () => {
  // The second security reproduction. Selecting the newest matching bead let a
  // second `gate:ship — …` bead, closed later, silently answer for the CTO's
  // real still-open one. A later close cannot answer an earlier question.
  const r = gateState('gate:ship', [
    { id: 'real-42', title: 'gate:ship — deploy X', status: 'open', updated_at: '2026-08-01T10:00:00Z' },
    { id: 'forged-99', title: 'gate:ship — unrelated note', status: 'closed', updated_at: '2026-08-06T09:00:00Z' },
  ], { verdictTs: '2026-08-01T09:00:00Z' });
  assert.equal(r.state, 'pending');
  assert.equal(r.bead.id, 'real-42', 'the report must name the bead that is actually blocking');
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
