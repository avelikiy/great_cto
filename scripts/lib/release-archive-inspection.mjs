import { createHash } from 'node:crypto';
import { types } from 'node:util';

const PROFILE = 'adr043-synthetic-ustar-v1';
const CAPS = Object.freeze({ maxArchiveBytes: 8388608, maxEntries: 512, maxFileBytes: 1048576, maxTotalFileBytes: 4194304, maxPathBytes: 99, maxDepth: 8 });
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const setBytes = Uint8Array.prototype.set;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const refuse = reason => ({ schemaVersion: 1, status: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reason });

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

// Parse yields native data, but its shape must be bounded before recursive work.
function boundedPolicyTree(root) {
  const pending = [[root, 0]];
  let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (++nodes > 8192 || depth > 8) return false;
    if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 1024) return false;
    if (value === null || typeof value !== 'object') continue;
    const keys = Object.keys(value);
    if (Array.isArray(value) ? value.length > 512 : keys.length > 16) return false;
    for (const key of keys) {
      if (forbiddenKeys.has(key) || Buffer.byteLength(key, 'utf8') > 1024) return false;
      pending.push([value[key], depth + 1]);
    }
  }
  return true;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validPath(path, limits) {
  if (typeof path !== 'string' || path.length > limits.maxPathBytes || !/^package\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(path)) return false;
  const parts = path.split('/');
  return parts.length <= limits.maxDepth && parts.every(part => part !== '.' && part !== '..');
}

function pathIndex() { return { raw: new Set(), folded: new Set(), ancestors: new Set() }; }

function addPath(index, path) {
  if (index.raw.has(path)) return 'TAR_DUPLICATE';
  const folded = path.toLowerCase();
  const parents = [];
  for (let at = folded.indexOf('/'); at !== -1; at = folded.indexOf('/', at + 1)) parents.push(folded.slice(0, at));
  if (index.folded.has(folded) || index.ancestors.has(folded) || parents.some(parent => index.folded.has(parent))) return 'TAR_COLLISION';
  index.raw.add(path);
  index.folded.add(folded);
  for (const parent of parents) index.ancestors.add(parent);
  return null;
}

function readPolicy(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > 131072) return null;
  let policy;
  try { policy = JSON.parse(json); } catch { return null; }
  if (!boundedPolicyTree(policy) || canonical(policy) !== json) return null;
  if (!exactKeys(policy, ['schemaVersion', 'profile', 'limits', 'expectedArchiveSha256', 'files']) || policy.schemaVersion !== 1 || policy.profile !== PROFILE) return null;
  if (!exactKeys(policy.limits, Object.keys(CAPS))) return null;
  for (const [key, cap] of Object.entries(CAPS)) {
    if (!Number.isSafeInteger(policy.limits[key]) || policy.limits[key] <= 0 || policy.limits[key] > cap) return null;
  }
  if (typeof policy.expectedArchiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(policy.expectedArchiveSha256)) return null;
  if (!Array.isArray(policy.files) || policy.files.length === 0 || policy.files.length > policy.limits.maxEntries) return null;
  let total = 0;
  let previous = '';
  const paths = pathIndex();
  for (const file of policy.files) {
    if (!exactKeys(file, ['path', 'size', 'mode', 'sha256']) || !validPath(file.path, policy.limits)) return null;
    if (addPath(paths, file.path) || file.path <= previous) return null;
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > policy.limits.maxFileBytes) return null;
    if (file.mode !== '0644' && file.mode !== '0755') return null;
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) return null;
    total += file.size;
    if (total > policy.limits.maxTotalFileBytes) return null;
    previous = file.path;
  }
  return policy;
}

function zero(bytes, start, end) {
  for (let at = start; at < end; at++) if (bytes[at] !== 0) return false;
  return true;
}

function octal(bytes, start, digits, terminator = 0) {
  if (bytes[start + digits] !== terminator) return null;
  let value = 0;
  for (let at = start; at < start + digits; at++) {
    if (bytes[at] < 48 || bytes[at] > 55) return null;
    value = value * 8 + bytes[at] - 48;
  }
  return value;
}

function matches(bytes, start, text) {
  for (let i = 0; i < text.length; i++) if (bytes[start + i] !== text.charCodeAt(i)) return false;
  return true;
}

