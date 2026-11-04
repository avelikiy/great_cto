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

const BOARD = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BOARD, '../..');
const BASELINE = path.join(BOARD, 'route-coverage-baseline.json');
const SOURCES = [path.join(BOARD, 'lib', 'routes.mjs'), path.join(BOARD, 'server.mjs')];

/** Every route the dispatcher matches, as `{ path, methods, prefix }`. */
export function routeInventory(sources = SOURCES) {
  const routes = new Map();
  const add = (p, method, prefix) => {
    const r = routes.get(p) || { path: p, methods: new Set(), prefix };
    r.methods.add(method || 'ANY');
    routes.set(p, r);
  };
  for (const file of sources) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const method = line.match(/req\.method\s*===\s*'([A-Z]+)'/)?.[1];
      for (const m of line.matchAll(/pathname\s*===\s*'(\/api\/[^']+)'/g)) add(m[1], method, false);
      for (const m of line.matchAll(/pathname\.startsWith\('(\/api\/[^']+\/)'\)/g)) add(m[1], method, true);
      // Grouped reads: ['/api/docs', '/api/doc', ...].includes(pathname)
      const group = line.match(/\[([^\]]*'\/api\/[^\]]*)\]\.includes\(pathname\)/);
      if (group) for (const m of group[1].matchAll(/'(\/api\/[^']+)'/g)) add(m[1], undefined, false);
    }
  }
  return [...routes.values()]
    .map((r) => ({ ...r, methods: [...r.methods].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function testFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(test|e2e\.test)\.mjs$|\.hurl$/.test(e.name) && full !== fileURLToPath(import.meta.url)) out.push(full);
    }
  };
  walk(path.join(ROOT, 'tests'));
  for (const f of fs.readdirSync(BOARD)) if (f.endsWith('.test.mjs')) out.push(path.join(BOARD, f));
  return out.filter((f) => f !== fileURLToPath(import.meta.url));
}

/** Route path → test files that name it. */
export function routeCoverage(routes = routeInventory(), files = testFiles()) {
  const text = files.map((f) => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')]);
  return routes.map((r) => {
    // A path followed by another path character is a different route:
    // `/api/turns/diff` is not a reference to `/api/turns`.
    const re = new RegExp(r.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (r.prefix ? '' : '(?![A-Za-z0-9_/-])'));
    return { ...r, tests: text.filter(([, t]) => re.test(t)).map(([f]) => f) };
  });
}

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
