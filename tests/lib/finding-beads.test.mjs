// finding-closure has the rules — a finding may not be closed by whoever fixed
// it, the verification must postdate the fix, the reproduction must now pass —
// and on 2026-08-07 it could say nothing, because findings lived in markdown
// reports. Its inputs had to be typed in by hand to make it speak, and the two
// CRITICALs it would have caught were closed by their own fixer meanwhile.
//
// A rule with no data source is a rule nobody is subject to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepro, parseActors, findingFromBead, readFindingBeads } from '../../scripts/lib/finding-beads.mjs';
import { closureDecision } from '../../scripts/lib/finding-closure.mjs';

const DESC = `Location: scripts/lib/gate-state.mjs:99
Repro: node -e 'import("./gate-state.mjs").then(m => console.log(m.gateState("gate:ship", beads)))'
Rationale: a forged closed bead outranked a real open one
Remediation: any open bead outranks every closed one`;

// ── reading the repro ──────────────────────────────────────────────────────

test('the repro is read and stops at the next field', () => {
  const r = parseRepro(DESC);
  assert.match(r, /^node -e/);
  assert.ok(!/Rationale/.test(r), 'the next field is not part of the reproduction');
});

test('a multi-line repro survives intact', () => {
  const r = parseRepro('Repro:\n1. create a bead\n2. close it\n3. observe approved\nRemediation: x');
  assert.match(r, /1\. create a bead/);
  assert.match(r, /3\. observe approved/);
});

test('a finding with no repro comes back carrying null, not dropped', () => {
  // Dropping it would report a clean set and a short list, and the gap between
  // them is invisible. The closure rule needs it in order to say why.
  assert.equal(parseRepro('Location: x\nRationale: y'), null);
  assert.equal(parseRepro('Repro:   \nRemediation: x'), null);
  assert.equal(parseRepro(null), null);
});

// ── reading the actors ─────────────────────────────────────────────────────

test('fixed-by and verified-by are read from comments with their times', () => {
  const a = parseActors([
    { body: 'fixed-by: senior-dev', created_at: '2026-08-07T10:00:00Z' },
    { body: 'verified-by: security-officer', created_at: '2026-08-07T11:00:00Z' },
  ]);
  assert.equal(a.fixedBy, 'senior-dev');
  assert.equal(a.verifiedAt, '2026-08-07T11:00:00Z');
});

test('the newest fix wins, because a finding can be fixed twice', () => {
  // The verification that matters is the one for the fix that stands.
  const a = parseActors([
    { body: 'fixed-by: agent-a', created_at: '2026-08-01T10:00:00Z' },
    { body: 'fixed-by: agent-b', created_at: '2026-08-07T10:00:00Z' },
  ]);
  assert.equal(a.fixedBy, 'agent-b');
});

test('ordinary comments are not actors', () => {
  const a = parseActors([{ body: 'this looks related to the gate work', created_at: '2026-08-07T10:00:00Z' }]);
  assert.equal(a.fixedBy, null);
  assert.equal(a.verifiedBy, null);
  assert.deepEqual(parseActors(null), { fixedBy: null, fixedAt: null, verifiedBy: null, verifiedAt: null });
});

// ── end to end: a bead the closure rules can judge ─────────────────────────

test('a bead becomes a record the closure rules accept', () => {
  const f = findingFromBead(
    { id: 'gc-1', title: 'gate approval could be forged', description: DESC, status: 'open' },
    {
      comments: [
        { body: 'fixed-by: senior-dev', created_at: '2026-08-07T10:00:00Z' },
        { body: 'verified-by: security-officer', created_at: '2026-08-07T11:00:00Z' },
      ],
      reproResult: { status: 'passed' },
    },
  );
  assert.equal(closureDecision(f).ok, true);
});

test('yesterday case: fixed and verified by the same actor is refused', () => {
  const f = findingFromBead(
    { id: 'gc-2', title: 'x', description: DESC },
    { comments: [
      { body: 'fixed-by: orchestrator', created_at: '2026-08-07T10:00:00Z' },
      { body: 'verified-by: orchestrator', created_at: '2026-08-07T10:01:00Z' },
    ], reproResult: { status: 'passed' } },
  );
  assert.equal(closureDecision(f).reason, 'self-verified');
});

test('a bead with no repro is refused for the reason the reviewer gave himself', () => {
  const f = findingFromBead({ id: 'gc-3', title: 'x', description: 'Location: a\nRationale: b' }, {});
  assert.equal(closureDecision(f).reason, 'no-repro');
});

test('an unreadable tracker is not evidence that nothing is open', () => {
  assert.deepEqual(readFindingBeads({ exec: () => { throw new Error('bd missing'); } }), []);
  assert.deepEqual(readFindingBeads({ exec: () => 'not json' }), []);
});

test('a missing bead is null rather than a half-built record', () => {
  assert.equal(findingFromBead(null), null);
});
