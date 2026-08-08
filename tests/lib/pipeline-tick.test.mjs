// Gate approval is read now, but only while a turn is running. Approve a gate
// two hours later and nothing notices — the turn ended, and the Stop hook
// deliberately does not hold one open on a gate because answering one requires
// the turn to end. So approving is still not enough: someone has to come back
// and say "continue", and that second action carries no decision.
//
// This is the piece that removes it, and the first point where the pipeline
// moves unattended. The guardrails are the substance; the scheduling is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickDecision, tickBrief, NEVER_AUTO, MIN_INTERVAL_MS } from '../../scripts/lib/pipeline-tick.mjs';

const ready = (next, agent = 'code-reviewer', verdict = 'APPROVED') => ({
  position: 'ready-to-dispatch', next, cursor: { agent, verdict }, summary: 'x',
});

test('a ready transition with nothing in the way is dispatched', () => {
  const d = tickDecision({ position: ready(['qa-engineer', 'security-officer']) });
  assert.equal(d.act, true);
  assert.deepEqual(d.agents, ['qa-engineer', 'security-officer']);
  assert.match(tickBrief(d, ready(['qa-engineer'])), /subagent_type: qa-engineer/);
});

// ── everything else is a refusal, and every refusal is safe ────────────────

test('only ready-to-dispatch is this tick to move', () => {
  for (const p of ['awaiting-gate', 'blocked', 'join-wait', 'idle', 'complete', 'no-verdict']) {
    const d = tickDecision({ position: { position: p, next: ['pm'], cursor: { agent: 'a', verdict: 'DONE' } } });
    assert.equal(d.act, false, p);
    assert.match(d.why, new RegExp(p));
  }
});

test('an expensive-to-undo agent is refused by NAME, not only by gate', () => {
  // A gate is configuration — `approval-level: auto` switches every one off.
  // This list is not configuration; it is the ADR-009 line.
  for (const a of NEVER_AUTO) {
    const d = tickDecision({ position: ready([a]) });
    assert.equal(d.act, false, a);
    assert.match(d.why, /expensive to undo/);
    assert.match(d.why, /a gate being off is not a human deciding/);
  }
});

test('one forbidden agent in a fan-out stops the whole dispatch', () => {
  // Spawning the safe half and silently dropping the other leaves the pipeline
  // in a state nobody chose.
  const d = tickDecision({ position: ready(['qa-engineer', 'devops']) });
  assert.equal(d.act, false);
  assert.match(d.why, /devops/);
});

test('the same transition is never dispatched twice', () => {
  // Without this, a tick every ten minutes re-spawns the same stage until
  // something changes — a fork bomb with a scheduler.
  const p = ready(['pm'], 'architect', 'APPROVED');
  const first = tickDecision({ position: p });
  assert.equal(first.act, true);
  const again = tickDecision({ position: p, lastMarker: first.marker });
  assert.equal(again.act, false);
  assert.match(again.why, /already dispatched/);
});

test('the marker is the transition, not the moment', () => {
  const a = tickDecision({ position: ready(['pm'], 'architect', 'APPROVED') });
  const sameLater = tickDecision({ position: ready(['pm'], 'architect', 'APPROVED'), now: Date.now() + 9e6 });
  assert.equal(a.marker, sameLater.marker, 'the same stage with the same verdict is the same transition');
  const different = tickDecision({ position: ready(['pm'], 'architect', 'DONE') });
  assert.notEqual(a.marker, different.marker, 'a different verdict is a different transition');
});

test('dispatches respect a floor whatever the schedule says', () => {
  const p = ready(['pm']);
  const now = 1_000_000_000;
  assert.equal(tickDecision({ position: p, now, lastTickAt: now - 60_000 }).act, false);
  assert.equal(tickDecision({ position: p, now, lastTickAt: now - MIN_INTERVAL_MS - 1 }).act, true);
});

test('a missing or empty position moves nothing', () => {
  assert.equal(tickDecision({ position: null }).act, false);
  assert.equal(tickDecision({}).act, false);
  assert.equal(tickDecision({ position: { position: 'ready-to-dispatch', next: [] } }).act, false);
});

test('a brief is only produced when something is actually dispatched', () => {
  assert.equal(tickBrief({ act: false }, null), null);
});

test('the brief tells the woken session it ran unattended', () => {
  // The one instruction that matters when nobody is watching: stop rather than
  // improvise.
  const d = tickDecision({ position: ready(['pm']) });
  assert.match(tickBrief(d, ready(['pm'])), /stop and report rather than dispatching/);
});
