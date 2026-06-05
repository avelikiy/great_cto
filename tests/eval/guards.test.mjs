// tests/eval/guards.test.mjs — Unit tests for scripts/lib/guards.mjs (Phase 4)
//
// Run: node --test tests/eval/guards.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { safeReadFile, truncate, withTimeout, MAX_CONTEXT_FILE_BYTES } from '../../scripts/lib/guards.mjs';

function tmpfile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'guards-'));
  const p = join(dir, 'f.txt');
  writeFileSync(p, content);
  return p;
}

// ── safeReadFile ──────────────────────────────────────────────────────────────

test('safeReadFile: reads small file', () => {
  const p = tmpfile('hello');
  assert.equal(safeReadFile(p), 'hello');
});

test('safeReadFile: returns null when over maxBytes', () => {
  const p = tmpfile('x'.repeat(100));
  assert.equal(safeReadFile(p, { maxBytes: 10 }), null);
});

test('safeReadFile: returns null for missing file (no throw)', () => {
  assert.equal(safeReadFile('/no/such/file/here.txt'), null);
});

test('safeReadFile: default cap is 10 MB', () => {
  assert.equal(MAX_CONTEXT_FILE_BYTES, 10_000_000);
});

// ── truncate ──────────────────────────────────────────────────────────────────

test('truncate: leaves short strings untouched', () => {
  assert.equal(truncate('abc', 10), 'abc');
});

test('truncate: cuts long strings and marks total length', () => {
  const out = truncate('a'.repeat(50), 10);
  assert.ok(out.startsWith('a'.repeat(10)));
  assert.match(out, /truncated, 50 total chars/);
});

test('truncate: passes through non-strings', () => {
  assert.equal(truncate(null), null);
  assert.equal(truncate(42), 42);
});

// ── withTimeout ───────────────────────────────────────────────────────────────

test('withTimeout: resolves fast promise', async () => {
  const v = await withTimeout(Promise.resolve('ok'), 1000);
  assert.equal(v, 'ok');
});

test('withTimeout: rejects slow promise', async () => {
  const slow = new Promise((res) => setTimeout(() => res('late'), 100));
  await assert.rejects(() => withTimeout(slow, 10, 'slow-op'), /timed out after 10ms/);
});
