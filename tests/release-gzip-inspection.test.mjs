import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, gzipSync } from 'node:zlib';
import { inspectGzipArchiveBytes } from '../scripts/lib/release-gzip-inspection.mjs';

const CAP = 8388608;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const refused = (reason, rawReason) => ({ schemaVersion: 1, status: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reason, ...(rawReason ? { rawReason } : {}) });
const policy = (bytes, overrides = {}) => canonical({ expectedGzipSha256: sha(bytes), maxCompressedBytes: CAP, maxOutputBytes: CAP, schemaVersion: 1, ...overrides });

// Public synthetic USTAR and stored-block gzip bytes do not use the inspector to build expectations.
function stored(bytes) {
  assert.ok(bytes.length < 65536);
  const block = Buffer.alloc(5);
  block[0] = 1;
  block.writeUInt16LE(bytes.length, 1);
  block.writeUInt16LE(bytes.length ^ 65535, 3);
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(bytes), 0);
  trailer.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([Buffer.from('1f8b08000000000000ff', 'hex'), block, bytes, trailer]);
}

function fixture() {
  const data = Buffer.from([0, 255, 128, 10]);
  const header = Buffer.alloc(512);
  header.write('package/run');
  header.write('0000755\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write('00000000004\0', 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header[156] = 48;
  header.write('ustar\0', 257);
  header.write('00', 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  const archive = Buffer.concat([header, data, Buffer.alloc(508 + 1024)]);
  const file = { path: 'package/run', size: 4, mode: '0755', sha256: sha(data) };
  const raw = canonical({ schemaVersion: 1, profile: 'adr043-synthetic-ustar-v1', expectedArchiveSha256: sha(archive), files: [file], limits: { maxArchiveBytes: CAP, maxEntries: 512, maxFileBytes: 1048576, maxTotalFileBytes: 4194304, maxPathBytes: 99, maxDepth: 8 } });
  return { bytes: stored(archive), archive, raw, file };
}

test('canonical outer policy precedes input and raw delegation', () => {
  const f = fixture();
  for (const value of [undefined, {}, null, '', '{}', 'null', '[]', '\uFEFF{}', ' '.repeat(1025), ` ${policy(f.bytes)}`, policy(f.bytes).replace('8388608', '8.388608e6'), policy(f.bytes, { schemaVersion: 2 }), policy(f.bytes, { maxOutputBytes: {} }), policy(f.bytes, { extra: 1 }), policy(f.bytes, { expectedGzipSha256: 'A'.repeat(64) })]) {
    assert.deepEqual(inspectGzipArchiveBytes(null, value, {}), refused('POLICY_INVALID'));
  }
  for (const key of ['maxCompressedBytes', 'maxOutputBytes']) for (const value of [0, -1, CAP + 1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(inspectGzipArchiveBytes(f.bytes, policy(f.bytes, { [key]: value }), f.raw), refused('POLICY_INVALID'));
});

test('stored gzip returns the entire fresh observed raw inventory with no authority', () => {
  const f = fixture();
  const before = Buffer.from(f.bytes);
  const expected = { schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', profile: 'adr043-synthetic-gzip-ustar-v1', gzipSha256: sha(f.bytes), gzipBytes: f.bytes.length, archive: { schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', profile: 'adr043-synthetic-ustar-v1', archiveSha256: sha(f.archive), archiveBytes: f.archive.length, fileCount: 1, totalFileBytes: 4, inventory: [{ ...f.file, type: 'file' }] } };
  const result = inspectGzipArchiveBytes(f.bytes, policy(f.bytes), f.raw);
  assert.deepEqual(result, expected);
  result.archive.inventory[0].path = 'changed';
  assert.deepEqual(inspectGzipArchiveBytes(f.bytes, policy(f.bytes), f.raw), expected);
  assert.deepEqual(f.bytes, before);
});

test('native brands reject hostile proxies, prototypes, shared and detached backing without callbacks', () => {
  const f = fixture();
  let callbacks = 0;
  const trap = () => { callbacks++; throw Error('sentinel'); };
  const proxy = new Proxy(f.bytes, { get: trap, getPrototypeOf: trap });
  const revoked = Proxy.revocable(f.bytes, {}); revoked.revoke();
  const foreign = new Uint8Array(f.bytes); Object.setPrototypeOf(foreign, new Proxy({}, { getPrototypeOf: trap }));
  const subclass = Buffer.from(f.bytes); Object.setPrototypeOf(subclass, Object.create(Buffer.prototype));
  const backing = new ArrayBuffer(32); const detached = Buffer.from(backing); structuredClone(backing, { transfer: [backing] });
  for (const input of [undefined, null, {}, new Uint8Array(f.bytes), new ArrayBuffer(32), new DataView(new ArrayBuffer(32)), proxy, revoked.proxy, foreign, subclass, Buffer.from(new SharedArrayBuffer(32)), detached]) assert.deepEqual(inspectGzipArchiveBytes(input, policy(f.bytes), f.raw), refused('INPUT_INVALID'));
  assert.equal(callbacks, 0);
});

test('snapshot ignores own poisoned properties and excludes surrounding backing bytes', () => {
  const f = fixture();
  const surrounded = Buffer.concat([Buffer.from('hostile prefix'), f.bytes, Buffer.from('hostile suffix')]);
  const view = surrounded.subarray(14, 14 + f.bytes.length);
  const json = policy(f.bytes);
  let callbacks = 0;
  for (const key of ['length', 'byteLength', 'byteOffset', 'buffer', 'constructor', Symbol.iterator]) Object.defineProperty(view, key, { get() { callbacks++; throw Error('sentinel'); } });
  assert.equal(inspectGzipArchiveBytes(view, json, f.raw).gzipSha256, sha(f.bytes));
  assert.equal(callbacks, 0);
});

test('compressed and expanded limits accept equality and refuse the next byte', () => {
  const f = fixture();
  assert.equal(inspectGzipArchiveBytes(f.bytes, policy(f.bytes, { maxCompressedBytes: f.bytes.length, maxOutputBytes: f.archive.length }), f.raw).status, 'SYNTHETIC_ONLY');
  assert.deepEqual(inspectGzipArchiveBytes(f.bytes, policy(f.bytes, { maxCompressedBytes: f.bytes.length - 1 }), f.raw), refused('COMPRESSED_LIMIT'));
  assert.deepEqual(inspectGzipArchiveBytes(f.bytes, policy(f.bytes, { maxOutputBytes: f.archive.length - 1 }), f.raw), refused('OUTPUT_LIMIT'));
  const bomb = gzipSync(Buffer.alloc(CAP + 1));
  assert.ok(bomb.length < 10000);
  assert.deepEqual(inspectGzipArchiveBytes(bomb, policy(bomb), f.raw), refused('OUTPUT_LIMIT'));
});

test('length, header and every flag have explicit ordered refusals', () => {
  const f = fixture();
  for (let length = 0; length < 18; length++) assert.deepEqual(inspectGzipArchiveBytes(f.bytes.subarray(0, length), policy(f.bytes), {}), refused('GZIP_LENGTH'));
  for (const offset of [0, 1, 2]) { const bytes = Buffer.from(f.bytes); bytes[offset] ^= 255; bytes[3] = 255; assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(f.bytes), {}), refused('GZIP_HEADER')); }
  for (const flag of [1, 2, 4, 8, 16, 32, 64, 128, 255]) { const bytes = Buffer.from(f.bytes); bytes[3] = flag; assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(f.bytes), {}), refused('GZIP_FLAGS')); }
});

