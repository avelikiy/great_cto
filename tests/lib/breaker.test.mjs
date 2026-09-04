/**
 * Stop after N runs that went nowhere.
 *
 * `provider-exhaustion` answers "does THIS error mean every later call fails
 * identically" — a question about one error's kind. It cannot see the other
 * shape: five different, individually legitimate failures in a row, each
 * plausibly retryable, while the pipeline does not move. Every run looks like a
 * run. Nothing is obviously wrong, and nothing happens.
 *
 * The distinctions that make this safe rather than annoying:
 *
 *  - A DELIBERATE stop is not a failure. `hold` (a gate is waiting) and
 *    `blocked-budget` (a cap was reached) are the machinery working. Counting
 *    them would trip the breaker on a pipeline that is correctly waiting for a
 *    human, which is the opposite of helpful.
 *  - PROGRESS resets the count, even without a verdict. An agent that timed out
 *    having changed files did work; the run was cut short, not wasted. Borrowed
 *    from MaxMiksa/Auto-Company, whose loop treats "timed out but the shared
 *    state changed" as OK and zeroes its error counter.
 *  - Three states, and the third is not the second: `ok`, `tripped`, and
 *    `unmeasured` when there is no journal to read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consecutiveFailures, breakerState, FAILURE_OUTCOMES } from '../../scripts/lib/breaker.mjs';

const row = (agent, outcome, extra = {}) => ({ v: 1, agent, outcome, ts: '2026-09-04T10:00:00Z', ...extra });

test('runs that went nowhere are counted, most recent first', () => {
  const rows = [row('a', 'dispatch'), row('a', 'no-verdict'), row('a', 'no-verdict')];
  assert.equal(consecutiveFailures(rows), 2);
});

test('a dispatch breaks the streak — the pipeline moved', () => {
  const rows = [row('a', 'no-verdict'), row('a', 'dispatch'), row('a', 'no-verdict')];
  assert.equal(consecutiveFailures(rows), 1, 'only the runs since the last real move count');
});

test('a gate waiting is NOT a failure', () => {
  // The most important negative case. A pipeline parked on gate:ship is working
  // exactly as designed, and could sit there for days.
  const rows = [row('a', 'hold'), row('a', 'hold'), row('a', 'hold'), row('a', 'hold'), row('a', 'hold')];
  assert.equal(consecutiveFailures(rows), 0);
  assert.equal(breakerState(rows, { threshold: 3 }).state, 'ok');
});

test('a budget cap is NOT a failure either', () => {
  const rows = [row('a', 'blocked-budget'), row('a', 'blocked-budget'), row('a', 'blocked-budget')];
  assert.equal(breakerState(rows, { threshold: 2 }).state, 'ok');
});

test('progress without a verdict resets the count', () => {
  // The borrowed subtlety: cut short, not wasted. Without this, an agent that
  // does real work but is stopped before writing its verdict looks identical to
  // one that did nothing at all.
  const rows = [row('a', 'no-verdict'), row('a', 'no-verdict', { progressed: true }), row('a', 'no-verdict')];
  assert.equal(consecutiveFailures(rows), 1);
});

test('progressed:false and progressed:null are not the same', () => {
  // null means nobody looked. Treating "unknown" as "made progress" would let a
  // silent failure reset the counter forever — the breaker would exist and never
  // fire, which is worse than not having one.
  const unknown = [row('a', 'no-verdict', { progressed: null }), row('a', 'no-verdict', { progressed: null })];
  assert.equal(consecutiveFailures(unknown), 2, 'unmeasured progress must not count as progress');

  const measured = [row('a', 'no-verdict', { progressed: false }), row('a', 'no-verdict', { progressed: false })];
  assert.equal(consecutiveFailures(measured), 2);
});

test('the breaker trips at the threshold and says why', () => {
  const rows = Array.from({ length: 5 }, () => row('a', 'no-verdict'));
  const r = breakerState(rows, { threshold: 5 });
  assert.equal(r.state, 'tripped');
  assert.equal(r.count, 5);
  assert.match(r.why, /5/, 'the count belongs in the message');
  assert.match(r.why, /no-verdict/, 'and what kept happening');
});

test('below the threshold it stays ok, and reports how close it is', () => {
  const rows = Array.from({ length: 3 }, () => row('a', 'no-verdict'));
  const r = breakerState(rows, { threshold: 5 });
  assert.equal(r.state, 'ok');
  assert.equal(r.count, 3);
});

test('no journal is unmeasured, never ok', () => {
  // An empty read must not report a healthy breaker: "nothing has failed" and
  // "nothing was recorded" are different, and only one of them is reassuring.
  const r = breakerState(null, { threshold: 5 });
  assert.equal(r.state, 'unmeasured');
  assert.equal(r.count, null);
});

test('an empty journal is ok — it was read, and it holds no failures', () => {
  const r = breakerState([], { threshold: 5 });
  assert.equal(r.state, 'ok');
  assert.equal(r.count, 0);
});

test('the failure list is explicit, so a new outcome is a decision', () => {
  // A new outcome added to the journal must be classified deliberately rather
  // than defaulting into "failure" and tripping the breaker by accident.
  assert.ok(FAILURE_OUTCOMES.includes('no-verdict'));
  assert.ok(!FAILURE_OUTCOMES.includes('hold'));
  assert.ok(!FAILURE_OUTCOMES.includes('dispatch'));
  const rows = [row('a', 'brand-new-outcome'), row('a', 'brand-new-outcome')];
  assert.equal(consecutiveFailures(rows), 0, 'an unclassified outcome must not count as failure');
});

test('a threshold of 0 disables the breaker — it does not trip on everything', () => {
  // The escape hatch documented in the dispatcher is GREAT_CTO_BREAKER_THRESHOLD=0.
  // Read naively, `count < threshold` makes 0 the STRICTEST setting rather than
  // the off switch: zero failures is not less than zero, so it would trip on a
  // clean pipeline. A disable that enables is worse than no disable, because it
  // fires exactly when someone is trying to get unstuck.
  const rows = Array.from({ length: 9 }, () => ({ v: 1, agent: 'a', outcome: 'no-verdict' }));
  const r = breakerState(rows, { threshold: 0 });
  assert.equal(r.state, 'ok', 'threshold 0 must mean OFF');
  assert.match(r.why, /disabled|off/i, 'and it must say it is off, not that all is well');
});

test('a negative threshold is off too, not inverted', () => {
  assert.equal(breakerState([{ v: 1, outcome: 'no-verdict' }], { threshold: -1 }).state, 'ok');
});

// ── the wiring ──────────────────────────────────────────────────────────────
//
// The module above is pure and well covered. What the unit tests cannot see is
// whether the dispatcher actually CONSULTS it — and a breaker that is computed
// and then ignored is indistinguishable from no breaker at all, which is the
// exact failure mode this repository keeps removing.
//
// This is a structural check, deliberately: driving the real dispatcher needs a
// transcript, a payload and a pipeline map, and a test that elaborate tends to
// be deleted rather than fixed. It catches the wiring being removed, which is
// the realistic regression; it does not prove the branch's runtime behaviour.
import { readFileSync } from 'node:fs';

test('the dispatcher consults the breaker and withholds the dispatch', () => {
  const src = readFileSync(new URL('../../scripts/hooks/pipeline-dispatcher.mjs', import.meta.url), 'utf8');

  assert.match(src, /breakerState/, 'the dispatcher must read the breaker');
  assert.match(src, /breaker\.state === 'tripped'/, 'and act on a tripped one');
  assert.match(src, /decision\?\.kind === 'next'/,
    'only a dispatch is overridden — a gate decision is a human waiting and must never be overridden by a counter');
  assert.match(src, /PIPELINE-STOP/, 'and it must SAY it withheld the dispatch, not fall silent');
  assert.match(src, /GREAT_CTO_BREAKER_THRESHOLD/, 'with a documented way out');
});

test("the withheld dispatch is journalled under its own outcome", async () => {
  // Otherwise the run that was stopped by the breaker looks, in the journal,
  // exactly like a run that had nothing to do.
  const { OUTCOMES } = await import('../../scripts/lib/pipeline-journal.mjs');
  assert.ok(OUTCOMES.includes('breaker'), 'breaker must be a declared outcome');
  const src = readFileSync(new URL('../../scripts/hooks/pipeline-dispatcher.mjs', import.meta.url), 'utf8');
  assert.match(src, /outcome: 'breaker'/, 'the dispatcher must record it');
});
