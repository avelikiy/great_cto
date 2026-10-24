import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectReleaseContentBytes as inspect } from '../scripts/lib/release-content-inspection.mjs';

const CAP = 8388608;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const policyFor = (bytes, forbiddenUtf8 = ['CANARY'], maxPayloadBytes = CAP) => JSON.stringify({
  expectedPayloadSha256: digest(bytes), forbiddenUtf8, maxPayloadBytes, schemaVersion: 1,
});
const refusal = reason => ({ schemaVersion: 1, status: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reason });
const success = (bytes, policy) => ({
  schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED',
  profile: 'adr043-synthetic-content-v1', payloadSha256: digest(bytes), policySha256: digest(policy), payloadBytes: bytes.length,
});

for (const [name, bytes] of [
  ['empty', Buffer.alloc(0)], ['ASCII', Buffer.from('clean synthetic fixture')],
  ['malformed UTF8', Buffer.from([255, 192, 128, 0, 254])],
]) {
  test(`hashes all observed ${name} bytes and exact policy into a fresh sanitized result`, () => {
    const policy = policyFor(bytes);
    const before = Buffer.from(bytes);
    const first = inspect(bytes, policy);
    assert.deepEqual(first, success(bytes, policy));
    assert.deepEqual(Object.keys(first), Object.keys(success(bytes, policy)));
    const second = inspect(bytes, policy);
    assert.deepEqual(second, first);
    assert.notStrictEqual(first, second);
    first.status = 'changed';
    assert.equal(second.status, 'SYNTHETIC_ONLY');
    assert.deepEqual(bytes, before);
  });
}

for (const [name, bytes, needle] of [
  ['start', Buffer.from('CANARY...'), 'CANARY'],
  ['middle', Buffer.from('..CANARY..'), 'CANARY'],
  ['last offset', Buffer.from('...CANARY'), 'CANARY'],
  ['whole view', Buffer.from('CANARY'), 'CANARY'],
  ['overlap', Buffer.from('aaaaaa'), 'aaaa'],
  ['multibyte', Buffer.from('prefix🧪suffix'), '🧪'],
  ['malformed surroundings', Buffer.concat([Buffer.from([255, 226]), Buffer.from('CANARY'), Buffer.from([128, 240])]), 'CANARY'],
  ['assembled chunks', Buffer.concat([Buffer.from('xxCA'), Buffer.from('NA'), Buffer.from('RYxx')]), 'CANARY'],
]) {
  test(`refuses literal bytes at ${name} without revealing a match or digest`, () => {
    const result = inspect(bytes, policyFor(bytes, [needle]));
    assert.deepEqual(result, refusal('CONTENT_FORBIDDEN'));
    assert.deepEqual(Object.keys(result), Object.keys(refusal('CONTENT_FORBIDDEN')));
  });
}

for (const offset of [0, 100, 512, 1020, 1536]) {
  test(`scans otherwise ignored synthetic container bytes at offset ${offset}`, () => {
    const bytes = Buffer.alloc(2048);
    bytes.write('CANARY', offset);
    assert.deepEqual(inspect(bytes, policyFor(bytes)), refusal('CONTENT_FORBIDDEN'));
  });
}

test('scans SBOM and annotation JSON bytes without interpreting their structure', () => {
  for (const bytes of [Buffer.from('{"sbom":"CANARY"}'), Buffer.from('{"annotation":"CANARY"}')]) {
    assert.deepEqual(inspect(bytes, policyFor(bytes)), refusal('CONTENT_FORBIDDEN'));
  }
});

test('enforces policy, input, native cap, digest and match refusal precedence', () => {
  const bytes = Buffer.from('CANARY');
  const wrongDigest = policyFor(Buffer.from('different'));
  assert.deepEqual(inspect(null, '{}'), refusal('POLICY_INVALID'));
  assert.deepEqual(inspect(bytes, '{}'), refusal('POLICY_INVALID'));
  assert.deepEqual(inspect(null, policyFor(bytes)), refusal('INPUT_INVALID'));
  assert.deepEqual(inspect(bytes, policyFor(bytes, ['CANARY'], 5)), refusal('PAYLOAD_LIMIT'));
  assert.deepEqual(inspect(bytes, wrongDigest), refusal('PAYLOAD_DIGEST'));
  assert.deepEqual(inspect(bytes, policyFor(bytes)), refusal('CONTENT_FORBIDDEN'));
});

