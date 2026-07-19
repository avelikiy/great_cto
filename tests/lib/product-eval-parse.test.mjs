// parseTestCounts must understand the runners products actually use.
//
// Why this exists: the executing oracle only matched the node:test/TAP summary
// shape, while every product in the 2026-07 benchmark runs vitest. The parser
// returned all-nulls, runEval's `total || 1` fallback turned that into
// "1 test, and it failed", and nine of ten products were scored 0/1 — including
// two the collector had measured at 269/269 and 368/368. A parse failure must
// never be reported as a test result. See docs/benchmarks/RESCORE-2026-07-19.md.
//
// Fixtures below are captured verbatim from real runs, not hand-written:
//   vitest pass → `npx vitest run` in the dashboard bench product
//   vitest fail → `npx vitest run` in the leadcrm bench product
//   node:test   → `node --test packages/board/log.test.mjs` in this repo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestCounts } from '../../scripts/lib/product-eval.mjs';

const VITEST_PASS = `
 RUN  v4.1.10 /Users/x/bench/dashboard

 Test Files  25 passed (25)
      Tests  157 passed (157)
   Start at  12:08:57
   Duration  9.13s (transform 6.25s, setup 1.00s, import 15.30s, tests 7.44s)
`;

const VITEST_FAIL = `
⎯⎯⎯⎯⎯⎯ Failed Tests 70 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  17 failed | 8 passed (25)
      Tests  70 failed | 62 passed (132)
`;

const NODE_TEST = `
# tests 5
# pass 5
# fail 0
`;

const NODE_TEST_FAIL = `
# tests 79
# pass 77
# fail 2
`;

const JEST = `
Test Suites: 1 failed, 24 passed, 25 total
Tests:       1 failed, 195 passed, 196 total
Snapshots:   0 total
`;

test('vitest — all green', () => {
  const c = parseTestCounts(VITEST_PASS);
  assert.equal(c.total, 157);
  assert.equal(c.pass, 157);
  assert.equal(c.fail, 0);
});

test('vitest — mixed failures (the "N failed | M passed (T)" shape)', () => {
  const c = parseTestCounts(VITEST_FAIL);
  assert.equal(c.total, 132);
  assert.equal(c.pass, 62);
  assert.equal(c.fail, 70);
});

test('vitest — the Tests line wins over the Test Files line', () => {
  // Both lines match "N passed (M)"; picking the file counts would report 25/25
  // for a 157-test suite.
  const c = parseTestCounts(VITEST_PASS);
  assert.notEqual(c.total, 25, 'must not read the Test Files summary');
});

test('node:test — green (unchanged behaviour)', () => {
  const c = parseTestCounts(NODE_TEST);
  assert.equal(c.total, 5);
  assert.equal(c.pass, 5);
  assert.equal(c.fail, 0);
});

test('node:test — with failures', () => {
  const c = parseTestCounts(NODE_TEST_FAIL);
  assert.equal(c.total, 79);
  assert.equal(c.pass, 77);
  assert.equal(c.fail, 2);
});

test('jest — "N failed, M passed, T total"', () => {
  const c = parseTestCounts(JEST);
  assert.equal(c.total, 196);
  assert.equal(c.pass, 195);
  assert.equal(c.fail, 1);
});

test('unrecognised output yields nulls — never a fabricated count', () => {
  const c = parseTestCounts('Building...\nDone in 1.2s\n');
  assert.equal(c.total, null);
  assert.equal(c.pass, null);
  assert.equal(c.fail, null);
});

test('empty / undefined input is safe', () => {
  for (const v of ['', undefined, null]) {
    const c = parseTestCounts(v);
    assert.equal(c.total, null, `input ${JSON.stringify(v)}`);
  }
});
