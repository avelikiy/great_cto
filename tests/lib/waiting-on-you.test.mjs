// What is waiting on you, and for how long — one reader, both surfaces.
//
// Three mechanisms independently decided that old work should stop being
// mentioned, and each decision is defensible on its own:
//
//   · gate.stale alerts between 2h and 7 days, skips anything marked `blocked`,
//     and dedupes so a given gate can produce exactly one alert, ever.
//   · gate-expiry marks a gate `blocked` at 72h — which silences the above.
//   · session-pipeline-resume treats anything older than 24h as history, not as
//     work waiting: "a stage that succeeded last week is not work waiting for
//     you, it is something that happened".
//
// Together they produce silence. Measured on this machine: gate.stale has fired
// six times ever, most recently 41 days ago, in a period that contained a gate
// open for 29 days.
//
// So the rule is inverted here: **age is the reason to speak, not to stop.**
// Noise is controlled by ranking and by cadence, not by going quiet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitingOnYou, cadenceFor, dedupeKeyFor } from '../../scripts/lib/waiting-on-you.mjs';

const NOW = Date.parse('2026-08-29T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();
const gate = (id, h, extra = {}) => ({
  id, title: `gate:ship — ${id}`, is_gate: true, raw_status: 'open',
  created_at: hoursAgo(h), ...extra,
});

test('a gate marked blocked by the expiry hook is still waiting on you', () => {
  const r = waitingOnYou([gate('g1', 100, { raw_status: 'blocked' })], { now: NOW });
  assert.equal(r.state, 'waiting');
  assert.equal(r.items.length, 1,
    'the hook that flags a neglected gate must not also hide it — blocked by expiry '
    + 'is the state that most needs mentioning');
});

test('age is the reason to speak: a week-old gate is not dropped', () => {
  const r = waitingOnYou([gate('g1', 24 * 9)], { now: NOW });
  assert.equal(r.items.length, 1, 'nine days waiting is the strongest signal, not a reason to give up');
  assert.equal(r.items[0].ageHours, 216);
});

test('the oldest comes first, and the count is honest about the rest', () => {
  const r = waitingOnYou(
    [gate('new', 3), gate('oldest', 300), gate('middle', 50)],
    { now: NOW, limit: 2 });
  assert.deepEqual(r.items.map((i) => i.id), ['oldest', 'middle']);
  assert.equal(r.total, 3);
  assert.equal(r.hidden, 1, 'a truncated list says how much it truncated');
});

test('nothing waiting and nothing readable are different answers', () => {
  assert.equal(waitingOnYou([], { now: NOW }).state, 'clear');
  assert.equal(waitingOnYou(null, { now: NOW }).state, 'unknown',
    'a reader that could not read must not report an empty queue');
});

test('closed gates and ordinary tasks are not waiting on you', () => {
  const r = waitingOnYou([
    gate('done', 100, { raw_status: 'closed' }),
    { id: 't1', title: 'a task', is_gate: false, raw_status: 'open', created_at: hoursAgo(100) },
  ], { now: NOW });
  assert.equal(r.state, 'clear');
});

test('a gate younger than the nudge floor is not yet nagged about', () => {
  // Below the floor it is simply in flight; mentioning it at once would train
  // the reader to ignore the channel, which is how a reminder dies.
  const r = waitingOnYou([gate('fresh', 1)], { now: NOW });
  assert.equal(r.state, 'clear');
  assert.equal(waitingOnYou([gate('ripe', 3)], { now: NOW }).state, 'waiting');
});

test('the cadence decays instead of the channel going silent', () => {
  // Every five minutes forever is noise; once and never again is the defect we
  // have. Between them: as the wait grows, the reminder slows but never stops.
  assert.equal(cadenceFor(3), 'daily', 'a few hours in — once a day is plenty');
  assert.equal(cadenceFor(24 * 4), 'daily');
  assert.equal(cadenceFor(24 * 10), 'weekly', 'ten days in, weekly — still spoken, not louder');
  assert.equal(cadenceFor(24 * 60), 'weekly', 'two months in it is still mentioned, forever');
});

test('each item says why it is here, in the row rather than a heading', () => {
  const r = waitingOnYou([gate('g1', 80, { raw_status: 'blocked' })], { now: NOW });
  assert.match(r.items[0].why, /3d|expired|waiting/i);
  assert.match(r.line, /1 decision/i, 'a one-line summary both surfaces can print');
});

// ── The dedupe key is what turns "once, ever" into a cadence ────────────────
//
// The alert deduped on `gate.stale:<project>:<gate-id>`, so one gate produced
// exactly one alert in its lifetime. Putting the PERIOD in the key makes the
// same dedupe machinery repeat on a schedule instead of falling silent: the same
// gate is a different key tomorrow, and the same key twice in one day.
test('the same gate is one alert per day while young, per week once old', () => {
  const item = { id: 'g1', ageHours: 30, cadence: 'daily' };
  const monday = Date.parse('2026-08-24T09:00:00Z');
  const mondayLater = Date.parse('2026-08-24T21:00:00Z');
  const tuesday = Date.parse('2026-08-25T09:00:00Z');

  assert.equal(dedupeKeyFor('proj', item, monday), dedupeKeyFor('proj', item, mondayLater),
    'twice in one day is one alert');
  assert.notEqual(dedupeKeyFor('proj', item, monday), dedupeKeyFor('proj', item, tuesday),
    'tomorrow it speaks again — this is the whole point');
});

test('a long-waiting gate slows to weekly and never stops', () => {
  const old = { id: 'g1', ageHours: 24 * 40, cadence: 'weekly' };
  const mon = Date.parse('2026-08-24T09:00:00Z');
  const fri = Date.parse('2026-08-28T09:00:00Z');
  const nextMon = Date.parse('2026-08-31T09:00:00Z');

  assert.equal(dedupeKeyFor('p', old, mon), dedupeKeyFor('p', old, fri), 'same week, one alert');
  assert.notEqual(dedupeKeyFor('p', old, mon), dedupeKeyFor('p', old, nextMon),
    'next week it speaks again — forty days waiting is still worth one line a week');
});

test('two projects with the same gate id do not share a key', () => {
  const item = { id: 'g1', ageHours: 30, cadence: 'daily' };
  const now = Date.parse('2026-08-24T09:00:00Z');
  assert.notEqual(dedupeKeyFor('proj-a', item, now), dedupeKeyFor('proj-b', item, now));
});
