// Regression test for the boot-time board freeze: server.mjs's boot warm-up
// used to call getTasks(cwd) — bdList()'s cold-cache path, spawnSync — which
// blocks the ENTIRE event loop for as long as `bd list` takes (2-6s
// typically, unbounded worse under lock contention or a cold Dolt store).
// warmTasksAsync() is the non-blocking replacement: same data, dispatched
// through `spawn` (async) instead, so the calling thread is free the instant
// this function is CALLED, not the instant it resolves.
//
// Proven with a REAL slow `bd` (this repo's own GREAT_CTO_BD_BIN test seam),
// not a mocked spawn — a mocked spawn would only prove we called the right
// function, not that the caller stays unblocked while it runs.
//
// lib/beads.mjs resolves BD_BIN from GREAT_CTO_BD_BIN inside a top-level IIFE
// that runs once, at module load. Setting the env var from inside a test body
// (after the module is already loaded) has no effect, so each test that needs
// a different fake `bd` re-imports the module fresh via a cache-busting query
// string — the same trick `node --test` itself relies on for isolation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { bdCache } from './lib/state.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_BD_SLOW = path.join(HERE, 'fixtures', 'fake-bd-slow.sh');
const FAKE_BD_FAIL = path.join(HERE, 'fixtures', 'fake-bd-fail.sh');

async function freshBeadsWith(bdBin) {
  process.env.GREAT_CTO_BD_BIN = bdBin;
  const mod = await import(`./lib/beads.mjs?fresh=${Date.now()}-${Math.random()}`);
  delete process.env.GREAT_CTO_BD_BIN;
  return mod;
}

test.afterEach(() => {
  bdCache.clear();
  delete process.env.GREAT_CTO_BD_BIN;
  delete process.env.FAKE_BD_DELAY_SECS;
});

test('warmTasksAsync returns control immediately — it does not block on a slow bd', async () => {
  process.env.FAKE_BD_DELAY_SECS = '2';
  const { warmTasksAsync } = await freshBeadsWith(FAKE_BD_SLOW);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-warm-'));

  const beforeCall = Date.now();
  const pending = warmTasksAsync(cwd);
  const afterCall = Date.now();

  // The old code (getTasks(cwd) -> spawnSync) would not return control here
  // until the fixture's 2s sleep had elapsed. If this call is genuinely
  // async, the gap between beforeCall and afterCall is milliseconds.
  assert.ok(afterCall - beforeCall < 500,
    `warmTasksAsync must return before the slow bd resolves (call itself took ${afterCall - beforeCall}ms)`);
  assert.equal(bdCache.get(cwd), undefined,
    'cache must not be populated yet — the fill is still in flight in the background');

  const result = await pending;
  assert.equal(result.ok, true);
  assert.ok(result.ms >= 1800,
    `result should report close to the fixture's 2s delay (got ${result.ms}ms)`);
  assert.deepEqual(bdCache.get(cwd)?.data, [], 'cache holds the resolved data once the fill completes');
});

test('warmTasksAsync records a bd failure without throwing', async () => {
  // A binary that exits non-zero (bd's own failure shape) must resolve
  // { ok: false }, not reject and not hang.
  const { warmTasksAsync } = await freshBeadsWith(FAKE_BD_FAIL);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-warm-fail-'));

  const result = await warmTasksAsync(cwd);
  assert.equal(result.ok, false);
});

// ── the race warmTasksAsync must not lose ────────────────────────────────────
//
// Found by tests/pipeline-e2e.test.mjs going red after the fix above: a real
// request can invalidate the cache (a write) or populate it fresh (a
// synchronous cold read) WHILE the boot warm-up's background fetch is still
// in flight. Whichever finishes writing to bdCache LAST used to win — so the
// boot fetch, carrying a snapshot from before the write, could land after and
// silently resurrect data an operator had just changed. bd list is slow
// enough (seconds) and boot's warm-up runs long enough that this is not an
// edge case: it is the common case for the first few seconds of every board
// start.
test('a bd write that lands while the boot warm-up is still in flight is not overwritten by it', async () => {
  process.env.FAKE_BD_DELAY_SECS = '1.5';
  const { warmTasksAsync, bdCacheInvalidate } = await freshBeadsWith(FAKE_BD_SLOW);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-warm-race-'));

  const pending = warmTasksAsync(cwd); // carries stale (pre-write) [] data

  // Shortly after, simulate a real write cycle: the route handler invalidates
  // the cache, then a synchronous cold read (a real request) repopulates it
  // with the CURRENT, correct state — before the slow background fetch above
  // has resolved.
  await new Promise((r) => setTimeout(r, 200));
  bdCacheInvalidate(cwd);
  const freshData = [{ id: 'T-AFTER-WRITE' }];
  bdCache.set(cwd, { ts: Date.now(), data: freshData });

  await pending; // the stale background fetch finally resolves

  assert.deepEqual(bdCache.get(cwd)?.data, freshData,
    'the fresh, post-write data must survive — the stale boot fetch must not overwrite it');
});

