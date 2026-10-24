import { createHash } from 'node:crypto';
import { types } from 'node:util';
import * as zlib from 'node:zlib';
import { inspectArchiveBytes } from './release-archive-inspection.mjs';

const CAP = 8388608;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const setBytes = Uint8Array.prototype.set;
const rawReasons = new Set(['POLICY_INVALID', 'INPUT_INVALID', 'ARCHIVE_LIMIT', 'UNSUPPORTED_COMPRESSION', 'TAR_LENGTH', 'TAR_EOF', 'EMPTY_ARCHIVE', 'TAR_CHECKSUM', 'TAR_FORMAT', 'TAR_TYPE', 'TAR_HEADER', 'TAR_PATH', 'TAR_DUPLICATE', 'TAR_COLLISION', 'TAR_ORDER', 'ENTRY_LIMIT', 'TAR_TRUNCATED', 'TAR_PADDING', 'ARCHIVE_DIGEST', 'FILE_CLOSURE', 'FILE_SIZE', 'FILE_MODE', 'FILE_DIGEST']);
const refuse = reason => ({ schemaVersion: 1, status: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reason });

function readPolicy(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > 1024) return null;
  let policy;
  try { policy = JSON.parse(json); } catch { return null; }
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)
    || Object.keys(policy).sort().join(',') !== 'expectedGzipSha256,maxCompressedBytes,maxOutputBytes,schemaVersion') return null;
  if (policy.schemaVersion !== 1 || typeof policy.expectedGzipSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(policy.expectedGzipSha256)) return null;
  for (const key of ['maxCompressedBytes', 'maxOutputBytes']) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0 || policy[key] > CAP) return null;
  }
  // Only validated primitive values enter serialization; arbitrary parsed trees never do.
  const canonical = { expectedGzipSha256: policy.expectedGzipSha256, maxCompressedBytes: policy.maxCompressedBytes, maxOutputBytes: policy.maxOutputBytes, schemaVersion: 1 };
  return JSON.stringify(canonical) === json ? canonical : null;
}

function inspectSnapshot(bytes, policy, rawPolicyJson) {
  if (bytes.length < 18) return refuse('GZIP_LENGTH');
  if (bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8) return refuse('GZIP_HEADER');
  if (bytes[3] !== 0) return refuse('GZIP_FLAGS');
  if (typeof zlib.inflateRawSync !== 'function' || typeof zlib.crc32 !== 'function') return refuse('RUNTIME_UNSUPPORTED');
  // Include the trailer so native first-stream consumption supplies the sole boundary.
  const compressed = bytes.subarray(10);
  let inflated;
  try { inflated = zlib.inflateRawSync(compressed, { info: true, maxOutputLength: policy.maxOutputBytes }); }
  catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE') return refuse('OUTPUT_LIMIT');
    if (error?.code === 'Z_BUF_ERROR' || error?.code === 'Z_DATA_ERROR') return refuse('GZIP_DEFLATE');
    return refuse('INTERNAL_ERROR');
  }
  if (!inflated || !Buffer.isBuffer(inflated.buffer)) return refuse('RUNTIME_UNSUPPORTED');
  const output = inflated.buffer;
  if (output.length > policy.maxOutputBytes) return refuse('OUTPUT_LIMIT');
  const consumed = inflated.engine?.bytesWritten;
  if (!Number.isSafeInteger(consumed) || consumed <= 0 || consumed > compressed.length) return refuse('RUNTIME_UNSUPPORTED');
  if (compressed.length - consumed !== 8) return refuse('GZIP_TRAILING');
  const trailer = 10 + consumed;
  if (bytes.readUInt32LE(trailer) !== zlib.crc32(output)) return refuse('GZIP_CRC');
  if (bytes.readUInt32LE(trailer + 4) !== output.length) return refuse('GZIP_ISIZE');
  const gzipSha256 = createHash('sha256').update(bytes).digest('hex');
  if (gzipSha256 !== policy.expectedGzipSha256) return refuse('GZIP_DIGEST');
  const archive = inspectArchiveBytes(output, rawPolicyJson);
  if (!archive) return refuse('INTERNAL_ERROR');
  if (archive.status === 'REFUSED') {
    return rawReasons.has(archive.reason) ? { ...refuse('RAW_REFUSED'), rawReason: archive.reason } : refuse('INTERNAL_ERROR');
  }
  if (archive.status !== 'SYNTHETIC_ONLY' || archive.schemaVersion !== 1 || archive.authority !== 'NONE' || archive.releaseEligibility !== 'NOT_CHECKED' || archive.profile !== 'adr043-synthetic-ustar-v1') return refuse('INTERNAL_ERROR');
  return { schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', profile: 'adr043-synthetic-gzip-ustar-v1', gzipSha256, gzipBytes: bytes.length, archive };
}

/** Inspect the bounded synthetic gzip profile without granting release authority. */
export function inspectGzipArchiveBytes(gzipBytes, gzipPolicyJson, rawPolicyJson) {
  try {
    const policy = readPolicy(gzipPolicyJson);
    if (policy === null) return refuse('POLICY_INVALID');
    // Exact direct prototype comparison must precede Buffer.isBuffer's chain walk.
    if (types.isProxy(gzipBytes) || !types.isUint8Array(gzipBytes) || Object.getPrototypeOf(gzipBytes) !== Buffer.prototype || !Buffer.isBuffer(gzipBytes)) return refuse('INPUT_INVALID');
    const backing = bufferGetter.call(gzipBytes);
    if (types.isSharedArrayBuffer(backing)) return refuse('INPUT_INVALID');
    const length = byteLengthGetter.call(gzipBytes);
    if (length > policy.maxCompressedBytes) return refuse('COMPRESSED_LIMIT');
    const offset = byteOffsetGetter.call(gzipBytes);
    let view;
    // Detached typed arrays retain their native brands; view creation detects detachment.
    try { view = new Uint8Array(backing, offset, length); }
    catch (error) { if (error instanceof TypeError) return refuse('INPUT_INVALID'); throw error; }
    const snapshot = Buffer.alloc(length);
    setBytes.call(snapshot, view);
    return inspectSnapshot(snapshot, policy, rawPolicyJson);
  } catch {
    return refuse('INTERNAL_ERROR');
  }
}