test('accepts exact caller and hard caps, refusing one byte above each', () => {
  for (const length of [4, CAP]) {
    const bytes = Buffer.alloc(length, 46);
    const policy = policyFor(bytes, ['CANARY'], length);
    assert.deepEqual(inspect(bytes, policy), success(bytes, policy));
    assert.deepEqual(inspect(Buffer.alloc(length + 1), policy), refusal('PAYLOAD_LIMIT'));
  }
});

test('matches the last offset at the hard cap with 64 maximum-size needles', () => {
  const needles = Array.from({ length: 64 }, (_, i) => `${String(i).padStart(2, '0')}${'x'.repeat(254)}`);
  const bytes = Buffer.alloc(CAP, 46);
  const cleanPolicy = policyFor(bytes, needles);
  assert.deepEqual(inspect(bytes, cleanPolicy), success(bytes, cleanPolicy));
  bytes.write(needles[63], CAP - 256);
  assert.deepEqual(inspect(bytes, policyFor(bytes, needles)), refusal('CONTENT_FORBIDDEN'));
});

test('validates exact scalar types, root keys and canonical spelling', () => {
  const bytes = Buffer.from('safe');
  const valid = policyFor(bytes);
  const parsed = JSON.parse(valid);
  const policies = [null, undefined, 1, {}, new String(valid), '', 'null', '[]', '{}', '\ufeff' + valid, ' ' + valid,
    valid + '\n', valid.replace('schemaVersion":1', 'schemaVersion":1.0'),
    valid.replace('schemaVersion":1', 'schemaVersion":1,"schemaVersion":1'),
    JSON.stringify({ schemaVersion: 1, ...parsed }),
    JSON.stringify({ ...parsed, unknown: 1 }), JSON.stringify({ ...parsed, ['__proto__']: {} }),
    JSON.stringify({ ...parsed, forbiddenUtf8: ['CANA\u0052Y'] }).replace('CANARY', 'CANA\\u0052Y'),
  ];
  for (const key of Object.keys(parsed)) {
    const missing = { ...parsed }; delete missing[key]; policies.push(JSON.stringify(missing));
  }
  for (const value of [0, -1, 1.5, CAP + 1, Number.MAX_SAFE_INTEGER + 1, '4', {}, null]) {
    policies.push(JSON.stringify({ ...parsed, maxPayloadBytes: value }));
  }
  for (const value of ['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), {}, null]) {
    policies.push(JSON.stringify({ ...parsed, expectedPayloadSha256: value }));
  }
  for (const value of [0, 2, '1', null, {}]) policies.push(JSON.stringify({ ...parsed, schemaVersion: value }));
  for (const policy of policies) assert.deepEqual(inspect(bytes, policy), refusal('POLICY_INVALID'));
});

test('bounds policy code units and encoded bytes and accepts the exact canonical byte boundary', () => {
  const bytes = Buffer.alloc(0);
  // Backslashes need two canonical JSON bytes each, allowing the policy byte cap to be reached.
  const needles = Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x100 + i) + '\\'.repeat(254));
  let policy = policyFor(bytes, needles);
  while (Buffer.byteLength(policy) > 32768) {
    const index = needles.findIndex(needle => needle.endsWith('\\'));
    needles[index] = needles[index].slice(0, -1);
    policy = policyFor(bytes, needles);
  }
  if (Buffer.byteLength(policy) === 32767) {
    needles[0] = needles[0].slice(0, -1) + 'a';
    policy = policyFor(bytes, needles);
  }
  assert.equal(Buffer.byteLength(policy), 32768);
  assert.deepEqual(inspect(bytes, policy), success(bytes, policy));
  assert.deepEqual(inspect(bytes, policy + ' '), refusal('POLICY_INVALID'));
  assert.deepEqual(inspect(bytes, ' '.repeat(32769)), refusal('POLICY_INVALID'));
  assert.deepEqual(inspect(bytes, '🧪'.repeat(8193)), refusal('POLICY_INVALID'));
});