test('opaque metadata is hash-bound without timestamp or OS interpretation', () => {
  const f = fixture();
  for (let offset = 4; offset <= 9; offset++) { const bytes = Buffer.from(f.bytes); bytes[offset] ^= 255; assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(f.bytes), f.raw), refused('GZIP_DIGEST')); assert.equal(inspectGzipArchiveBytes(bytes, policy(bytes), f.raw).status, 'SYNTHETIC_ONLY'); }
});

test('deflate corruption and incomplete streams refuse before hash and raw policy', () => {
  const f = fixture();
  const invalid = Buffer.from(f.bytes); invalid[10] = 7;
  const badStored = Buffer.from(f.bytes); badStored[13] ^= 1;
  for (const bytes of [invalid, badStored, f.bytes.subarray(0, 20)]) assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(f.bytes), {}), refused('GZIP_DEFLATE'));
});

test('exact tail rejects short trailers, concatenation and zero or nonzero padding', () => {
  const f = fixture();
  const empty = Buffer.from('1f8b08000000000000ff03000000000000000000', 'hex');
  for (const bytes of [f.bytes.subarray(0, -1), f.bytes.subarray(0, -8), Buffer.concat([f.bytes, f.bytes]), Buffer.concat([f.bytes, empty]), Buffer.concat([f.bytes, Buffer.from([0])]), Buffer.concat([f.bytes, Buffer.from([1, 2, 3])]), Buffer.concat([f.bytes, Buffer.alloc(32)])]) assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(f.bytes), {}), refused('GZIP_TRAILING'));
});

test('CRC precedes ISIZE, and both precede observed compressed digest', () => {
  const f = fixture();
  for (const [crc, size, reason] of [[true, false, 'GZIP_CRC'], [false, true, 'GZIP_ISIZE'], [true, true, 'GZIP_CRC']]) {
    const bytes = Buffer.from(f.bytes);
    if (crc) bytes[bytes.length - 8] ^= 1;
    if (size) bytes.writeUInt32LE(0xffffffff, bytes.length - 4);
    assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(f.bytes), {}), refused(reason));
  }
  assert.deepEqual(inspectGzipArchiveBytes(f.bytes, policy(f.bytes, { expectedGzipSha256: '0'.repeat(64) }), {}), refused('GZIP_DIGEST'));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('raw policy remains opaque until gzip passes, with controlled nested refusals', () => {
  const f = fixture();
  let callbacks = 0;
  const raw = new Proxy({}, { get() { callbacks++; throw Error('sentinel'); } });
  assert.deepEqual(inspectGzipArchiveBytes(f.bytes, policy(f.bytes), raw), refused('RAW_REFUSED', 'POLICY_INVALID'));
  const empty = Buffer.from('1f8b08000000000000ff03000000000000000000', 'hex');
  assert.deepEqual(inspectGzipArchiveBytes(empty, policy(empty), f.raw), refused('RAW_REFUSED', 'TAR_LENGTH'));
  const zeros = stored(Buffer.alloc(1024));
  assert.deepEqual(inspectGzipArchiveBytes(zeros, policy(zeros), f.raw), refused('RAW_REFUSED', 'EMPTY_ARCHIVE'));
  assert.equal(callbacks, 0);
});

test('native compression interoperability preserves exact raw result', () => {
  const f = fixture();
  for (const level of [0, 1, 6, 9]) { const bytes = gzipSync(f.archive, { level }); assert.deepEqual(inspectGzipArchiveBytes(bytes, policy(bytes), f.raw).archive.inventory, [{ ...f.file, type: 'file' }]); }
});
