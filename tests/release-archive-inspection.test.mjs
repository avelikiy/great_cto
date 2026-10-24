import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectArchiveBytes } from '../scripts/lib/release-archive-inspection.mjs';

const PROFILE = 'adr043-synthetic-ustar-v1';
const LIMITS = { maxArchiveBytes: 8388608, maxEntries: 512, maxFileBytes: 1048576, maxTotalFileBytes: 4194304, maxPathBytes: 99, maxDepth: 8 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const refusal = reason => ({ schemaVersion: 1, status: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reason });

// Literal public fixtures have no dependency on production builders or private oracles.
function checksum(header) {
  header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return header;
}

function header(path, size, mode = '0644') {
  const result = Buffer.alloc(512);
  result.write(path, 0, 'ascii');
  result.write(`${Number.parseInt(mode, 8).toString(8).padStart(7, '0')}\0`, 100, 'ascii');
  result.write('0000000\0', 108, 'ascii');
  result.write('0000000\0', 116, 'ascii');
  result.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  result.write('00000000000\0', 136, 'ascii');
  result[156] = 48;
  result.write('ustar\0', 257, 'ascii');
  result.write('00', 263, 'ascii');
  return checksum(result);
}

function fixture(files = [{ path: 'package/a.txt', data: Buffer.from('public synthetic payload\n') }, { path: 'package/zero', data: Buffer.alloc(0) }]) {
  const inventory = files.map(({ path, data, mode = '0644' }) => ({ path, type: 'file', size: data.length, mode, sha256: sha(data) }));
  const archive = Buffer.concat([...files.flatMap(({ path, data, mode }) => [header(path, data.length, mode), data, Buffer.alloc((512 - data.length % 512) % 512)]), Buffer.alloc(1024)]);
  const policy = { schemaVersion: 1, profile: PROFILE, limits: { ...LIMITS }, expectedArchiveSha256: sha(archive), files: inventory.map(({ type, ...file }) => file) };
  return { archive, policy, inventory };
}

function inspect(f, policy = f.policy) { return inspectArchiveBytes(f.archive, canonical(policy)); }
function mutate(f, offset, value, repair = true) {
  const archive = Buffer.from(f.archive);
  archive[offset] = value;
  if (repair) checksum(archive.subarray(0, 512));
  return { ...f, archive };
}

test('literal inventory, observed archive and payload hashes, deterministic fresh results', () => {
  const f = fixture();
  const expected = { schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', profile: PROFILE, archiveSha256: sha(f.archive), archiveBytes: f.archive.length, fileCount: 2, totalFileBytes: 25, inventory: f.inventory };
  assert.equal(f.inventory[0].size, 25);
  assert.deepEqual(inspect(f), expected);
  const first = inspect(f);
  first.inventory[0].path = 'changed';
  assert.deepEqual(inspect(f), expected);
});

test('zero-byte minimum and opaque binary executable contents', () => {
  const zero = fixture([{ path: 'package/zero', data: Buffer.alloc(0) }]);
  assert.equal(zero.archive.length, 1536);
  assert.equal(inspect(zero).status, 'SYNTHETIC_ONLY');
  const data = Buffer.concat([Buffer.from([255, 0, 128]), Buffer.alloc(1024), Buffer.from([0, 1])]);
  const f = fixture([{ path: 'package/run', data, mode: '0755' }]);
  assert.deepEqual(inspect(f).inventory, f.inventory);
});

test('policy primitive, canonical representation, schema, integer and limit constraints', () => {
  const f = fixture();
  for (const policy of [undefined, null, {}, new Proxy({}, {}), '', 'null', '{}', ` ${canonical(f.policy)}`, `${canonical(f.policy)}\n`, '\uFEFF{}', '{"schemaVersion":1,"schemaVersion":1}', canonical({ ...f.policy, extra: true }), canonical({ ...f.policy, schemaVersion: 2 }), canonical({ ...f.policy, expectedArchiveSha256: 'A'.repeat(64) })]) {
    assert.deepEqual(inspectArchiveBytes(f.archive, policy), refusal('POLICY_INVALID'));
  }
  for (const key of Object.keys(LIMITS)) {
    for (const value of [0, -1, LIMITS[key] + 1, Number.MAX_SAFE_INTEGER + 1]) {
      assert.deepEqual(inspect(f, { ...f.policy, limits: { ...LIMITS, [key]: value } }), refusal('POLICY_INVALID'));
    }
  }
  for (const files of [[], [...f.policy.files].reverse(), [f.policy.files[0], f.policy.files[0]], [{ ...f.policy.files[0], size: -1 }], [{ ...f.policy.files[0], mode: '0777' }], [{ ...f.policy.files[0], path: 'package/../private' }]]) {
    assert.deepEqual(inspect(f, { ...f.policy, files }), refusal('POLICY_INVALID'));
  }
});

test('policy preflight safely refuses deep, wide and oversized JSON', () => {
  const f = fixture();
  for (const text of ['['.repeat(20000) + '0' + ']'.repeat(20000), ' '.repeat(131073), canonical(Array(513).fill(0)), canonical(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i]))), canonical('a'.repeat(1025)), '{"__proto__":{}}', '{"constructor":0}', '{"prototype":0}']) {
    assert.deepEqual(inspectArchiveBytes(f.archive, text), refusal('POLICY_INVALID'));
  }
});

