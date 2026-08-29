// Tests for great_cto-e2ew: a transient bd failure (dolt lock, timeout,
// nonzero exit) used to cache AND return [] — indistinguishable from "no
// tasks" — which wiped a populated board via SSE with no recovery.
//
// Seam: bdList(cwd, runner) accepts an injectable runner defaulting to the
// real bd() spawn, so tests can simulate success/failure without spawning a
// real `bd` binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bdList, bdFailureFor, getReadDegradation, BD_CACHE_TTL_MS } from './lib/beads.mjs';
import { bdCache } from './lib/state.mjs';

function ok(data) {
  return () => ({ status: 0, stdout: JSON.stringify(data), stderr: '' });
}
function fail() {
  return () => ({ status: 1, stdout: '', stderr: 'dolt: database is locked' });
}

test.afterEach(() => {
  bdCache.clear();
});

test('success populates the cache and returns the data', () => {
  const cwd = '/tmp/gcto-test-success';
  const data = [{ id: 'T-1' }, { id: 'T-2' }];
  const result = bdList(cwd, ok(data));
  assert.deepEqual(result, data);
  assert.deepEqual(bdCache.get(cwd).data, data);
});

test('failure with no prior success returns [] (never had good data)', () => {
  const cwd = '/tmp/gcto-test-nohistory';
  const result = bdList(cwd, fail());
  assert.deepEqual(result, []);
});

test('failure after a prior success returns the last-good data, not []', () => {
  const cwd = '/tmp/gcto-test-lastgood';
  const goodData = [{ id: 'T-1' }, { id: 'T-2' }, { id: 'T-3' }];
  const first = bdList(cwd, ok(goodData));
  assert.deepEqual(first, goodData);

  // Force the cache to look stale so the next call actually re-invokes bd.
  const cached = bdCache.get(cwd);
  cached.ts = Date.now() - 10_000;

  const second = bdList(cwd, fail());
  assert.deepEqual(second, goodData, 'must serve last-good data on transient failure');
  // Cache still holds the good data (untouched by the failed call).
  assert.deepEqual(bdCache.get(cwd).data, goodData);
});

test('failure does not refresh the cache timestamp (next call retries bd)', () => {
  const cwd = '/tmp/gcto-test-retry';
  const goodData = [{ id: 'T-1' }];
  bdList(cwd, ok(goodData));
  const tsAfterSuccess = bdCache.get(cwd).ts;

  // Make cache stale so the failing call actually runs. Two things this line has
  // been wrong about, both worth keeping:
  //
  // It used to compare against a second `Date.now() - 10_000` evaluated at
  // assert time, matching only when zero milliseconds had elapsed in between —
  // a test that failed on a slow machine and passed on a fast one. The
  // `|| tsAfterFailure` beside it was meant as a safety net and never fired:
  // `||` short-circuits on its truthy left side, so it was dead text sitting
  // next to a real flake. The stale value is CAPTURED now.
  //
  // And it hard-coded 10 s, which silently became NOT stale when the TTL was
  // raised from 2 s to 30 s: the call under test was served from cache and never
  // ran at all. A test that duplicates a constant tests the copy.
  const staleTs = Date.now() - (BD_CACHE_TTL_MS + 5_000);
  bdCache.get(cwd).ts = staleTs;
  bdList(cwd, fail());
  const tsAfterFailure = bdCache.get(cwd).ts;

  assert.equal(tsAfterFailure, staleTs, 'a failed call must leave the timestamp exactly as it found it');
  assert.notEqual(tsAfterFailure, tsAfterSuccess, 'timestamp should remain the pre-failure stale value, not be refreshed');

  // A subsequent successful call should be allowed to run (not TTL-gated)
  // and update the cache with fresh data.
  const freshData = [{ id: 'T-1' }, { id: 'T-2' }];
  const third = bdList(cwd, ok(freshData));
  assert.deepEqual(third, freshData);
});

test('success refreshes the cache (subsequent calls within TTL are served from cache)', () => {
  const cwd = '/tmp/gcto-test-ttl';
  const data1 = [{ id: 'T-1' }];
  bdList(cwd, ok(data1));
  // Within TTL, a second call with different data must NOT invoke the
  // runner — cache should still serve data1.
  let invoked = false;
  const spy = () => { invoked = true; return { status: 0, stdout: JSON.stringify([{ id: 'T-2' }]), stderr: '' }; };
  const result = bdList(cwd, spy);
  assert.equal(invoked, false, 'cache within TTL should short-circuit before invoking runner');
  assert.deepEqual(result, data1);
});

// ── A silent empty list is a lie the reader cannot detect ────────────────────
//
// The fallback above keeps the board up when bd fails, and that is right. What
// was missing is the label: `[]` is also what a project with no tasks returns,
// so a project whose directory name contains a dot — bd refuses to open
// `<private-project>.ai` with "invalid database name" — rendered as a clean, empty,
// entirely believable board. Switching to it looked like a project nobody had
// started, which is the opposite of what had happened.

test('a bd failure is recorded as a reason, not just an empty list', () => {
  const cwd = '/tmp/gcto-test-reason';
  assert.deepEqual(bdList(cwd, fail()), []);
  const why = bdFailureFor(cwd);
  assert.ok(why, 'the failure must be retrievable');
  assert.match(why, /locked/, 'and must carry bd\'s own words');
});

test("bd's JSON error object on a zero exit is a failure, not a task list", () => {
  // bd 0.6x answers some open failures this way: exit 0, an object on stdout.
  // `JSON.parse` succeeds, so the old code returned the object as data.
  const cwd = '/tmp/gcto-test-jsonerr';
  const jsonErr = () => ({
    status: 0,
    stdout: '{"error":"failed to open database: invalid database name: \\"<private-project>.ai\\""}',
    stderr: '',
  });
  assert.deepEqual(bdList(cwd, jsonErr), [], 'not a task list');
  assert.match(bdFailureFor(cwd) || '', /invalid database name/);
});

test('a later success clears the recorded reason', () => {
  const cwd = '/tmp/gcto-test-recovers';
  bdList(cwd, fail());
  assert.ok(bdFailureFor(cwd));
  bdCache.clear();
  bdList(cwd, ok([{ id: 'T-9' }]));
  assert.equal(bdFailureFor(cwd), null, 'a project that reads again is not degraded');
});

test('the degradation channel reports it, so /api/tasks can label the response', () => {
  // The directory and its `.beads/` are real, because the claim is "bd FAILED on
  // a project that uses beads" — not "bd is absent from a project that does not".
  // The fixture used to be a path that did not exist, so it modelled the second
  // while asserting the first; a project that never ran `bd init` now reads as
  // healthy, and this test would have passed for the wrong reason.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-degradation-'));
  fs.mkdirSync(path.join(cwd, '.beads'), { recursive: true });
  bdList(cwd, fail());
  assert.match(getReadDegradation(cwd) || '', /locked/);
});