// ── the SECOND blocker: the alert cron's cold sweep ──────────────────────────
//
// The boot warm-up above only covers cwd. The alert cron's 5-minute sweeps
// loop over EVERY registered project calling getTasks(proj.path, SWEEP),
// and until this fix that was `bdList()`'s cold-cache branch — `bd()`,
// spawnSync — for a project the sweep had never read before. Proven live
// (not synthetically): a real board running against this machine's real
// project registry showed a 9.8s event-loop-lag spike at t=+5:10 — the
// cron's first tick — with no request in flight at all.
//
// Scope: this fix is opt-in via `opts.sweep`, set ONLY by alerts.mjs's
// SWEEP constant. An earlier version made EVERY cold read (including a
// plain interactive `/api/tasks?project=X`) take the async path, and that
// broke real callers: tests/board-gate.test.mjs, tests/pipeline-e2e.test.mjs
// and tests/resume-e2e.test.mjs all went red because a gate approved
// seconds after project creation read back as "no gates" — the read that
// should have shown it got `[]` instead of waiting for the real answer. An
// interactive request IS someone waiting on this project's data; only the
// cron sweep can tolerate "catch up next tick".
test('bdList cold path with {sweep: true} does not block — answers [] and fills in the background', async () => {
  process.env.FAKE_BD_DELAY_SECS = '1.5';
  const { bdList, bdCache } = await freshBeadsWith(FAKE_BD_SLOW);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-sweep-'));

  const beforeCall = Date.now();
  const result = bdList(cwd, undefined, { sweep: true }); // default runner, sweep opt-in
  const afterCall = Date.now();

  assert.ok(afterCall - beforeCall < 500,
    `a sweep cold read must return immediately (took ${afterCall - beforeCall}ms)`);
  assert.deepEqual(result, [], 'nothing to serve yet on a genuinely first read');

  await new Promise((r) => setTimeout(r, 1800)); // past the fixture's delay
  const second = bdList(cwd, undefined, { sweep: true });
  assert.deepEqual(second, [], 'the fixture genuinely has no tasks — now served from a completed fill');
});

test('bdList cold path WITHOUT {sweep: true} stays synchronous, even with the real bd runner', async () => {
  // The interactive default. A caller who did not opt into sweep semantics
  // gets exactly the pre-existing behavior: block, then real data — no
  // "loading" placeholder a UI or a test could mistake for "no tasks".
  process.env.FAKE_BD_DELAY_SECS = '1';
  const { bdList } = await freshBeadsWith(FAKE_BD_SLOW);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-interactive-'));

  const beforeCall = Date.now();
  const result = bdList(cwd); // default runner, no opts — interactive shape
  const afterCall = Date.now();

  assert.ok(afterCall - beforeCall >= 900,
    `an interactive cold read must still wait for the real answer (took only ${afterCall - beforeCall}ms)`);
  assert.deepEqual(result, [], 'the fixture genuinely returns no tasks — but this is the REAL answer, not a placeholder');
});

test('bdList cold path leaves test-injected runners synchronous (existing beads-cache.test.mjs contract)', async () => {
  const { bdList } = await freshBeadsWith(FAKE_BD_FAIL); // module BD_BIN irrelevant here
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-cold-injected-'));
  const injected = () => ({ status: 0, stdout: JSON.stringify([{ id: 'T-1' }]), stderr: '' });

  const result = bdList(cwd, injected, { sweep: true }); // runner !== the module's own bd, even with sweep set
  assert.deepEqual(result, [{ id: 'T-1' }],
    'an injected runner (as beads-cache.test.mjs uses) must still resolve synchronously, sweep opt-in or not');
});
