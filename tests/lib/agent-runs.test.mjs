/**
 * agent-runs — did the agents actually run at the same time?
 *
 * The orchestrator contract has said `max_parallel_streams = 5` since it was
 * written, and nothing ever measured whether a run used one stream or five. A
 * serial pipeline and a parallel one leave identical logs; the serial one is
 * just slower. That is the same defect this repository keeps finding in its own
 * guards — a thing that did not happen looking exactly like a thing that did.
 *
 * The distinction these tests exist to protect is between `serial` and
 * `unmeasured`. "Every agent ran alone" and "nobody recorded when they ran" are
 * different findings with different fixes, and collapsing them would report a
 * measurement the code never took.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRunRecord, parseRunLog, concurrency, parallelismReport,
} from '../../scripts/lib/agent-runs.mjs';

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const T = Date.UTC(2026, 8, 3, 12, 0, 0);
const run = (agent, startMin, endMin) =>
  makeRunRecord({ agent, startedAt: T + startMin * 60000, endedAt: T + endMin * 60000 });

test('a record carries both ends of the interval', () => {
  const r = run('architect', 0, 5);
  assert.equal(r.agent, 'architect');
  assert.equal(r.started_at, iso(T));
  assert.equal(r.ended_at, iso(T + 300000));
  assert.equal(r.v, 1);
});

test('a run with no start is refused, not stamped with now', () => {
  // Defaulting the missing end to the current time would invent an interval and
  // make an unmeasured run look measured — the whole failure this module exists
  // to prevent.
  assert.throws(() => makeRunRecord({ agent: 'qa-engineer', endedAt: T }), /started_at/);
  assert.throws(() => makeRunRecord({ agent: 'qa-engineer', startedAt: T }), /ended_at/);
  assert.throws(() => makeRunRecord({ startedAt: T, endedAt: T + 1000 }), /agent/);
});

test('an interval that ends before it starts is refused', () => {
  assert.throws(() => makeRunRecord({ agent: 'a', startedAt: T + 1000, endedAt: T }), /before/);
});

test('overlapping runs are parallel', () => {
  const c = concurrency([run('architect', 0, 10), run('pm', 5, 15)]);
  assert.equal(c.state, 'parallel');
  assert.equal(c.max, 2);
  assert.equal(c.measured, 2);
});

test('runs that only touch at the boundary are NOT parallel', () => {
  // [0,5) then [5,10): the second starts exactly as the first ends. Counting
  // that as overlap would report parallelism in a strictly serial pipeline.
  const c = concurrency([run('architect', 0, 5), run('pm', 5, 10)]);
  assert.equal(c.state, 'serial');
  assert.equal(c.max, 1);
});

test('serial and unmeasured are different findings', () => {
  assert.equal(concurrency([run('architect', 0, 5)]).state, 'serial');

  const none = concurrency([]);
  assert.equal(none.state, 'unmeasured');
  assert.equal(none.max, null, 'an unmeasured run has no maximum, not a maximum of zero');
});

test('the peak counts simultaneous runs, not total runs', () => {
  const c = concurrency([
    run('a', 0, 30), run('b', 1, 4), run('c', 2, 6), run('d', 20, 25),
  ]);
  assert.equal(c.max, 3, 'a, b and c overlap at minute 3; d overlaps only a');
});

test('the log keeps malformed lines out without dropping them silently', () => {
  const text = [
    JSON.stringify(run('architect', 0, 5)),
    'not json at all',
    JSON.stringify({ v: 1, agent: 'pm' }),          // no interval
    JSON.stringify(run('pm', 2, 8)),
  ].join('\n');
  const { runs, malformed } = parseRunLog(text);
  assert.equal(runs.length, 2);
  assert.equal(malformed, 2, 'a line that could not be read is reported, not ignored');
});

test('the report compares the declared ceiling against the measured peak', () => {
  const r = parallelismReport({ runs: [run('a', 0, 10), run('b', 1, 5)], declaredMax: 5 });
  assert.equal(r.state, 'parallel');
  assert.equal(r.max, 2);
  assert.equal(r.declaredMax, 5);
  assert.match(r.summary, /2 of 5/);
});

test('an unmeasured report never claims the pipeline was serial', () => {
  const r = parallelismReport({ runs: [], declaredMax: 5 });
  assert.equal(r.state, 'unmeasured');
  assert.doesNotMatch(r.summary, /serial/i);
  assert.match(r.summary, /not measured|unmeasured/i);
});

// ── Reading the journal ─────────────────────────────────────────────────────
import { readFileSync as rf } from 'node:fs';
import { runsFromJournal, readJournalRuns, declaredMaxStreams } from '../../scripts/lib/agent-runs.mjs';

const row = (agent, startMin, endMin) => ({
  v: 1, agent, outcome: 'stop',
  started_at: startMin === null ? null : iso(T + startMin * 60000),
  ts: iso(T + endMin * 60000),
});

test('journal rows become intervals', () => {
  const { runs, untimed } = runsFromJournal([row('architect', 0, 10), row('pm', 5, 15)]);
  assert.equal(runs.length, 2);
  assert.equal(untimed, 0);
  assert.equal(concurrency(runs).state, 'parallel');
});

test('a row with no start is untimed, not malformed', () => {
  // The row is well formed; the transcript could not be timed. Calling that
  // corruption sends someone to fix a parser that is working correctly.
  const { runs, untimed } = runsFromJournal([row('architect', null, 10), row('pm', 2, 8)]);
  assert.equal(runs.length, 1);
  assert.equal(untimed, 1);
});

test('a journal of entirely untimed rows reports unmeasured, never serial', () => {
  const { runs, untimed } = runsFromJournal([row('a', null, 1), row('b', null, 2)]);
  assert.equal(untimed, 2);
  const r = parallelismReport({ runs, declaredMax: 5 });
  assert.equal(r.state, 'unmeasured');
  assert.doesNotMatch(r.summary, /serial/i);
});

test('a missing journal is unmeasured, not an error', () => {
  const { runs } = readJournalRuns('/nonexistent-project-root-xyz');
  assert.deepEqual(runs, []);
  assert.equal(concurrency(runs).state, 'unmeasured');
});

test('the declared ceiling is read from the contract, and absent is not zero', () => {
  assert.equal(declaredMaxStreams('[parallelism]\nmax_parallel_streams = 5\n'), 5);
  assert.equal(declaredMaxStreams('# max_parallel_streams = 5'), null,
    'a commented-out ceiling is not a declared one');
  assert.equal(declaredMaxStreams('[parallelism]\n'), null);
});

test('the real contract declares a ceiling this code can read', () => {
  // A parser for a file we do not actually ship is a parser for nothing.
  const toml = rf(new URL('../../shared/orchestrator.toml', import.meta.url), 'utf8');
  assert.equal(typeof declaredMaxStreams(toml), 'number');
});

test('the journal this reads is the one the dispatcher writes', () => {
  // The two ends of the pipe, asserted together: if recordRun ever stops
  // emitting started_at, this fails here rather than in a silent `unmeasured`.
  const src = rf(new URL('../../scripts/lib/pipeline-journal.mjs', import.meta.url), 'utf8');
  assert.match(src, /started_at:/, 'pipeline-journal must record started_at');
});
