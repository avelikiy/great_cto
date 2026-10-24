import { createHash } from 'node:crypto';
import { types } from 'node:util';

const CAP = 8388608;
const POLICY_CAP = 32768;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const setBytes = Uint8Array.prototype.set;
const indexOfBytes = Buffer.prototype.indexOf;

const refuse = reason => ({ schemaVersion: 1, status: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reason });

function validDigest(value) {
  if (typeof value !== 'string' || value.length !== 64) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (!(code >= 48 && code <= 57) && !(code >= 97 && code <= 102)) return false;
  }
  return true;
}

function validNeedle(value) {
  if (typeof value !== 'string' || value.length > 256) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || (code >= 127 && code <= 159)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  const length = Buffer.byteLength(value, 'utf8');
  return length >= 4 && length <= 256;
}

function readPolicy(json) {
  if (typeof json !== 'string' || json.length > POLICY_CAP || Buffer.byteLength(json, 'utf8') > POLICY_CAP) return null;
  let parsed;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 4 || keys[0] !== 'expectedPayloadSha256' || keys[1] !== 'forbiddenUtf8'
    || keys[2] !== 'maxPayloadBytes' || keys[3] !== 'schemaVersion') return null;
  if (parsed.schemaVersion !== 1 || !validDigest(parsed.expectedPayloadSha256)
    || !Number.isSafeInteger(parsed.maxPayloadBytes) || parsed.maxPayloadBytes <= 0 || parsed.maxPayloadBytes > CAP
    || !Array.isArray(parsed.forbiddenUtf8) || parsed.forbiddenUtf8.length < 1 || parsed.forbiddenUtf8.length > 64) return null;
  for (let i = 0; i < parsed.forbiddenUtf8.length; i++) {
    const needle = parsed.forbiddenUtf8[i];
    if (!validNeedle(needle) || (i > 0 && !(parsed.forbiddenUtf8[i - 1] < needle))) return null;
  }
  // Serialization receives only fully validated scalars, never arbitrary parsed trees.
  const canonical = {
    expectedPayloadSha256: parsed.expectedPayloadSha256,
    forbiddenUtf8: [...parsed.forbiddenUtf8],
    maxPayloadBytes: parsed.maxPayloadBytes,
    schemaVersion: 1,
  };
  return JSON.stringify(canonical) === json ? canonical : null;
}

/** Inspect supplied synthetic literals; success grants no release or privacy authority. */
export function inspectReleaseContentBytes(payloadBuffer, policyJson) {
  try {
    const policy = readPolicy(policyJson);
    if (policy === null) return refuse('POLICY_INVALID');
    // Compare the direct prototype before Buffer.isBuffer can walk a hostile chain.
    if (types.isProxy(payloadBuffer) || !types.isUint8Array(payloadBuffer)
      || Object.getPrototypeOf(payloadBuffer) !== Buffer.prototype || !Buffer.isBuffer(payloadBuffer)) return refuse('INPUT_INVALID');
    const backing = bufferGetter.call(payloadBuffer);
    if (types.isSharedArrayBuffer(backing)) return refuse('INPUT_INVALID');
    const length = byteLengthGetter.call(payloadBuffer);
    if (length > policy.maxPayloadBytes) return refuse('PAYLOAD_LIMIT');
    const offset = byteOffsetGetter.call(payloadBuffer);
    let view;
    // Detached views retain their brand; intrinsic view construction detects detachment.
    try { view = new Uint8Array(backing, offset, length); }
    catch (error) { if (error instanceof TypeError) return refuse('INPUT_INVALID'); throw error; }
    const snapshot = Buffer.alloc(length);
    setBytes.call(snapshot, view);
    const payloadSha256 = createHash('sha256').update(snapshot).digest('hex');
    if (payloadSha256 !== policy.expectedPayloadSha256) return refuse('PAYLOAD_DIGEST');
    for (const needle of policy.forbiddenUtf8) {
      if (indexOfBytes.call(snapshot, Buffer.from(needle, 'utf8')) !== -1) return refuse('CONTENT_FORBIDDEN');
    }
    const policySha256 = createHash('sha256').update(policyJson, 'utf8').digest('hex');
    return {
      schemaVersion: 1, status: 'SYNTHETIC_ONLY', authority: 'NONE', releaseEligibility: 'NOT_CHECKED',
      profile: 'adr043-synthetic-content-v1', payloadSha256, policySha256, payloadBytes: length,
    };
  } catch {
    return refuse('INTERNAL_ERROR');
  }
}
