// tests/lib/compress.test.mjs — unit tests for the native compression layer (Phase 1)
//
// Run: node --test tests/lib/compress.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreLine, scoreLines, trimByImportance } from '../../scripts/lib/compress/line-importance.mjs';
import { templatize, compressLog } from '../../scripts/lib/compress/log-template.mjs';
import { minifyJson } from '../../scripts/lib/compress/json-minify.mjs';
import { detectType, compress } from '../../scripts/lib/compress/index.mjs';

// ── line-importance ───────────────────────────────────────────────────────────

test('scoreLine: FATAL/ERROR are high (3)', () => {
  assert.equal(scoreLine('FATAL: out of memory'), 3);
  assert.equal(scoreLine('2026-01-01 ERROR connection reset'), 3);
  assert.equal(scoreLine('panic: nil deref'), 3);
});

test('scoreLine: WARN + stack frames are medium (2)', () => {
  assert.equal(scoreLine('WARNING deprecated api'), 2);
  assert.equal(scoreLine('  at handler (server.js:42:7)'), 2);
  assert.equal(scoreLine('  File "app.py", line 5, in main'), 2);
});

test('scoreLine: plain lines are low (1)', () => {
  assert.equal(scoreLine('starting worker pool'), 1);
});

test('trimByImportance: keeps FATAL, elides boilerplate under budget', () => {
  const noise = Array.from({ length: 200 }, (_, i) => `INFO heartbeat tick ${i}`).join('\n');
  const text = `${noise}\nFATAL: disk full at /var/data\n${noise}`;
  const r = trimByImportance(text, { budget: 400, context: 1 });
  assert.ok(r.text.includes('FATAL: disk full'), 'must keep the FATAL line');
  assert.ok(r.text.includes('elided'), 'must mark elided boilerplate');
  assert.ok(r.elided > 0);
  assert.ok(r.text.length < text.length);
});

test('trimByImportance: returns input unchanged when within budget', () => {
  const r = trimByImportance('a\nb\nc', { budget: 1000 });
  assert.equal(r.text, 'a\nb\nc');
  assert.equal(r.elided, 0);
});

// ── log-template ──────────────────────────────────────────────────────────────

test('templatize: masks timestamps, numbers, hex, uuid', () => {
  assert.equal(templatize('2026-01-01T10:00:00Z worker 42 started'), '<TS> worker <N> started');
  const u = templatize('req 550e8400-e29b-41d4-a716-446655440000 done');
  assert.equal(u, 'req <UUID> done');
});

test('compressLog: collapses repeats to one sample + count', () => {
  const text = Array.from({ length: 50 }, (_, i) => `2026-01-01T10:00:0${i % 10} INFO heartbeat ${i}`).join('\n');
  const r = compressLog(text);
  assert.equal(r.templates, 1, 'all lines share one template');
  assert.match(r.text, /⟨×50⟩/);
  assert.ok(r.text.length < text.length / 5, 'big reduction on repetitive logs');
});

test('compressLog: preserves a distinct FATAL line as its own sample', () => {
  const text = 'INFO a\nINFO a\nFATAL boom at x.rs:10:2\nINFO a';
  const r = compressLog(text);
  assert.ok(r.text.includes('FATAL boom at x.rs:10:2'), 'FATAL kept verbatim as its template sample');
});

// ── json-minify ───────────────────────────────────────────────────────────────

test('minifyJson: drops whitespace, valid json', () => {
  const pretty = '{\n  "a": 1,\n  "b": [1, 2, 3]\n}';
  const r = minifyJson(pretty);
  assert.equal(r.ok, true);
  assert.equal(r.text, '{"a":1,"b":[1,2,3]}');
  assert.ok(r.text.length < pretty.length);
});

test('minifyJson: invalid json returned unchanged (safe)', () => {
  const r = minifyJson('not json {');
  assert.equal(r.ok, false);
  assert.equal(r.text, 'not json {');
});

test('minifyJson: crushArrays samples long homogeneous arrays', () => {
  const arr = JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => ({ id: i })) });
  const r = minifyJson(arr, { crushArrays: true, sampleN: 3 });
  assert.equal(r.crushed, 1);
  assert.match(r.text, /\+97 more items/);
  const back = JSON.parse(r.text);
  assert.equal(back.items.length, 4); // 3 samples + 1 marker
});

// ── content-router ────────────────────────────────────────────────────────────

test('detectType: json / log / diff / text', () => {
  assert.equal(detectType('{"a":1}'), 'json');
  assert.equal(detectType('diff --git a/x b/x\n@@ -1 +1 @@'), 'diff');
  const log = Array.from({ length: 10 }, () => '2026-01-01T10:00:00Z INFO tick').join('\n');
  assert.equal(detectType(log), 'log');
  assert.equal(detectType('just some prose about a feature'), 'text');
});

test('compress: routes json → minify with stats', () => {
  const r = compress('{\n  "a":  1\n}');
  assert.equal(r.type, 'json');
  assert.equal(r.compressed, '{"a":1}');
  assert.ok(r.ratio > 0);
});

test('compress: routes log → template collapse', () => {
  const text = Array.from({ length: 30 }, () => '2026-01-01T10:00:00Z INFO heartbeat').join('\n');
  const r = compress(text);
  assert.equal(r.type, 'log');
  assert.ok(r.ratio > 0.7, `expected >70% on repetitive log, got ${r.ratio}`);
});

test('compress: text with budget trims by importance, keeps FATAL', () => {
  const noise = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  const text = `${noise}\nFATAL crash here\n${noise}`;
  const r = compress(text, { type: 'text', budget: 300 });
  assert.ok(r.compressed.includes('FATAL crash here'));
  assert.ok(r.after < r.before);
});

test('compress: never corrupts — safe fallback on odd input', () => {
  const r = compress('');
  assert.equal(r.compressed, '');
  assert.equal(r.ratio, 0);
});
