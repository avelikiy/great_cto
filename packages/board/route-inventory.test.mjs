// Route inventory: every /api route the board serves is either referenced by a
// test or listed, by name, as known debt in route-coverage-baseline.json.
//
// docs/testing/BOARD-TEST-STRATEGY.md measured 19 of 57 routes with no test at
// all (/api/receipt, /api/sessions, /api/push/subscribe, ...). A route nobody
// calls in a test is a route whose breakage only a user can find. This test
// turns that count into a ratchet:
//   - a NEW route without a test fails the build;
//   - a baseline route that gained a test (or was removed) fails the build too,
//     until it is struck from the baseline, so the list only ever shrinks.
//
// "Referenced" is a literal match of the route path in a test file. It is a
// floor, not proof: a test that names a route may not exercise it. The
// contract and E2E layers of the strategy are what prove behaviour.
//
// Refresh after deliberately accepting the current state:
//   ROUTE_BASELINE_WRITE=1 node --test packages/board/route-inventory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeInventory, routeCoverage } from '../../tests/helpers/board-routes.mjs';

const BOARD = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(BOARD, 'route-coverage-baseline.json');

test('the inventory finds the board API (sanity: the parser is not silently empty)', () => {
  const routes = routeInventory();
  assert.ok(routes.length >= 50, `only ${routes.length} routes parsed; the route syntax in routes.mjs changed`);
  const paths = routes.map((r) => r.path);
  for (const known of ['/api/work', '/api/gates/', '/api/inbox', '/api/docs/search', '/api/sse']) {
    assert.ok(paths.includes(known), `${known} missing from the inventory`);
  }
  assert.deepEqual(routes.find((r) => r.path === '/api/push/subscribe').methods, ['DELETE', 'POST']);
});

test('the reference matcher does not credit a route for a longer one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-inv-'));
  try {
    const f = path.join(dir, 'x.test.mjs');
    fs.writeFileSync(f, "fetch('/api/sessions-elsewhere'); fetch('/api/turns/diff?x=1')");
    const cov = routeCoverage([{ path: '/api/sessions', prefix: false }, { path: '/api/turns', prefix: false }, { path: '/api/turns/diff', prefix: false }], [f]);
    assert.deepEqual(cov.map((c) => c.tests.length), [0, 0, 1]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every API route is tested or named as known debt, and the debt only shrinks', () => {
  const coverage = routeCoverage();
  const untested = coverage.filter((c) => c.tests.length === 0).map((c) => c.path);
  const all = coverage.map((c) => c.path);
  if (process.env.ROUTE_BASELINE_WRITE === '1') {
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: 'API routes with no test referencing them. Shrink only: add a test, then remove the line. See docs/testing/BOARD-TEST-STRATEGY.md.',
      measured: `${untested.length} of ${all.length} routes`,
      untested,
    }, null, 2) + '\n');
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).untested;

  const newlyUntested = untested.filter((p) => !baseline.includes(p));
  assert.deepEqual(newlyUntested, [], `route(s) with no test and not in the baseline — add a test:\n  ${newlyUntested.join('\n  ')}`);

  const stale = baseline.filter((p) => !untested.includes(p));
  assert.deepEqual(stale, [], `baseline lists route(s) that are now tested or gone — strike them from ${path.basename(BASELINE)}:\n  ${stale.join('\n  ')}`);

  console.log(`route inventory: ${all.length - untested.length}/${all.length} routes referenced by a test; ${untested.length} known debt`);
});