test('validates all needle limits, Unicode scalar controls and strict UTF16 ordering', () => {
  const bytes = Buffer.from('safe');
  const invalid = [null, {}, [], ['abc'], ['x'.repeat(257)], ['CANARY', 'CANARY'], ['zzzz', 'aaaa'],
    [null], [1], [{}], [[]], ['\ud800xxx'], ['\udc00xxx'], Array.from({ length: 65 }, (_, i) => `a${String(i).padStart(3, '0')}`),
    ['\ue000xx', '🧪'],
  ];
  for (let code = 0; code <= 159; code++) {
    if (code <= 31 || code >= 127) invalid.push([`ab${String.fromCharCode(code)}cd`]);
  }
  for (const needles of invalid) assert.deepEqual(inspect(bytes, policyFor(bytes, needles)), refusal('POLICY_INVALID'));
  for (const needles of [['abcd'], ['x'.repeat(256)], ['🧪', '\ue000xx'], ['a\u200db'], ['éé']]) {
    const policy = policyFor(bytes, needles);
    assert.deepEqual(inspect(bytes, policy), success(bytes, policy));
  }
});

test('rejects native lookalikes, proxies, subclasses, shared and detached backing without callbacks', () => {
  const bytes = Buffer.from('safe');
  const policy = policyFor(bytes);
  let callbacks = 0;
  const trap = () => { callbacks++; throw new Error('unexpected callback'); };
  class Derived extends Buffer {}
  const subclass = Buffer.from('safe'); Object.setPrototypeOf(subclass, Derived.prototype);
  const altered = Buffer.from('safe'); Object.setPrototypeOf(altered, new Proxy({}, { getPrototypeOf: trap, get: trap }));
  const revoked = Proxy.revocable(bytes, {}); revoked.revoke();
  const detached = Buffer.from(new ArrayBuffer(4)); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const invalid = [undefined, null, true, 4, 'safe', { valueOf: trap, toString: trap }, [],
    new Uint8Array(4), new DataView(new ArrayBuffer(4)), new ArrayBuffer(4),
    new Proxy(bytes, { getPrototypeOf: trap, get: trap }), revoked.proxy, subclass, altered,
    Buffer.from(new SharedArrayBuffer(4)), detached];
  for (const input of invalid) assert.deepEqual(inspect(input, policy), refusal('INPUT_INVALID'));
  assert.deepEqual(inspect(Buffer.from(new SharedArrayBuffer(8)), policyFor(bytes, ['CANARY'], 1)), refusal('INPUT_INVALID'));
  for (const input of [new Proxy({}, { get: trap }), revoked.proxy, { toString: trap }]) {
    assert.deepEqual(inspect(bytes, input), refusal('POLICY_INVALID'));
  }
  assert.equal(callbacks, 0);
});

test('copies only the visible view while ignoring caller properties, methods and iterators', () => {
  const parent = Buffer.from('CANARYsafeCANARY');
  const bytes = parent.subarray(6, 10);
  const policy = policyFor(Buffer.from('safe'));
  let callbacks = 0;
  const poisoned = () => { callbacks++; throw new Error('unexpected callback'); };
  for (const key of ['length', 'byteLength', 'byteOffset', 'buffer', 'constructor', 'subarray', 'indexOf', Symbol.iterator]) {
    Object.defineProperty(bytes, key, { get: poisoned });
  }
  assert.deepEqual(inspect(bytes, policy), success(Buffer.from('safe'), policy));
  assert.equal(callbacks, 0);
  assert.equal(parent.toString(), 'CANARYsafeCANARY');
});

test('binds changes to observed payload and supplied policy', () => {
  const first = Buffer.from('clean one');
  const second = Buffer.from('clean two');
  const policy = policyFor(first);
  assert.deepEqual(inspect(second, policy), refusal('PAYLOAD_DIGEST'));
  assert.deepEqual(inspect(second, policyFor(second)), success(second, policyFor(second)));
  assert.deepEqual(inspect(first, policyFor(first, ['clean'])), refusal('CONTENT_FORBIDDEN'));
  const different = policyFor(first, ['OTHER']);
  assert.notEqual(inspect(first, policy).policySha256, inspect(first, different).policySha256);
});

test('keeps literal-only semantics for encodings, case and normalization variants', () => {
  for (const [text, needle, encoding] of [
    ['Q0FOQVJZ', 'CANARY'], ['43414e415259', 'CANARY'], ['%43%41%4E%41%52%59', 'CANARY'],
    ['\\u0043\\u0041\\u004e\\u0041\\u0052\\u0059', 'CANARY'], ['canary', 'CANARY'],
    ['CANARY', 'CANARY', 'utf16le'], ['cafe\u0301', 'café'], ['CANA', 'CANARY'], ['NARY', 'CANARY'],
  ]) {
    const bytes = Buffer.from(text, encoding);
    const policy = policyFor(bytes, [needle]);
    assert.deepEqual(inspect(bytes, policy), success(bytes, policy));
  }
});
