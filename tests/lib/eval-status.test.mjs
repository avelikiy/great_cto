// The coverage gate answers "does an EVAL file exist that names this agent?" and
// calls that covered. By that measure the repo is 29% covered. By the measure
// that matters — has a case ever been executed and did it pass — 2 of 33 EVAL
// files have ever run, once, in June, and 14 of the 18 results were below their
// own threshold.
//
// So the properties worth pinning are the ones that keep a report from reading
// green when nothing ran: an unexecuted eval is never "passing", a failure stays
// a failure however recent, and a threshold nobody can parse is not a pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseThreshold, parseEvalMeta, parseHistory, statusFor, summarise, STATES,
} from '../../scripts/lib/eval-status.mjs';

const NOW = Date.parse('2026-07-29T00:00:00Z');
const row = (o) => ({ eval: 'EVAL-x', agent: 'a', split: 'holdout', rate: 1, threshold: 0.8, ts: '2026-07-28T00:00:00Z', ...o });

// ── thresholds, as the corpus actually writes them ──────────────────────────

test('the shipped threshold form parses', () => {
  assert.deepEqual(parseThreshold('4/5 tuning · 2/3 holdout.'),
    { tuning: { pass: 4, of: 5 }, holdout: { pass: 2, of: 3 } });
});

test('a threshold with prose after it still parses', () => {
  const t = parseThreshold('6/6 tuning · 2/3 holdout — any leak = critical.');
  assert.deepEqual(t.tuning, { pass: 6, of: 6 });
  assert.deepEqual(t.holdout, { pass: 2, of: 3 });
});

test('a threshold written as prose yields null rather than a guess', () => {
  assert.equal(parseThreshold('All ratios ≥ 0.8; block release pending sign-off.'), null);
  assert.equal(parseThreshold(''), null);
  assert.equal(parseThreshold(undefined), null);
});

// ── the eval file ───────────────────────────────────────────────────────────

const EVAL_MD = `# EVAL-demo.md

> Agent: security-officer · phase 2

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | a | b | c |
| 2 | a | b | c |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | a | b | c |

## Pass threshold
2/2 tuning · 1/1 holdout.
`;

test('an eval file yields its agent, its case counts, and its threshold', () => {
  const m = parseEvalMeta(EVAL_MD, 'EVAL-demo.md');
  assert.equal(m.name, 'EVAL-demo');
  assert.equal(m.agent, 'security-officer');
  assert.deepEqual(m.cases, { tuning: 2, holdout: 1 });
  assert.deepEqual(m.threshold.holdout, { pass: 1, of: 1 });
});

test('a pack eval binds through Reviewer: when it has no Agent: line', () => {
  const m = parseEvalMeta('# E\n\nReviewer: pci-reviewer\n', 'EVAL-pci.md');
  assert.equal(m.agent, 'pci-reviewer');
});

test('an eval with no binding reports none instead of inventing one', () => {
  assert.equal(parseEvalMeta('# E\n\nsome prose\n', 'EVAL-orphan.md').agent, null);
});

// ── the join: file × history ────────────────────────────────────────────────

test('an eval with no run is never-run, not passing', () => {
  const s = statusFor(parseEvalMeta(EVAL_MD, 'EVAL-demo.md'), [], { now: NOW });
  assert.equal(s.state, STATES.NEVER_RUN);
  assert.equal(s.rate, null, 'a rate we do not have must not be reported as a number');
});

test('a run below its threshold is failing, however recent', () => {
  const rows = [row({ eval: 'EVAL-demo', rate: 0.44, threshold: 1, ts: '2026-07-28T23:00:00Z' })];
  assert.equal(statusFor(parseEvalMeta(EVAL_MD, 'EVAL-demo.md'), rows, { now: NOW }).state, STATES.FAILING);
});

test('a pass older than the staleness window is stale, not passing', () => {
  const rows = [row({ eval: 'EVAL-demo', rate: 1, threshold: 0.8, ts: '2026-06-28T00:00:00Z' })];
  const s = statusFor(parseEvalMeta(EVAL_MD, 'EVAL-demo.md'), rows, { now: NOW, staleDays: 30 });
  assert.equal(s.state, STATES.STALE);
  assert.equal(s.ageDays, 31);
});

test('a recent pass is passing', () => {
  const rows = [row({ eval: 'EVAL-demo', rate: 0.95, threshold: 0.8 })];
  assert.equal(statusFor(parseEvalMeta(EVAL_MD, 'EVAL-demo.md'), rows, { now: NOW }).state, STATES.PASSING);
});

test('the newest run decides, not the best one', () => {
  const rows = [
    row({ eval: 'EVAL-demo', rate: 1.0, threshold: 0.8, ts: '2026-07-20T00:00:00Z' }),
    row({ eval: 'EVAL-demo', rate: 0.3, threshold: 0.8, ts: '2026-07-28T00:00:00Z' }),
  ];
  const s = statusFor(parseEvalMeta(EVAL_MD, 'EVAL-demo.md'), rows, { now: NOW });
  assert.equal(s.state, STATES.FAILING, 'reporting the best run is how a suite lies');
  assert.equal(s.rate, 0.3);
});

test('history rows for another eval do not count as this one running', () => {
  const rows = [row({ eval: 'EVAL-somethingelse', rate: 1 })];
  assert.equal(statusFor(parseEvalMeta(EVAL_MD, 'EVAL-demo.md'), rows, { now: NOW }).state, STATES.NEVER_RUN);
});

// ── history parsing ─────────────────────────────────────────────────────────

test('history parsing skips junk lines instead of throwing', () => {
  const rows = parseHistory('{"eval":"a","rate":1}\n\nnot json\n{"eval":"b","rate":0}\n');
  assert.deepEqual(rows.map(r => r.eval), ['a', 'b']);
});

test('missing history is an empty list, not a crash', () => {
  assert.deepEqual(parseHistory(''), []);
  assert.deepEqual(parseHistory(null), []);
});

// ── the summary line someone will read instead of the table ─────────────────

test('the summary counts every state and never rounds a failure away', () => {
  const s = summarise([
    { state: STATES.PASSING }, { state: STATES.FAILING },
    { state: STATES.NEVER_RUN }, { state: STATES.NEVER_RUN }, { state: STATES.STALE },
  ]);
  assert.equal(s.total, 5);
  assert.equal(s.passing, 1);
  assert.equal(s.failing, 1);
  assert.equal(s.neverRun, 2);
  assert.equal(s.stale, 1);
  assert.equal(s.executed, 3, 'executed = anything with a run behind it');
  assert.match(s.line, /1\/5/, 'the headline is passing-over-total, not covered-over-total');
});

test('an all-unexecuted corpus summarises as zero passing, not as no data', () => {
  const s = summarise([{ state: STATES.NEVER_RUN }, { state: STATES.NEVER_RUN }]);
  assert.equal(s.passing, 0);
  assert.equal(s.executed, 0);
  assert.match(s.line, /0\/2/);
});