test('native input guards reject proxies, subclasses and shared backing without callbacks', () => {
  const f = fixture();
  let callbacks = 0;
  class Derived extends Buffer {}
  const subclass = Buffer.from(f.archive);
  Object.setPrototypeOf(subclass, Derived.prototype);
  const proxy = new Proxy(f.archive, { get() { callbacks++; throw Error('sentinel'); }, getPrototypeOf() { callbacks++; throw Error('sentinel'); } });
  for (const input of [undefined, null, [], new Uint8Array(f.archive), {}, subclass, proxy, Buffer.from(new SharedArrayBuffer(2048))]) {
    assert.deepEqual(inspectArchiveBytes(input, canonical(f.policy)), refusal('INPUT_INVALID'));
  }
  assert.equal(callbacks, 0);
  const original = Buffer.from(f.archive);
  for (const property of ['length', 'byteLength', 'buffer', 'byteOffset', Symbol.iterator]) Object.defineProperty(f.archive, property, { get() { callbacks++; throw Error('sentinel'); } });
  assert.equal(inspect(f).status, 'SYNTHETIC_ONLY');
  assert.equal(callbacks, 0);
  const intrinsic = Object.getPrototypeOf(Uint8Array.prototype);
  const get = key => Object.getOwnPropertyDescriptor(intrinsic, key).get.call(f.archive);
  assert.equal(Buffer.compare(original, Buffer.from(new Uint8Array(get('buffer'), get('byteOffset'), get('byteLength')))), 0);
});

test('a native typed array with a proxy in its prototype chain executes no traps', () => {
  const f = fixture();
  let calls = 0;
  const input = new Uint8Array(f.archive);
  Object.setPrototypeOf(input, new Proxy({}, { getPrototypeOf() { calls++; throw Error('prototype sentinel'); } }));
  assert.deepEqual(inspectArchiveBytes(input, canonical(f.policy)), refusal('INPUT_INVALID'));
  assert.equal(calls, 0);
});

test('input limits, compression and raw lengths have fixed precedence', () => {
  const f = fixture();
  assert.deepEqual(inspectArchiveBytes(null, '{}'), refusal('POLICY_INVALID'));
  assert.deepEqual(inspectArchiveBytes(Buffer.alloc(8388609), canonical(f.policy)), refusal('ARCHIVE_LIMIT'));
  assert.deepEqual(inspectArchiveBytes(Buffer.from([31, 139]), canonical(f.policy)), refusal('UNSUPPORTED_COMPRESSION'));
  for (const size of [0, 1, 511, 1023, 1535]) assert.deepEqual(inspectArchiveBytes(Buffer.alloc(size), canonical(f.policy)), refusal('TAR_LENGTH'));
  assert.deepEqual(inspectArchiveBytes(Buffer.alloc(1024), canonical(f.policy)), refusal('EMPTY_ARCHIVE'));
  assert.deepEqual(inspect(f, { ...f.policy, limits: { ...LIMITS, maxArchiveBytes: f.archive.length - 1 } }), refusal('ARCHIVE_LIMIT'));
});

test('EOF must be exactly two terminal zero blocks', () => {
  const f = fixture();
  for (const archive of [f.archive.subarray(0, -512), f.archive.subarray(0, -1024), Buffer.concat([f.archive, Buffer.alloc(512)]), Buffer.concat([f.archive, f.archive]), Buffer.concat([Buffer.alloc(512), f.archive])]) assert.deepEqual(inspect({ ...f, archive }), refusal('TAR_EOF'));
});

test('header checksum precedes format, type, metadata and path checks', () => {
  const f = fixture();
  assert.deepEqual(inspect(mutate(f, 0, 47, false)), refusal('TAR_CHECKSUM'));
  assert.deepEqual(inspect(mutate(f, 148, 32, false)), refusal('TAR_CHECKSUM'));
  for (const offset of [257, 262, 263, 264]) assert.deepEqual(inspect(mutate(f, offset, 88)), refusal('TAR_FORMAT'));
  for (const type of [0, ...Buffer.from('1234567xgLKSt?')]) assert.deepEqual(inspect(mutate(f, 156, type)), refusal('TAR_TYPE'));
});

