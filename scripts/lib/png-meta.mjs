/**
 * Version stamps that travel inside a PNG.
 *
 * The README carried a board screenshot from v2.73.1 while the board shipped
 * 3.16.0. Nothing in the repository could tell, because a picture of a screen
 * carries no claim about when the screen looked like that.
 *
 * A sidecar manifest would answer the question until someone moved, copied or
 * re-exported the file. A `tEXt` chunk cannot be separated from the image it
 * describes, so the screenshot itself is the evidence.
 *
 * Pure Node, no dependency: `tEXt` is an uncompressed chunk — a latin-1 key, a
 * NUL, and a latin-1 value — and PNG readers ignore chunks they do not know.
 *
 * @see scripts/capture-screenshots.mjs  (writes the stamp)
 * @see tests/lib/screenshot-freshness.test.mjs  (fails when it drifts)
 */

import { crc32 } from './crc32.mjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function assertPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG: the file does not start with the PNG signature');
  }
}

/** Walk the chunk list. Yields `{ type, data, start, end }` for each chunk. */
function* chunks(buf) {
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('latin1');
    const dataStart = off + 8;
    const end = dataStart + len + 4; // + CRC
    if (end > buf.length) return;
    yield { type, data: buf.subarray(dataStart, dataStart + len), start: off, end };
    off = end;
  }
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Every `tEXt` key/value in the image.
 * A key that is absent is absent — it never reads as an empty string, because
 * "never stamped" and "stamped with nothing" are different facts.
 * @returns {Record<string,string>}
 */
export function readTextChunks(buf) {
  assertPng(buf);
  const out = {};
  for (const c of chunks(buf)) {
    if (c.type !== 'tEXt') continue;
    const nul = c.data.indexOf(0);
    if (nul < 0) continue;
    out[c.data.subarray(0, nul).toString('latin1')] = c.data.subarray(nul + 1).toString('latin1');
  }
  return out;
}

/**
 * Write (or replace) one `tEXt` key. Inserted before `IEND`, which must stay
 * last — a chunk after it is not part of the image and readers stop there.
 */
export function writeTextChunk(buf, key, value) {
  assertPng(buf);
  if (/[^\x20-\x7e]/.test(key) || key.length < 1 || key.length > 79) {
    throw new Error(`tEXt key must be 1–79 printable latin-1 characters: ${JSON.stringify(key)}`);
  }
  const kept = [];
  let iend = null;
  for (const c of chunks(buf)) {
    if (c.type === 'IEND') { iend = buf.subarray(c.start, c.end); continue; }
    if (c.type === 'tEXt') {
      const nul = c.data.indexOf(0);
      if (nul >= 0 && c.data.subarray(0, nul).toString('latin1') === key) continue; // replaced below
    }
    kept.push(buf.subarray(c.start, c.end));
  }
  if (!iend) throw new Error('not a PNG: no IEND chunk');
  const data = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(String(value), 'latin1')]);
  return Buffer.concat([SIGNATURE, ...kept, makeChunk('tEXt', data), iend]);
}
