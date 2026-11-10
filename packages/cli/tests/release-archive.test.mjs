import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { encodeReleaseArchive, inspectReleaseArchive } from '../src/release-archive.mjs';

const file = (path, text = 'data', mode = 0o644) => ({ path, bytes: Buffer.from(text), mode });
function mutate(archive, edit) {
  const raw = gunzipSync(archive); edit(raw);
  raw.fill(32, 148, 156);
  const sum = raw.subarray(0, 512).reduce((a, b) => a + b, 0);
  raw.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return gzipSync(raw);
}

test('canonical archive is deterministic and retains exact bytes and approved modes', () => {
  const files = [file('dist/main.js', 'export {};'), file('index.mjs', '#!/usr/bin/env node\n', 0o755)];
  const a = encodeReleaseArchive(files), b = encodeReleaseArchive([...files].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(inspectReleaseArchive(a), files.sort((x, y) => x.path.localeCompare(y.path)));
});

test('USTAR prefix carries long runtime paths without PAX', () => {
  const name = 'skills/' + 'deep-segment/'.repeat(9) + 'runtime.mjs';
  assert.equal(inspectReleaseArchive(encodeReleaseArchive([file(name)]))[0].path, name);
});

test('writer refuses traversal, platform aliases, reserved names and private files', () => {
  for (const path of ['../escape', '/absolute', 'a/../escape', 'a\\escape', 'a//b', 'a/.', 'a:stream', 'a/NUL', 'a/trailing.', '.env', '.great_cto/state', '.git/config', 'a/space ']) {
    assert.throws(() => encodeReleaseArchive([file(path)]), /path|private|reserved|name/);
  }
  assert.throws(() => encodeReleaseArchive([file('a', '', 0o4755)]), /mode/);
});

test('both directions reject duplicate, case-colliding and file-parent membership', () => {
  for (const files of [[file('a'), file('a')], [file('A'), file('a')], [file('a'), file('a/b')]]) {
    assert.throws(() => encodeReleaseArchive(files), /collis|duplicate|parent/);
  }
  const single = encodeReleaseArchive([file('a')]);
  const raw = gunzipSync(single);
  const duplicate = Buffer.concat([raw.subarray(0, 1024), raw]);
  assert.throws(() => inspectReleaseArchive(gzipSync(duplicate)), /duplicate|collis/);
});

test('reader rejects all executable archive metadata and alternate extract semantics', () => {
  const archive = encodeReleaseArchive([file('a')]);
  for (const type of ['1', '2', '3', '4', '5', '6', 'x', 'g', 'L']) {
    assert.throws(() => inspectReleaseArchive(mutate(archive, raw => { raw[156] = type.charCodeAt(0); })), /type|regular/);
  }
  assert.throws(() => inspectReleaseArchive(mutate(archive, raw => { raw.write('../outside', 0, 'ascii'); })), /path/);
  assert.throws(() => inspectReleaseArchive(mutate(archive, raw => { raw.write('0004755\0', 100, 'ascii'); })), /mode/);
});

test('reader rejects malformed checksums, truncation, trailing content and wrong roots', () => {
  const archive = encodeReleaseArchive([file('a')]);
  const raw = gunzipSync(archive); raw[0] ^= 1;
  assert.throws(() => inspectReleaseArchive(gzipSync(raw)), /checksum/);
  assert.throws(() => inspectReleaseArchive(archive.subarray(0, archive.length - 7)), /archive|gzip|compressed|unexpected|end/i);
  assert.throws(() => inspectReleaseArchive(gzipSync(gunzipSync(archive).subarray(0, 1024))), /terminat|end|padding/);
  assert.throws(() => inspectReleaseArchive(Buffer.concat([archive, Buffer.from('junk')])), /archive|gzip|header|compressed|incorrect/i);
  assert.throws(() => inspectReleaseArchive(archive, { prefix: 'plugin' }), /root|prefix/);
});

test('impossible USTAR field splitting and empty or multi-root archives refuse', () => {
  assert.throws(() => encodeReleaseArchive([]), /entry count/);
  assert.throws(() => encodeReleaseArchive([file('a'.repeat(101))]), /USTAR/);
  assert.throws(() => encodeReleaseArchive([file('a')], { prefix: 'one/two' }), /prefix/);
  assert.throws(() => inspectReleaseArchive(gzipSync(Buffer.alloc(1024))), /entry count/);
});
