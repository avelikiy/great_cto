// What an unattended iteration should look at before continuing what it was doing.
//
// The nightly prompt says: read HANDOFF.md, and "if HANDOFF.md is absent" read
// PROJECT.md and the inbox to find the next open task. HANDOFF.md exists from the
// second iteration onward, so the fallback never fires: the loop follows the
// thread it is on and never looks at threads that stopped.
//
// The distinction this makes, which `waitingOnYou` does not, is WHO can act:
//
//   · a gate awaiting a human is NOT work for an unattended agent. It reports it
//     and moves on. An agent that "handles" a gate at 02:00 has approved its own
//     work, which is the one thing the gate exists to prevent.
//   · a task that is open and has not moved is work it may take.
//
// Collapsing those two is how an autonomous loop becomes an autonomous
// rubber stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wakeupScan } from '../../scripts/lib/wakeup-scan.mjs';

const NOW = Date.parse('2026-08-31T02:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400_000).toISOString();

const gate = (id, d) => ({ id, title: `gate:ship — ${id}`, is_gate: true, raw_status: 'open', created_at: daysAgo(d) });
const task = (id, d, status = 'open') => ({ id, title: `task ${id}`, is_gate: false, raw_status: status, created_at: daysAgo(d), updated_at: daysAgo(d) });

test('a gate awaiting a human is reported, never offered as work', () => {
  const s = wakeupScan([gate('g1', 4)], { now: NOW });
  assert.equal(s.blockedOnHuman.length, 1);
  assert.equal(s.actionable.length, 0,
    'an unattended agent that takes a gate approves its own work');
  assert.match(s.text, /cannot be resolved by this run|needs a human/i);
});

test('an open task that has not moved is offered as work', () => {
  const s = wakeupScan([task('t1', 6)], { now: NOW });
  assert.equal(s.actionable.length, 1);
  assert.equal(s.blockedOnHuman.length, 0);
});

test('a blocked task is neither — it is reported and not taken', () => {
  // `blocked` means something outside this loop is in the way. Picking it up
  // produces an iteration that discovers the blocker again and burns a run.
  const s = wakeupScan([task('t1', 3, 'blocked')], { now: NOW });
  assert.equal(s.actionable.length, 0);
  assert.equal(s.blockedOnHuman.length, 1);
});

test('closed work and fresh work are not mentioned', () => {
  const s = wakeupScan([task('done', 9, 'closed'), task('fresh', 0)], { now: NOW });
  assert.equal(s.state, 'clear', 'nothing stale, nothing waiting');
  assert.equal(s.actionable.length, 0);
});

test('the list is capped and says what it dropped', () => {
  const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`, i + 3));
  const s = wakeupScan(many, { now: NOW, limit: 3 });
  assert.equal(s.actionable.length, 3);
  assert.match(s.text, /6 more/, 'a truncated list that hides its truncation is a wrong count');
});

test('the oldest comes first, because that is the one that has cost the most', () => {
  const s = wakeupScan([task('new', 3), task('old', 30), task('mid', 10)], { now: NOW });
  assert.deepEqual(s.actionable.map((i) => i.id), ['old', 'mid', 'new']);
});

test('unreadable tasks are unknown, never an empty world', () => {
  const s = wakeupScan(null, { now: NOW });
  assert.equal(s.state, 'unknown');
  assert.match(s.text, /could not be read/i);
  assert.equal(s.actionable.length, 0, 'a list nobody could read offers no work');
});

test('the text tells the agent it may switch, and must say so out loud', () => {
  const s = wakeupScan([task('old', 20)], { now: NOW });
  assert.match(s.text, /switch/i, 'the permission has to be explicit or the handoff always wins');
  assert.match(s.text, /say (which|so)|name both|explain/i,
    'switching silently is how a loop wanders — it must state the choice');
});
