// Is this the first time, or the ninth?
//
// alerts-fired.json has recorded every alert this machine has ever sent, keyed
// `<event>:<project>:<id>` with the time it fired. Nothing read it as history —
// only as a dedupe set — so a gate going stale for the first time in a project
// and the ninth in a month produced exactly the same sentence.
//
// Netdata's framing of alert fatigue is the one that applies: the operator needs
// to tell a spike from a sustained condition, and a threshold alone cannot. The
// data was already on disk.
//
// Three states, because the file is LOSSY: it is trimmed to its last 500 keys,
// so a count from it is a floor and must say so. And no file at all is not the
// same as a file that shows nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recurrence } from './lib/alert-recurrence.mjs';

const NOW = Date.parse('2026-08-29T12:00:00Z');
const ago = (days) => new Date(NOW - days * 86400_000).toISOString();

test('no history file at all is unknown, not first', () => {
  const r = recurrence(null, { event: 'gate.stale', project: 'proj-a', now: NOW });
  assert.equal(r.state, 'unknown');
  assert.equal(r.count, null, 'a count nobody could take is not zero');
});

test('a history with nothing for this rule and project is a first occurrence', () => {
  const fired = { 'cost.threshold:proj-a:x': ago(3), 'gate.stale:proj-b:y': ago(3) };
  const r = recurrence(fired, { event: 'gate.stale', project: 'proj-a', now: NOW });
  assert.equal(r.state, 'first');
  assert.equal(r.count, 0);
});

test('prior fires of the same rule in the same project are counted', () => {
  const fired = {
    'gate.stale:proj-a:g1': ago(20),
    'gate.stale:proj-a:g2': ago(9),
    'gate.stale:proj-a:g3': ago(2),
    'gate.stale:proj-b:g4': ago(2),          // another project
    'cost.threshold:proj-a:c1': ago(2),      // another rule
  };
  const r = recurrence(fired, { event: 'gate.stale', project: 'proj-a', now: NOW });
  assert.equal(r.state, 'recurring');
  assert.equal(r.count, 3, 'three, and only this rule in this project');
  assert.equal(r.windowDays, 30);
});

test('fires older than the window are outside it', () => {
  const fired = { 'gate.stale:proj-a:g1': ago(45), 'gate.stale:proj-a:g2': ago(5) };
  const r = recurrence(fired, { event: 'gate.stale', project: 'proj-a', now: NOW });
  assert.equal(r.count, 1, '45 days ago is not "this month"');
});

test('a project whose name contains the separator is still matched exactly', () => {
  // Keys are `event:project:id` and a project slug may itself contain a colon;
  // matching on a prefix without anchoring the event would count another rule.
  const fired = { 'gate.stale:a:b:g1': ago(2), 'gate.stalest:a:b:g2': ago(2) };
  const r = recurrence(fired, { event: 'gate.stale', project: 'a:b', now: NOW });
  assert.equal(r.count, 1, 'gate.stalest is a different rule, not this one');
});

test('a trimmed history reports a floor, not a total', () => {
  // The writer keeps only the last 500 keys, so anything older is gone and a
  // count taken from it can only be "at least".
  const fired = {};
  for (let i = 0; i < 500; i++) fired[`gate.stale:proj-a:g${i}`] = ago(1);
  const r = recurrence(fired, { event: 'gate.stale', project: 'proj-a', now: NOW });
  assert.equal(r.atLeast, true, 'a full history file has forgotten what came before it');

  const small = { 'gate.stale:proj-a:g1': ago(1) };
  assert.equal(recurrence(small, { event: 'gate.stale', project: 'proj-a', now: NOW }).atLeast, false);
});

test('an unparseable timestamp is skipped rather than counted as now', () => {
  const fired = { 'gate.stale:proj-a:g1': 'not a date', 'gate.stale:proj-a:g2': ago(2) };
  assert.equal(recurrence(fired, { event: 'gate.stale', project: 'proj-a', now: NOW }).count, 1);
});

test('the sentence names the state rather than implying it', () => {
  const mk = (f) => recurrence(f, { event: 'gate.stale', project: 'proj-a', now: NOW }).sentence;
  assert.match(mk(null), /whether this has happened before/i);
  assert.match(mk({ 'gate.stale:proj-b:x': ago(1) }), /first time/i);
  assert.match(mk({ 'gate.stale:proj-a:g1': ago(1), 'gate.stale:proj-a:g2': ago(2) }),
    /2 (other )?times? in the last 30 days/i);
});
