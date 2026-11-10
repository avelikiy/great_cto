// Every /api route, swept against a real board on a throwaway project.
//
// The security tests that exist (host-allowlist, gate-tokens, knowledge,
// router-key-verify) each prove their guard on the handful of routes they name.
// The Origin guard in server.mjs is global, so a route added tomorrow is covered
// by it — unless someone moves it. And no test asked every route what it does
// with a request it did not expect. This file asks, for the whole inventory
// (route-inventory.test.mjs), two questions:
//
//   1. A state-changing request from another site (POST/PUT/PATCH/DELETE with a
//      foreign Origin) is refused with 403 on every route, before any handler runs.
//   2. No route answers 5xx to an empty or malformed request: missing parameters,
//      an unknown project, a traversal-shaped id, a negative or non-numeric
//      number, a body that is not JSON. A 5xx is a crash the user sees as
//      "the board is broken"; the right answer is a 4xx that names the problem
//      or a state such as `unknown`.
//
// The project is isolated (temp HOME, temp git repo, tasks.md instead of bd),
// so a write that a broken guard let through lands in a directory that is
// deleted afterwards.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
import { routeInventory } from '../../tests/helpers/board-routes.mjs';
import { sweepProject, call } from '../../tests/helpers/board-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const FOREIGN = 'http://evil.example';
// Malformed inputs, one per class: unknown project, traversal-shaped id,
// negative and non-numeric numbers, an absurd limit.
const BAD_QUERY = '?project=no-such-project&id=..%2F..%2Fetc%2Fpasswd&session=..%2F..&turn=-1&days=-5&limit=abc&q=%00&path=..%2F..%2Fetc%2Fpasswd';

const project = () => sweepProject((d) => TMP_DIRS.push(d));

/** A concrete URL path for a route: prefix routes get a plausible tail. */
const concrete = (r) => (r.prefix ? `${r.path}x` : r.path);

let shared;
// Registered at file level: an `after` inside a test fires when that test ends.
after(() => shared && reap(shared.proc));
async function board() {
  if (shared) return shared;
  const p = project();
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: p.dir, readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
    env: { HOME: p.home, USERPROFILE: p.home, GREAT_CTO_NO_UPDATE_CHECK: '1', GREAT_CTO_NO_BOARD: '1' },
  });
  shared = { port, proc };
  return shared;
}

test('a write from another site is refused with 403 on every route and every write method', { timeout: 120000 }, async () => {
  const { port } = await board();
  const routes = routeInventory();
  const leaks = [];
  for (const r of routes) {
    for (const method of WRITE_METHODS) {
      const res = await call(port, concrete(r), {
        method, headers: { Origin: FOREIGN, 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.status !== 403) leaks.push(`${method} ${concrete(r)} → ${res.status} ${res.body.slice(0, 120)}`);
    }
  }
  assert.deepEqual(leaks, [], `cross-site writes not refused:\n  ${leaks.join('\n  ')}`);
});

test('no route answers 5xx (or hangs) on an empty or malformed request', { timeout: 300000 }, async () => {
  const { port } = await board();
  const routes = routeInventory();
  const crashes = [];
  const check = (label, res) => {
    if (res.status === 0 || res.status >= 500) crashes.push(`${label} → ${res.status || 'no answer'} ${res.body.slice(0, 160)}`);
  };
  for (const r of routes) {
    const p = concrete(r);
    const reads = r.methods.some((m) => m === 'GET' || m === 'ANY');
    const writes = r.methods.filter((m) => WRITE_METHODS.includes(m) || m === 'ANY');
    if (reads) {
      check(`GET ${p}`, await call(port, p));
      check(`GET ${p}${BAD_QUERY}`, await call(port, p + BAD_QUERY));
    }
    for (const m of new Set(writes.map((w) => (w === 'ANY' ? 'POST' : w)))) {
      // Same-origin by omission (no Origin header — the CLI's path), so the request
      // reaches the handler; the body is not JSON.
      check(`${m} ${p} (body not JSON)`, await call(port, p, { method: m, headers: { 'Content-Type': 'application/json' }, body: '{not json' }));
      check(`${m} ${p}${BAD_QUERY} (empty JSON)`, await call(port, p + BAD_QUERY, { method: m, headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    }
  }
  assert.deepEqual(crashes, [], `routes that crashed or hung:\n  ${crashes.join('\n  ')}`);
});
