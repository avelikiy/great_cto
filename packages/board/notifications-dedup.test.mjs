// Regression: addNotification must dedupe by dedupeKey so the alert crons
// (which tick every 5 min while a condition persists) don't spam the bell.
// Test seam: lib/config.mjs reads NOTIF_HISTORY_FILE from
// GREAT_CTO_NOTIF_HISTORY_FILE, so we point it at a throwaway temp file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-notif-test-'));
process.env.GREAT_CTO_NOTIF_HISTORY_FILE = path.join(tmpDir, 'notif-history.json');

const { addNotification } = await import('./lib/notifications.mjs');

test('same dedupeKey added twice → second is skipped (no bell spam)', () => {
  const key = 'digest.daily:proj:2026-07-04';
  const first = addNotification('digest.daily', { title: 'a', body: 'b' }, key);
  const second = addNotification('digest.daily', { title: 'a', body: 'b' }, key);
  assert.ok(first, 'first add returns the notification');
  assert.equal(second, null, 'duplicate add returns null (skipped)');
});

test('a different dedupeKey (next day) is a fresh notification', () => {
  const a = addNotification('digest.daily', { title: 'x' }, 'digest.daily:proj:2026-07-05');
  const b = addNotification('digest.daily', { title: 'x' }, 'digest.daily:proj:2026-07-06');
  assert.ok(a && b, 'distinct keys both add');
  assert.notEqual(a.id, b.id);
});

test('no dedupeKey → always adds (backward compatible)', () => {
  const a = addNotification('adhoc', { title: 't' });
  const b = addNotification('adhoc', { title: 't' });
  assert.ok(a && b, 'both add when no key given');
  assert.notEqual(a.id, b.id);
});

test('cleanup', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