function inspectSnapshot(bytes, policy) {
  const length = bytes.length;
  if (length >= 2 && bytes[0] === 31 && bytes[1] === 139) return refuse('UNSUPPORTED_COMPRESSION');
  if (length < 1024 || length % 512 !== 0) return refuse('TAR_LENGTH');
  const inventory = [];
  const paths = pathIndex();
  let totalFileBytes = 0;
  let offset = 0;
  let ended = false;
  while (offset < length) {
    if (zero(bytes, offset, offset + 512)) {
      if (length - offset !== 1024 || !zero(bytes, offset + 512, length)) return refuse('TAR_EOF');
      ended = true;
      break;
    }
    const expectedChecksum = octal(bytes, offset + 148, 6);
    if (expectedChecksum === null || bytes[offset + 155] !== 32) return refuse('TAR_CHECKSUM');
    let actualChecksum = 0;
    for (let i = 0; i < 512; i++) actualChecksum += i >= 148 && i < 156 ? 32 : bytes[offset + i];
    if (actualChecksum !== expectedChecksum) return refuse('TAR_CHECKSUM');
    if (!matches(bytes, offset + 257, 'ustar\0') || !matches(bytes, offset + 263, '00')) return refuse('TAR_FORMAT');
    if (bytes[offset + 156] !== 48) return refuse('TAR_TYPE');
    const mode = matches(bytes, offset + 100, '0000644\0') ? '0644' : matches(bytes, offset + 100, '0000755\0') ? '0755' : null;
    const size = octal(bytes, offset + 124, 11);
    if (mode === null || size === null || !matches(bytes, offset + 108, '0000000\0') || !matches(bytes, offset + 116, '0000000\0') || !matches(bytes, offset + 136, '00000000000\0')) return refuse('TAR_HEADER');
    if (!zero(bytes, offset + 157, offset + 257) || !zero(bytes, offset + 265, offset + 512)) return refuse('TAR_HEADER');
    let nameEnd = offset;
    while (nameEnd < offset + 100 && bytes[nameEnd] !== 0) nameEnd++;
    if (nameEnd === offset + 100 || !zero(bytes, nameEnd, offset + 100)) return refuse('TAR_HEADER');
    // Latin-1 preserves high bytes so they cannot become ASCII through masking.
    const path = bytes.toString('latin1', offset, nameEnd);
    if (!validPath(path, policy.limits)) return refuse('TAR_PATH');
    const collision = addPath(paths, path);
    if (collision) return refuse(collision);
    if (inventory.length && path <= inventory[inventory.length - 1].path) return refuse('TAR_ORDER');
    if (inventory.length >= policy.limits.maxEntries || size > policy.limits.maxFileBytes || size > policy.limits.maxTotalFileBytes - totalFileBytes) return refuse('ENTRY_LIMIT');
    const dataStart = offset + 512;
    if (size > length - dataStart) return refuse('TAR_TRUNCATED');
    const dataEnd = dataStart + size;
    const padding = (512 - size % 512) % 512;
    if (padding > length - dataEnd) return refuse('TAR_TRUNCATED');
    if (!zero(bytes, dataEnd, dataEnd + padding)) return refuse('TAR_PADDING');
    inventory.push({ path, type: 'file', size, mode, sha256: digest(bytes.subarray(dataStart, dataEnd)) });
    totalFileBytes += size;
    offset = dataEnd + padding;
  }
  if (!ended) return refuse('TAR_EOF');
  if (inventory.length === 0) return refuse('EMPTY_ARCHIVE');
  const archiveSha256 = digest(bytes);
  if (archiveSha256 !== policy.expectedArchiveSha256) return refuse('ARCHIVE_DIGEST');
  if (inventory.length !== policy.files.length || inventory.some((file, i) => file.path !== policy.files[i].path)) return refuse('FILE_CLOSURE');
  // Separate passes preserve category precedence even across different files.
  for (const [key, reason] of [['size', 'FILE_SIZE'], ['mode', 'FILE_MODE'], ['sha256', 'FILE_DIGEST']]) {
    if (inventory.some((file, i) => file[key] !== policy.files[i][key])) return refuse(reason);
  }
  return { schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', profile: PROFILE, archiveSha256, archiveBytes: length, fileCount: inventory.length, totalFileBytes, inventory };
}

/** Inspect only the frozen synthetic USTAR profile; this grants no release authority. */
export function inspectArchiveBytes(archiveBytes, policyJson) {
  try {
    const policy = readPolicy(policyJson);
    if (policy === null) return refuse('POLICY_INVALID');
    // Native brands precede prototype access; proxies must never run a trap.
    if (types.isProxy(archiveBytes) || !types.isUint8Array(archiveBytes) || Object.getPrototypeOf(archiveBytes) !== Buffer.prototype || !Buffer.isBuffer(archiveBytes)) return refuse('INPUT_INVALID');
    const backing = bufferGetter.call(archiveBytes);
    if (types.isSharedArrayBuffer(backing)) return refuse('INPUT_INVALID');
    const length = byteLengthGetter.call(archiveBytes);
    if (length > policy.limits.maxArchiveBytes) return refuse('ARCHIVE_LIMIT');
    const offset = byteOffsetGetter.call(archiveBytes);
    const snapshot = Buffer.alloc(length);
    setBytes.call(snapshot, new Uint8Array(backing, offset, length));
    return inspectSnapshot(snapshot, policy);
  } catch {
    return refuse('INTERNAL_ERROR');
  }
}
