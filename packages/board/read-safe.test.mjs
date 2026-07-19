// readSafe / parseSafe must keep "absent", "unreadable" and "here it is" apart.
//
// readFileSafe returns null for both absent and unreadable, so every caller
// downstream renders "no data". That single collapse is the shared root of five
// board bugs shipped in one week: tasks listing nothing, a metrics panel showing
// "—" while the API had real counts, and session logs reporting "nothing
// recorded" over a file full of entries. Emptiness must be a finding, never a
// fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSafe, parseSafe } from './lib/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-readsafe-'));

test('present file → ok with contents', () => {
  const p = path.join(tmp, 'ok.txt');
  fs.writeFileSync(p, 'hello');
  const r = readSafe(p);
  assert.equal(r.ok, true);
  assert.equal(r.text, 'hello');
});

test('absent file → missing, distinctly', () => {
  const r = readSafe(path.join(tmp, 'nope.txt'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
});

test('an empty file is contents, not absence', () => {
  const p = path.join(tmp, 'empty.txt');
  fs.writeFileSync(p, '');
  const r = readSafe(p);
  assert.equal(r.ok, true, 'an empty file was successfully read');
  assert.equal(r.text, '');
});

test('unreadable file → unreadable, not missing', { skip: process.getuid?.() === 0 && 'root ignores mode bits' }, () => {
  const p = path.join(tmp, 'locked.txt');
  fs.writeFileSync(p, 'secret');
  fs.chmodSync(p, 0o000);
  try {
    const r = readSafe(p);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unreadable', 'must not be reported as missing');
    assert.ok(r.error, 'carries the underlying error for the UI to show');
  } finally {
    fs.chmodSync(p, 0o644);
  }
});

test('a directory in place of a file → unreadable, not missing', () => {
  const p = path.join(tmp, 'adir');
  fs.mkdirSync(p, { recursive: true });
  const r = readSafe(p);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unreadable');
});

test('parseSafe surfaces malformed payloads instead of yielding empty', () => {
  const bad = parseSafe('{ not json');
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'unparsable');
  assert.ok(bad.error);

  const good = parseSafe('{"a":1}');
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { a: 1 });
});

test('parseSafe distinguishes a genuinely empty list from corruption', () => {
  const empty = parseSafe('[]');
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value, []);
  assert.notEqual(parseSafe('[').ok, true, 'truncated JSON is not an empty list');
});

test('parseSafe accepts a custom parser', () => {
  const r = parseSafe('a,b,c', (s) => s.split(','));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, ['a', 'b', 'c']);
});
