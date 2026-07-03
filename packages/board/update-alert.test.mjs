// Tests for lib/update-alert.mjs — daily release-check compare/dedupe/message
// logic as pure functions, with fetch injected so no real network call is
// ever made.
//
// Run: node --test packages/board/update-alert.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRY_DIST_TAGS_URL,
  isNewerVersion,
  updateDedupeKey,
  buildUpdatePayload,
  fetchLatestVersion,
  checkForRelease,
} from './lib/update-alert.mjs';

// ── isNewerVersion ─────────────────────────────────────────────────────────

test('isNewerVersion: true when latest > current', () => {
  assert.equal(isNewerVersion('2.78.0', '2.79.0'), true);
  assert.equal(isNewerVersion('2.78.0', '3.0.0'), true);
  assert.equal(isNewerVersion('1.2.3', '1.2.4'), true);
});

test('isNewerVersion: false when latest <= current', () => {
  assert.equal(isNewerVersion('2.78.0', '2.78.0'), false);
  assert.equal(isNewerVersion('2.79.0', '2.78.0'), false);
});

test('isNewerVersion: false for missing/unknown current version', () => {
  assert.equal(isNewerVersion('', '2.79.0'), false);
  assert.equal(isNewerVersion('unknown', '2.79.0'), false);
  assert.equal(isNewerVersion(undefined, '2.79.0'), false);
});

test('isNewerVersion: false/true correctly handles non-numeric garbage segments', () => {
  assert.equal(isNewerVersion('2.x.0', '2.1.0'), true); // garbage -> 0, so 1 > 0
});

// ── updateDedupeKey ─────────────────────────────────────────────────────────

test('updateDedupeKey embeds the latest version string', () => {
  assert.equal(updateDedupeKey('2.79.0'), 'update.available:2.79.0');
});

test('updateDedupeKey differs across versions (one notification per new release)', () => {
  assert.notEqual(updateDedupeKey('2.79.0'), updateDedupeKey('2.80.0'));
});

// ── buildUpdatePayload ───────────────────────────────────────────────────

test('buildUpdatePayload includes both versions and the upgrade command', () => {
  const payload = buildUpdatePayload('2.78.0', '2.79.0');
  assert.match(payload.title, /2\.79\.0/);
  assert.match(payload.title, /2\.78\.0/);
  assert.match(payload.body, /npx great-cto upgrade/);
  assert.equal(payload.level, 'info');
  assert.equal(payload.kv.current, '2.78.0');
  assert.equal(payload.kv.latest, '2.79.0');
});

// ── fetchLatestVersion (injected fetch — no real network) ─────────────────

test('fetchLatestVersion: returns latest on success', async () => {
  const fakeFetch = async (url) => {
    assert.equal(url, REGISTRY_DIST_TAGS_URL);
    return { ok: true, json: async () => ({ latest: '9.9.9' }) };
  };
  const result = await fetchLatestVersion(fakeFetch);
  assert.equal(result, '9.9.9');
});

test('fetchLatestVersion: null on non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, json: async () => ({}) });
  const result = await fetchLatestVersion(fakeFetch);
  assert.equal(result, null);
});

test('fetchLatestVersion: null when fetch throws (offline)', async () => {
  const fakeFetch = async () => { throw new Error('network unreachable'); };
  const result = await fetchLatestVersion(fakeFetch);
  assert.equal(result, null);
});

test('fetchLatestVersion: null when body has no latest field', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ notLatest: '1.0.0' }) });
  const result = await fetchLatestVersion(fakeFetch);
  assert.equal(result, null);
});

// ── checkForRelease (integration of the pure pieces, injected deps) ────────

test('checkForRelease: notifies exactly once when a newer version is not yet fired', async () => {
  const fired = new Set();
  let notifyCalls = 0;
  let notifiedArgs = null;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ latest: '2.79.0' }) });
  const result = await checkForRelease({
    currentVersion: '2.78.0',
    fetchFn: fakeFetch,
    isFired: (key) => fired.has(key),
    notify: (current, latest, dedupeKey) => { notifyCalls++; notifiedArgs = { current, latest, dedupeKey }; },
  });
  assert.equal(notifyCalls, 1);
  assert.deepEqual(notifiedArgs, { current: '2.78.0', latest: '2.79.0', dedupeKey: 'update.available:2.79.0' });
  assert.deepEqual(result, { checked: true, latest: '2.79.0', notified: true });
});

test('checkForRelease: does not notify when already fired for that version (dedupe)', async () => {
  let notifyCalls = 0;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ latest: '2.79.0' }) });
  const result = await checkForRelease({
    currentVersion: '2.78.0',
    fetchFn: fakeFetch,
    isFired: (key) => key === 'update.available:2.79.0',
    notify: () => { notifyCalls++; },
  });
  assert.equal(notifyCalls, 0);
  assert.equal(result.notified, false);
});

test('checkForRelease: does not notify when latest is not newer than current', async () => {
  let notifyCalls = 0;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ latest: '2.78.0' }) });
  const result = await checkForRelease({
    currentVersion: '2.78.0',
    fetchFn: fakeFetch,
    isFired: () => false,
    notify: () => { notifyCalls++; },
  });
  assert.equal(notifyCalls, 0);
  assert.equal(result.notified, false);
});

test('checkForRelease: fails silent (no throw, no notify) when fetch fails', async () => {
  let notifyCalls = 0;
  const fakeFetch = async () => { throw new Error('offline'); };
  const result = await checkForRelease({
    currentVersion: '2.78.0',
    fetchFn: fakeFetch,
    isFired: () => false,
    notify: () => { notifyCalls++; },
  });
  assert.equal(notifyCalls, 0);
  assert.equal(result.notified, false);
  assert.equal(result.latest, null);
});

test('checkForRelease: a new release after a previous notified version fires again (different dedupe key)', async () => {
  const fired = new Set(['update.available:2.79.0']);
  let notifyCalls = 0;
  let lastKey = null;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ latest: '2.80.0' }) });
  const result = await checkForRelease({
    currentVersion: '2.78.0',
    fetchFn: fakeFetch,
    isFired: (key) => fired.has(key),
    notify: (_c, _l, dedupeKey) => { notifyCalls++; lastKey = dedupeKey; },
  });
  assert.equal(notifyCalls, 1);
  assert.equal(lastKey, 'update.available:2.80.0');
  assert.equal(result.notified, true);
});

test('checkForRelease: GREAT_CTO_NO_UPDATE_CHECK=1 skips the check entirely (no fetch call)', async () => {
  const prev = process.env.GREAT_CTO_NO_UPDATE_CHECK;
  process.env.GREAT_CTO_NO_UPDATE_CHECK = '1';
  try {
    let fetchCalled = false;
    const fakeFetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({ latest: '9.9.9' }) }; };
    const result = await checkForRelease({
      currentVersion: '2.78.0',
      fetchFn: fakeFetch,
      isFired: () => false,
      notify: () => {},
    });
    assert.equal(fetchCalled, false);
    assert.deepEqual(result, { checked: false, latest: null, notified: false });
  } finally {
    if (prev === undefined) delete process.env.GREAT_CTO_NO_UPDATE_CHECK;
    else process.env.GREAT_CTO_NO_UPDATE_CHECK = prev;
  }
});
