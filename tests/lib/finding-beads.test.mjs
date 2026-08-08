// finding-closure has the rules — a finding may not be closed by whoever fixed
// it, the verification must postdate the fix, the reproduction must now pass —
// and on 2026-08-07 it could say nothing, because findings lived in markdown
// reports. Its inputs had to be typed in by hand to make it speak, and the two
// CRITICALs it would have caught were closed by their own fixer meanwhile.
//
// A rule with no data source is a rule nobody is subject to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepro, parseActors, findingFromBead, readFindingBeads, readBeadComments } from '../../scripts/lib/finding-beads.mjs';
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
  assert.deepEqual(parseActors(null), { fixedBy: null, fixedAt: null, verifiedBy: null, verifiedAt: null, reproResult: null });
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

test('comments are read from the shape bd actually returns', () => {
  // `bd show --json` returns an ARRAY of issues, and the body field is `text`.
  // Written against a guessed shape this returned [] in silence, so every
  // finding read as having no fixer and no verifier — the same defect that
  // stalled the pipeline the day before: a reader built for a format nobody
  // checked against the real thing.
  const real = JSON.stringify([{
    id: 'gc-1', title: 't', description: 'Repro: node -e "x"', status: 'open',
    comments: [
      { id: 1, issue_id: 'gc-1', author: 'a', text: 'fixed-by: senior-dev', created_at: '2026-08-08T10:00:00Z' },
      { id: 2, issue_id: 'gc-1', author: 'b', text: 'verified-by: qa-engineer', created_at: '2026-08-08T11:00:00Z' },
    ],
  }]);
  const comments = readBeadComments('gc-1', { exec: () => real });
  assert.equal(comments.length, 2);
  const a = parseActors(comments);
  assert.equal(a.fixedBy, 'senior-dev');
  assert.equal(a.verifiedBy, 'qa-engineer');
});

test('a wrapped or bare object still reads, since a tracker may change its mind', () => {
  const withComments = (o) => readBeadComments('x', { exec: () => JSON.stringify(o) });
  const c = [{ text: 'fixed-by: x', created_at: '2026-08-08T10:00:00Z' }];
  assert.equal(withComments({ comments: c }).length, 1);
  assert.equal(withComments({ issue: { comments: c } }).length, 1);
  assert.equal(withComments([]).length, 0, 'an empty list is no comments, not a crash');
});

test('the reproduction outcome is stated by the verifier, not executed here', () => {
  // Running a command out of a bead description is the shape that produced three
  // CRITICALs in execution-claims — agents write these. So this rung checks WHO
  // says the repro passes and whether they wrote the fix, never the command.
  const f = findingFromBead(
    { id: 'gc-9', title: 't', description: DESC },
    { comments: [
      { text: 'fixed-by: orchestrator', created_at: '2026-08-08T10:00:00Z' },
      { text: 'verified-by: qa-engineer\nrepro-result: passed', created_at: '2026-08-08T11:00:00Z' },
    ] },
  );
  assert.deepEqual(f.reproResult, { status: 'passed' });
  assert.equal(closureDecision(f).ok, true);
});

test('a stated failure keeps the finding open', () => {
  const f = findingFromBead(
    { id: 'gc-10', title: 't', description: DESC },
    { comments: [
      { text: 'fixed-by: a', created_at: '2026-08-08T10:00:00Z' },
      { text: 'verified-by: b\nrepro-result: failed', created_at: '2026-08-08T11:00:00Z' },
    ] },
  );
  assert.equal(closureDecision(f).reason, 'repro-not-passing');
});

test('a verification that never says what the repro did leaves it unrun', () => {
  const f = findingFromBead(
    { id: 'gc-11', title: 't', description: DESC },
    { comments: [
      { text: 'fixed-by: a', created_at: '2026-08-08T10:00:00Z' },
      { text: 'verified-by: b — looks fine to me', created_at: '2026-08-08T11:00:00Z' },
    ] },
  );
  assert.equal(closureDecision(f).reason, 'repro-not-run');
});
