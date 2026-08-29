// A screenshot that cannot say when it was taken is a screenshot that cannot go
// stale — it just quietly stops being true. The README carried a board shot from
// v2.73.1 while the board shipped 3.16.0: two months and one redesign out of
// date, and nothing in the repository could tell.
//
// So the version travels INSIDE the PNG, in a tEXt chunk. A sidecar manifest
// would work until someone moved the file; a chunk cannot be separated from the
// image it describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTextChunks, writeTextChunk } from '../../scripts/lib/png-meta.mjs';

/** The smallest thing that is structurally a PNG: signature, IHDR, IEND. */
function minimalPng() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(0); // not validated by the reader
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]);
}

test('a version written into a PNG reads back out of it', () => {
  const out = writeTextChunk(minimalPng(), 'great_cto.version', '3.17.0');
  assert.equal(readTextChunks(out)['great_cto.version'], '3.17.0');
});

test('the image still ends with IEND, so it is still a PNG', () => {
  const out = writeTextChunk(minimalPng(), 'great_cto.version', '3.17.0');
  assert.equal(out.subarray(out.length - 8, out.length - 4).toString('latin1'), 'IEND',
    'the chunk must be inserted BEFORE the end marker, not appended after it');
  assert.deepEqual([...out.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('several keys coexist, and a rewrite replaces rather than duplicates', () => {
  let out = writeTextChunk(minimalPng(), 'great_cto.version', '3.16.0');
  out = writeTextChunk(out, 'great_cto.panel', 'inbox');
  out = writeTextChunk(out, 'great_cto.version', '3.17.0');
  const got = readTextChunks(out);
  assert.equal(got['great_cto.version'], '3.17.0', 'the newer value wins');
  assert.equal(got['great_cto.panel'], 'inbox', 'an unrelated key survives');
});

test('an image with no chunk reports absence, not an empty version', () => {
  const got = readTextChunks(minimalPng());
  assert.equal(got['great_cto.version'], undefined,
    'unstamped and stamped-with-nothing are different facts');
});

test('bytes that are not a PNG are refused, not silently accepted', () => {
  assert.throws(() => writeTextChunk(Buffer.from('not a png'), 'k', 'v'), /PNG/i);
});