test('canonical numeric fields, NUL name padding and all unused metadata', () => {
  const f = fixture();
  for (const offset of [100, 107, 108, 115, 116, 123, 135, 136, 147, 157, 265, 297, 329, 337, 345, 500, 511, 99]) assert.deepEqual(inspect(mutate(f, offset, 49)), refusal('TAR_HEADER'), `offset ${offset}`);
  assert.deepEqual(inspect(mutate(f, 124, 56)), refusal('TAR_HEADER'));
  const noNul = Buffer.from(f.archive);
  noNul.fill(97, 0, 100);
  checksum(noNul.subarray(0, 512));
  assert.deepEqual(inspect({ ...f, archive: noNul }), refusal('TAR_HEADER'));
});

test('path grammar and caller path limits', () => {
  const base = fixture();
  for (const path of ['/package/a', 'other/a', 'package/../a', 'package/./a', 'package//a', 'package/a/', 'package/a:b', 'package/a\\b', 'package/a\n', 'package/a/b/c/d/e/f/g/h']) {
    const malformed = fixture([{ path, data: Buffer.alloc(0) }]);
    assert.deepEqual(inspect({ ...base, archive: malformed.archive }), refusal('TAR_PATH'), path);
  }
  assert.deepEqual(inspect(base, { ...base.policy, limits: { ...LIMITS, maxPathBytes: 10 }, files: [{ ...base.policy.files[0], path: 'package/x' }] }), refusal('TAR_PATH'));
});

test('duplicates and casefolded ancestor collisions precede physical order', () => {
  const base = fixture();
  for (const [paths, reason] of [[['package/a', 'package/a'], 'TAR_DUPLICATE'], [['package/a', 'package/A'], 'TAR_COLLISION'], [['package/a/b', 'package/a'], 'TAR_COLLISION'], [['package/a', 'package/A/b'], 'TAR_COLLISION'], [['package/z', 'package/a'], 'TAR_ORDER']]) {
    const f = fixture(paths.map(path => ({ path, data: Buffer.alloc(0) })));
    assert.deepEqual(inspect({ ...base, archive: f.archive }), refusal(reason));
  }
});

test('entry bounds precede payload truncation; payload padding is checked', () => {
  const f = fixture();
  assert.deepEqual(inspect(f, { ...f.policy, limits: { ...LIMITS, maxEntries: 1 }, files: [f.policy.files[0]] }), refusal('ENTRY_LIMIT'));
  const huge = Buffer.concat([header('package/a', 1048577), Buffer.alloc(1024)]);
  assert.deepEqual(inspect({ ...f, archive: huge }), refusal('ENTRY_LIMIT'));
  const truncated = Buffer.concat([header('package/a', 4096), Buffer.alloc(1024)]);
  assert.deepEqual(inspect({ ...f, archive: truncated }), refusal('TAR_TRUNCATED'));
  assert.deepEqual(inspect(mutate(f, 512 + f.inventory[0].size, 1, false)), refusal('TAR_PADDING'));
});

test('semantic comparisons use archive, closure, all sizes, all modes, all digests passes', () => {
  const f = fixture();
  assert.deepEqual(inspect(f, { ...f.policy, expectedArchiveSha256: '0'.repeat(64) }), refusal('ARCHIVE_DIGEST'));
  assert.deepEqual(inspect(f, { ...f.policy, files: [f.policy.files[0]] }), refusal('FILE_CLOSURE'));
  assert.deepEqual(inspect(f, { ...f.policy, files: [{ ...f.policy.files[0], mode: '0755', sha256: '0'.repeat(64) }, { ...f.policy.files[1], size: 1 }] }), refusal('FILE_SIZE'));
  assert.deepEqual(inspect(f, { ...f.policy, files: [{ ...f.policy.files[0], mode: '0755', sha256: '0'.repeat(64) }, f.policy.files[1]] }), refusal('FILE_MODE'));
  assert.deepEqual(inspect(f, { ...f.policy, files: [{ ...f.policy.files[0], sha256: '0'.repeat(64) }, f.policy.files[1]] }), refusal('FILE_DIGEST'));
});

test('sanitized refusals never reveal caller text; caller-approved content remains synthetic', () => {
  const f = fixture([{ path: 'package/public-canary', data: Buffer.from('synthetic canary fixture') }]);
  assert.equal(inspect(f).status, 'SYNTHETIC_ONLY');
  const result = inspect(f, { ...f.policy, files: [{ ...f.policy.files[0], sha256: '0'.repeat(64) }] });
  assert.deepEqual(result, refusal('FILE_DIGEST'));
  assert.equal(JSON.stringify(result).includes('canary'), false);
});
