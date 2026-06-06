// tests/lib/ccr.test.mjs — unit tests for scripts/lib/ccr.mjs (Phase 2)
//
// Run: node --test tests/lib/ccr.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashId, store, retrieve, list, prune, registerDrops, formatRecallFooter } from '../../scripts/lib/ccr.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'lib', 'ccr.mjs');
function tmp() { return mkdtempSync(join(tmpdir(), 'ccr-')); }

// ── hashId ────────────────────────────────────────────────────────────────────

test('hashId: deterministic 12-hex, content-addressed', () => {
  assert.equal(hashId('abc'), hashId('abc'));
  assert.notEqual(hashId('abc'), hashId('abd'));
  assert.match(hashId('abc'), /^[0-9a-f]{12}$/);
});

// ── store / retrieve round-trip ────────────────────────────────────────────────

test('store + retrieve round-trip', () => {
  const root = tmp();
  const r = store('the original content with FATAL detail', { source: 'test' }, { root });
  assert.ok(r.id);
  assert.equal(r.deduped, false);
  const rec = retrieve(r.id, { root });
  assert.equal(rec.content, 'the original content with FATAL detail');
  assert.equal(rec.source, 'test');
  assert.ok(rec.bytes > 0);
});

test('store: idempotent / content-addressed dedup', () => {
  const root = tmp();
  const a = store('same', {}, { root });
  const b = store('same', {}, { root });
  assert.equal(a.id, b.id);
  assert.equal(b.deduped, true);
});

test('retrieve: unknown id → null', () => {
  assert.equal(retrieve('deadbeef0000', { root: tmp() }), null);
});

test('retrieve: unique prefix match works', () => {
  const root = tmp();
  const r = store('prefix-test content', {}, { root });
  const rec = retrieve(r.id.slice(0, 6), { root });
  assert.ok(rec && rec.content === 'prefix-test content');
});

// ── list / prune ────────────────────────────────────────────────────────────

test('list: returns stubs without full content, newest first', () => {
  const root = tmp();
  store('one', { source: 's1' }, { root });
  store('two', { source: 's2' }, { root });
  const items = list({ root, limit: 10 });
  assert.equal(items.length, 2);
  assert.ok(items[0].preview);
  assert.equal(items[0].content, undefined); // stub only
});

test('prune: keeps newest maxFiles', () => {
  const root = tmp();
  for (let i = 0; i < 10; i++) store(`item-${i}`, {}, { root });
  const removed = prune({ root, maxFiles: 4 });
  assert.equal(removed, 6);
  assert.equal(list({ root, limit: 100 }).length, 4);
});

// ── registerDrops + footer (memory-filter wiring) ──────────────────────────────

test('registerDrops: stores entries and returns stubs', () => {
  const root = tmp();
  const dropped = [
    { heading: '## Lesson A', full: '## Lesson A\nbody of A with detail' },
    { heading: '## Lesson B', full: '## Lesson B\nbody of B' },
  ];
  const stubs = registerDrops(dropped, { source: 'memory-filter', query: 'auth', root });
  assert.equal(stubs.length, 2);
  assert.ok(stubs[0].id && stubs[0].preview.includes('Lesson A'));
  // recoverable
  const rec = retrieve(stubs[0].id, { root });
  assert.ok(rec.content.includes('body of A with detail'));
  assert.equal(rec.source, 'memory-filter');
});

test('registerDrops: skips empty items', () => {
  const root = tmp();
  const stubs = registerDrops([{ full: '   ' }, { full: '' }], { root });
  assert.equal(stubs.length, 0);
});

test('formatRecallFooter: empty → empty string', () => {
  assert.equal(formatRecallFooter([]), '');
  assert.equal(formatRecallFooter(null), '');
});

test('formatRecallFooter: lists ids + /recall hint', () => {
  const f = formatRecallFooter([{ id: 'abc123', preview: 'Lesson A' }]);
  assert.match(f, /ccr: 1 item/);
  assert.match(f, /\/ccr <id>/);
  assert.match(f, /`abc123`/);
});

// ── CLI ────────────────────────────────────────────────────────────────────────

test('CLI: store then recall round-trips', () => {
  const root = tmp();
  const env = { ...process.env, GREAT_CTO_CCR_ROOT: root };
  const s = spawnSync(process.execPath, [SCRIPT, 'store', 'cli content here', '--source', 'cli'], { env, encoding: 'utf8' });
  assert.equal(s.status, 0);
  const id = s.stdout.trim();
  assert.match(id, /^[0-9a-f]{12}$/);
  const r = spawnSync(process.execPath, [SCRIPT, 'recall', id], { env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('cli content here'));
});

test('CLI: recall unknown id exits 1', () => {
  const res = spawnSync(process.execPath, [SCRIPT, 'recall', 'nope00000000'], {
    env: { ...process.env, GREAT_CTO_CCR_ROOT: tmp() }, encoding: 'utf8',
  });
  assert.equal(res.status, 1);
});

test('CLI: store reads stdin when no positional content (pipeable)', () => {
  const root = tmp();
  const env = { ...process.env, GREAT_CTO_CCR_ROOT: root };
  const s = spawnSync(process.execPath, [SCRIPT, 'store', '--source', 'pipe'], {
    env, encoding: 'utf8', input: 'piped log blob with FATAL inside',
  });
  assert.equal(s.status, 0);
  const id = s.stdout.trim();
  const r = spawnSync(process.execPath, [SCRIPT, 'recall', id], { env, encoding: 'utf8' });
  assert.ok(r.stdout.includes('piped log blob with FATAL inside'));
});
