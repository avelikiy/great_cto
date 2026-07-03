// Tests for great_cto-e2ew: a transient bd failure (dolt lock, timeout,
// nonzero exit) used to cache AND return [] — indistinguishable from "no
// tasks" — which wiped a populated board via SSE with no recovery.
//
// Seam: bdList(cwd, runner) accepts an injectable runner defaulting to the
// real bd() spawn, so tests can simulate success/failure without spawning a
// real `bd` binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bdList } from './lib/beads.mjs';
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

  // Make cache stale so the failing call actually runs.
  bdCache.get(cwd).ts = Date.now() - 10_000;
  bdList(cwd, fail());
  const tsAfterFailure = bdCache.get(cwd).ts;

  assert.equal(tsAfterFailure, Date.now() - 10_000 || tsAfterFailure, 'sanity');
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
