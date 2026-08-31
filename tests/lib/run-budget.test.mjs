// A ceiling on what one unattended run may spend.
//
// The nightly loop wakes at 02:00, runs up to six iterations, and had no cost
// bound at all. It has a stop-file and an iteration cap — neither of which is a
// budget: six iterations of a hard task cost more than sixty of an easy one.
//
// The decision that matters is what happens when spend cannot be MEASURED. A
// budget that cannot fire is not a budget, so an unmeasurable spend against a
// configured ceiling stops the run. Proceeding would deliver "I could not check"
// as "you are within budget", which is the substitution this project exists to
// refuse — and here it is the one that costs money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBudget } from '../../scripts/lib/run-budget.mjs';

const log = (rows) => rows.map(([ts, agent, usd, turns]) =>
  `${ts} ${agent} ${usd}${turns ? ` turns=${turns}` : ''}`).join('\n') + '\n';

test('no ceiling configured means no ceiling — and says so', () => {
  const r = runBudget({ ceiling: null, before: '', after: log([['t', 'a', '5']]) });
  assert.equal(r.state, 'unbounded');
  assert.equal(r.stop, false);
  assert.match(r.sentence, /no ceiling/i);
});

test('spend under the ceiling continues, and reports the figure', () => {
  const r = runBudget({
    ceiling: 10,
    before: log([['t1', 'a', '2.00']]),
    after: log([['t1', 'a', '2.00'], ['t2', 'b', '3.50']]),
  });
  assert.equal(r.state, 'within');
  assert.equal(r.spent, 3.5, 'the run spent 3.50 — what was there before is not this run');
  assert.equal(r.stop, false);
});

test('spend over the ceiling stops the run', () => {
  const r = runBudget({ ceiling: 5, before: '', after: log([['t1', 'a', '6.20']]) });
  assert.equal(r.state, 'exceeded');
  assert.equal(r.stop, true);
  assert.match(r.sentence, /6\.2|6\.20/);
  assert.match(r.sentence, /5/);
});

test('a running total counts by its increment here too', () => {
  // cost-history holds two kinds of row; adding session snapshots together
  // over-counted by 23x once already. The ceiling must not inherit that.
  const r = runBudget({
    ceiling: 100,
    before: log([['t1', 'qa', '10', '100']]),
    after: log([['t1', 'qa', '10', '100'], ['t2', 'qa', '14', '140']]),
  });
  assert.equal(r.spent, 4, 'a total that moved 10 → 14 spent 4, not 24');
});

test('an unmeasurable spend against a ceiling STOPS, it does not continue', () => {
  // The whole point. "I could not check" must never be delivered as "you are
  // within budget" — especially when the next iteration costs money.
  const r = runBudget({ ceiling: 10, before: null, after: null });
  assert.equal(r.state, 'unmeasurable');
  assert.equal(r.stop, true, 'a budget that cannot fire is not a budget');
  assert.match(r.sentence, /could not be measured/i);
});

test('an unmeasurable spend with NO ceiling does not stop', () => {
  // Nothing was promised, so nothing is broken. Stopping here would punish a
  // configuration the operator never asked for.
  const r = runBudget({ ceiling: null, before: null, after: null });
  assert.equal(r.stop, false);
});

test('a log that shrinks is treated as unmeasurable, not as a refund', () => {
  // Truncation or rotation between reads. Negative spend is not a discount.
  const r = runBudget({ ceiling: 10, before: log([['t1', 'a', '9']]), after: '' });
  assert.equal(r.state, 'unmeasurable');
  assert.equal(r.stop, true);
});
