// An estimate nobody checks is a guess in a confident font. cost-guard predicts
// spend from a five-row hardcoded table; cost-history.log records what was
// actually spent; nothing ever compared them. This report does — and, critically,
// refuses to pronounce a verdict on a handful of samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCostHistory, computeDrift, renderDrift } from '../../scripts/lib/cost-drift.mjs';

const EST = { architect: 3, 'security-officer': 2 };
/** n records for one agent at a fixed cost. */
const runs = (agent, usd, n) => Array.from({ length: n }, (_, i) => ({ ts: `t${i}`, agent, usd }));

test('parses the current log shape', () => {
  const r = parseCostHistory('2026-05-09T15:53:52Z senior-dev 0.30\n2026-05-09T15:58:42Z qa-engineer 0.10\n');
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { ts: '2026-05-09T15:53:52Z', agent: 'senior-dev', usd: 0.3 });
});

test('parses the legacy agent=/cost_usd= shape too', () => {
  const r = parseCostHistory('2026-05-12T10:00:00Z agent=architect feature=demo cost_usd=8.00\n');
  assert.equal(r[0].agent, 'architect');
  assert.equal(r[0].usd, 8);
});

test('skips blanks, comments and malformed lines instead of inventing rows', () => {
  const r = parseCostHistory('\n# a comment\nnonsense line\n2026-01-01T00:00:00Z architect 1.5\n');
  assert.equal(r.length, 1);
});

test('ratio > 1 means we spent more than predicted', () => {
  const d = computeDrift(runs('architect', 6, 1), EST);
  assert.equal(d.rows[0].ratio, 2, '$6 actual against a $3 estimate');
});

test('ratio < 1 means the estimate was too pessimistic', () => {
  const d = computeDrift(runs('architect', 1.5, 1), EST);
  assert.equal(d.rows[0].ratio, 0.5);
});

test('median is used, so one outlier run does not decide the verdict', () => {
  const rec = [...runs('architect', 3, 4), { ts: 'x', agent: 'architect', usd: 300 }];
  const d = computeDrift(rec, EST);
  assert.equal(d.rows[0].medianActual, 3, 'the $300 spike is not the median');
});

test('below the sample floor it refuses to pronounce, and says how far off it is', () => {
  const d = computeDrift(runs('architect', 9, 3), EST);
  assert.match(d.verdict, /insufficient-data \(3\/30/);
  assert.doesNotMatch(d.verdict, /adequate|off/, 'no calibration call on 3 points');
});

test('with enough samples and close estimates → do not calibrate', () => {
  const d = computeDrift([...runs('architect', 3.3, 20), ...runs('security-officer', 2.1, 15)], EST);
  assert.match(d.verdict, /estimates-adequate/);
  assert.match(d.verdict, /do not calibrate/);
});

test('with enough samples and estimates far off → calibration is justified', () => {
  const d = computeDrift([...runs('architect', 12, 20), ...runs('security-officer', 9, 15)], EST);
  assert.match(d.verdict, /estimates-off/);
  assert.match(d.verdict, /justified/);
});

test('agents that were measured but never estimated are surfaced, not dropped', () => {
  const d = computeDrift([...runs('senior-dev', 0.3, 5), ...runs('architect', 3, 2)], EST);
  assert.equal(d.rows.length, 1, 'only architect is scoreable');
  assert.equal(d.uncovered[0].agent, 'senior-dev');
  assert.equal(d.uncovered[0].samples, 5, '"we never predicted this" is itself the finding');
});

test('no overlap between measured and estimated agents is reported honestly', () => {
  const d = computeDrift(runs('senior-dev', 0.3, 40), EST);
  assert.match(d.verdict, /no-overlap/);
});

test('every row carries its sample count — a 2-sample ratio is a rumour', () => {
  const d = computeDrift(runs('architect', 5, 2), EST);
  assert.equal(d.rows[0].samples, 2);
});

test('empty input renders an explanation, not an empty table', () => {
  const out = renderDrift(computeDrift([], EST));
  assert.match(out, /No measured spend recorded yet/);
});

test('rendered report shows the ratio and the verdict', () => {
  const out = renderDrift(computeDrift(runs('architect', 6, 40), EST));
  assert.match(out, /architect/);
  assert.match(out, /2×/);
  assert.match(out, /Verdict:/);
});
