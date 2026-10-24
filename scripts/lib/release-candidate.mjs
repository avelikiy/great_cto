/** Local synthetic wire consistency only. Digests and identity labels confer no authority. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const identityKeys = ['repository', 'source', 'package', 'channel', 'workflow',
  'policySha256', 'toolchainSha256', 'lockfileSha256', 'testPolicySha256'];
const candidateKeys = [...identityKeys, 'schemaVersion', 'tarball', 'fileManifestSha256',
  'sbomSha256', 'buildRecordSha256', 'reviewEvidenceSha256'];
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get;
const refusal = reason => ({ status: 'REFUSED', reason });
const stringMatches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const sha256 = value => stringMatches(value, /^[a-f0-9]{64}$/);
const gitId = value => stringMatches(value, /^[a-f0-9]{40}$/);
const keysAre = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function excessiveNesting(wire) {
  let depth = 0, quoted = false, escaped = false;
  for (const char of wire) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') { if (++depth > 16) return true; }
    else if (char === '}' || char === ']') depth--;
  }
  return false;
}

function stringIssue(value) {
  if (Buffer.byteLength(value, 'utf8') > 2048) return 'LIMIT_EXCEEDED';
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return 'SCHEMA_INVALID';
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return 'SCHEMA_INVALID';
  }
  return null;
}

function valueBounds(value) {
  const pending = [value];
  let surrogate = false;
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') {
      const issue = stringIssue(current);
      if (issue === 'LIMIT_EXCEEDED') return issue;
      if (issue) surrogate = true;
    } else if (current !== null && typeof current === 'object') {
      for (const key of Object.keys(current)) {
        const issue = stringIssue(key);
        if (issue === 'LIMIT_EXCEEDED') return issue;
        if (issue) surrogate = true;
        pending.push(current[key]);
      }
    }
  }
  return surrogate ? 'SCHEMA_INVALID' : null;
}

function isBufferWire(input) {
  if (input === null || typeof input !== 'object' || types.isProxy(input) || !types.isUint8Array(input)) return false;
  // instanceof/isBuffer can execute a Proxy anywhere in the prototype chain.
  let prototype = Object.getPrototypeOf(input);
  while (prototype !== null) {
    if (types.isProxy(prototype)) return false;
    if (prototype === Buffer.prototype) return true;
    prototype = Object.getPrototypeOf(prototype);
  }
  return false;
}

function parseWire(input) {
  let wire;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > 65536) return { reason: 'LIMIT_EXCEEDED' };
    wire = input;
  } else {
    if (!isBufferWire(input)) return { reason: 'INVALID_JSON' };
    if (byteLength.call(input) > 65536) return { reason: 'LIMIT_EXCEEDED' };
    try { wire = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input); }
    catch { return { reason: 'INVALID_JSON' }; }
  }
  if (wire.charCodeAt(0) === 0xfeff) return { reason: 'INVALID_JSON' };
  const tooDeep = excessiveNesting(wire);
  let value;
  try { value = JSON.parse(wire); }
  catch { return { reason: 'INVALID_JSON' }; }
  if (tooDeep) return { reason: 'LIMIT_EXCEEDED' };
  const bounds = valueBounds(value);
  if (bounds === 'LIMIT_EXCEEDED') return { reason: bounds };
  if (canonical(value) !== wire) return { reason: 'NONCANONICAL_JSON' };
  if (bounds) return { reason: bounds };
  return { value, wire };
}

function repositoryValid(repository) {
  if (!keysAre(repository, ['id', 'url'])
    || !stringMatches(repository.id, /^[1-9][0-9]{0,19}$/)
    || !stringMatches(repository.url, /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)) return false;
  return repository.url.slice('https://github.com/'.length).split('/').every(segment => segment !== '.' && segment !== '..');
}

function packageValid(pkg) {
  if (!keysAre(pkg, ['name', 'version'])
    || !stringMatches(pkg.name, /^(?:@[a-z0-9-][a-z0-9._-]*\/)?[a-z0-9-][a-z0-9._-]*$/)
    || Buffer.byteLength(pkg.name) > 214 || typeof pkg.version !== 'string'
    || Buffer.byteLength(pkg.version) > 214) return false;
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(pkg.version)) return false;
  const dash = pkg.version.indexOf('-');
  return dash < 0 || pkg.version.slice(dash + 1).split('.')
    .every(part => !/^[0-9]+$/.test(part) || part === '0' || part[0] !== '0');
}

function issuerValid(issuer) {
  if (!stringMatches(issuer, /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[A-Za-z0-9_~./-]*)?$/)) return false;
  try {
    const url = new URL(issuer);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function identityValid(value) {
  if (!repositoryValid(value.repository) || !packageValid(value.package)
    || !['stable', 'beta', 'nightly'].includes(value.channel)
    || !['policySha256', 'toolchainSha256', 'lockfileSha256', 'testPolicySha256'].every(key => sha256(value[key]))) return false;
  const source = value.source, workflow = value.workflow;
  if (!keysAre(source, ['commit', 'tree', 'tagTarget'])
    || !gitId(source.commit) || !gitId(source.tree) || !gitId(source.tagTarget)
    || source.tagTarget !== source.commit
    || !keysAre(workflow, ['path', 'ref', 'sha256', 'issuer', 'certificateIdentity'])) return false;
  return stringMatches(workflow.path, /^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/)
    && Buffer.byteLength(workflow.path) <= 1024 && workflow.path === workflow.path.normalize('NFC')
    && workflow.ref === 'refs/tags/v' + value.package.version && sha256(workflow.sha256)
    && issuerValid(workflow.issuer)
    && workflow.certificateIdentity === value.repository.url + '/' + workflow.path + '@' + workflow.ref;
}

function digestList(value, min, max) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every((digest, i) => sha256(digest) && (i === 0 || value[i - 1] < digest));
}

function candidateValid(value) {
  if (!keysAre(value, candidateKeys) || value.schemaVersion !== 1 || !identityValid(value)
    || !sha256(value.fileManifestSha256) || !sha256(value.sbomSha256)
    || !digestList(value.buildRecordSha256, 2, 2) || !digestList(value.reviewEvidenceSha256, 1, 16)
    || !keysAre(value.tarball, ['bytes', 'sha256', 'sri'])) return false;
  const tarball = value.tarball;
  if (!Number.isSafeInteger(tarball.bytes) || tarball.bytes < 1 || tarball.bytes > 1073741824
    || !sha256(tarball.sha256) || !stringMatches(tarball.sri, /^sha512-[A-Za-z0-9+/]{86}==$/)) return false;
  const encoded = tarball.sri.slice(7), decoded = Buffer.from(encoded, 'base64');
  return decoded.length === 64 && decoded.toString('base64') === encoded;
}

export function evaluateCandidateManifest(candidateWire, expectedIdentityWire) {
  const candidate = parseWire(candidateWire);
  if (candidate.reason) return refusal(candidate.reason);
  if (!candidateValid(candidate.value)) return refusal('SCHEMA_INVALID');
  const policy = parseWire(expectedIdentityWire);
  if (policy.reason || !keysAre(policy.value, identityKeys) || !identityValid(policy.value)) return refusal('POLICY_INVALID');
  if (!identityKeys.every(key => canonical(candidate.value[key]) === canonical(policy.value[key]))) {
    return refusal('IDENTITY_MISMATCH');
  }
  return { status: 'LOCAL_FIXTURE_VALIDATED', evidenceKind: 'SYNTHETIC_ONLY', authority: 'NONE',
    releaseEligibility: 'NOT_CHECKED', candidateId: createHash('sha256').update(candidate.wire, 'utf8').digest('hex'),
    canonicalJson: candidate.wire };
}
