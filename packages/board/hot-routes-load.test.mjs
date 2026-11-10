// The routes the board polls hardest, under 20 concurrent clients.
//
// /api/work and /api/inbox are read on every refresh of the two screens an
// operator keeps open; /api/sse is opened by every tab. A handler that turns
// O(n²), takes a lock or leaks a child process shows up first as these routes
// slowing down or erroring when several tabs ask at once. Budget (strategy §3.6):
// p95 under 200 ms on the fixture, no error.
//
// Latency depends on the machine, and the full gate runs eight workers at once,
// so the test enforces errors strictly and latency with headroom
// (HOT_ROUTE_P95_MS, default 1000 ms) and prints the measured numbers every run;
// the 200 ms target is checked on a quiet machine with HOT_ROUTE_P95_MS=200.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startContractBoard, call } from '../../tests/helpers/board-contract.mjs';

const CLIENTS = 20;
const PER_CLIENT = 10;
const BUDGET_MS = Number(process.env.HOT_ROUTE_P95_MS) || 1000;

const p = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];

let board;
after(() => board?.close());

/** CLIENTS loops of PER_CLIENT sequential requests each; every duration and every failure. */
async function load(port, path, { headersOnly = false } = {}) {
  const times = [];
  const errors = [];
  await Promise.all(Array.from({ length: CLIENTS }, async () => {
    for (let i = 0; i < PER_CLIENT; i++) {
      const t0 = performance.now();
      const res = await call(port, path, {}, headersOnly ? 5000 : 20000);
      times.push(performance.now() - t0);
      if (res.status !== 200) errors.push(`${res.status || 'no answer'} ${res.body.slice(0, 100)}`);
    }
  }));
  times.sort((a, b) => a - b);
  return { p50: p(times, 0.5), p95: p(times, 0.95), max: times.at(-1), errors };
}

for (const [path, opts] of [['/api/work', {}], ['/api/inbox', {}], ['/api/sse', { headersOnly: true }]]) {
  test(`${path} under ${CLIENTS} concurrent clients: no error, p95 within budget`, { timeout: 120000 }, async () => {
    board ??= await startContractBoard();
    await call(board.port, path); // first read warms caches; it is not what the budget is about
    const r = await load(board.port, path, opts);
    console.log(`${path}: p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, max ${r.max.toFixed(1)} ms over ${CLIENTS * PER_CLIENT} requests (budget p95 < ${BUDGET_MS} ms)`);
    assert.deepEqual([...new Set(r.errors)], [], `${r.errors.length} failed requests`);
    assert.ok(r.p95 < BUDGET_MS, `p95 ${r.p95.toFixed(1)} ms ≥ budget ${BUDGET_MS} ms`);
  });
}
