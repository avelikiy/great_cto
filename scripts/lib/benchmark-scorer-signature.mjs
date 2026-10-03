/** A registered trusted-launcher assertion, not hardware/OS/provider attestation. */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const SIGNED_SCORER_SOURCE = 'trusted-launcher-signed-pinned-scorer';
function bytes(value, size) {
  if (typeof value !== 'string') throw Error('invalid scorer signature encoding');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== size || decoded.toString('base64') !== value) throw Error('invalid scorer signature encoding');
  return decoded;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const message = payload => Buffer.from(JSON.stringify(canonical(payload)));

export function scorerAuthority(scorer) {
  if (scorer?.authority == null) return null;
  const a = scorer.authority;
  if (!hex(scorer.oracleSha256) || a.algorithm !== 'ed25519' || !hex(a.publicKeySha256)
    || Object.keys(a).sort().join(',') !== 'algorithm,publicKeySha256,publicKeySpki') throw Error('invalid registered scorer authority');
  try {
    const der = bytes(a.publicKeySpki, 44), key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519' || sha(der) !== a.publicKeySha256
      || !key.export({ format: 'der', type: 'spki' }).equals(der)) throw Error();
    return key;
  } catch { throw Error('invalid registered scorer authority'); }
}

/** Caller supplies already bounded private key bytes; no secret values in errors. */
export function signScorerPayload(payload, privateBytes, scorer) {
  scorerAuthority(scorer);
  if (!scorer.authority) throw Error('scorer signing authority was not preregistered');
  let key;
  try {
    key = createPrivateKey(privateBytes);
    const der = createPublicKey(key).export({ format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519' || sha(der) !== scorer.authority.publicKeySha256) throw Error();
  } catch { throw Error('private scorer signing key does not match registered authority'); }
  return { version: 2, source: SIGNED_SCORER_SOURCE, payload,
    signature: sign(null, message(payload), key).toString('base64') };
}

export function verifyScorerReport(report, scorer) {
  const key = scorerAuthority(scorer);
  if (!key || report?.version !== 2 || report.source !== SIGNED_SCORER_SOURCE
    || Object.keys(report).sort().join(',') !== 'payload,signature,source,version') throw Error('signed scorer report required by registered authority');
  const p = report.payload;
  if (!p || Object.keys(p).sort().join(',') !== 'accepted,artifactSha256,candidateInputDigest,criteria,oracleSha256,process,receipt,registrationDigest,runId,scorerSha256,stateSha256'
    || ![p.artifactSha256, p.candidateInputDigest, p.oracleSha256, p.registrationDigest, p.scorerSha256, p.stateSha256].every(hex)
    || typeof p.runId !== 'string' || !p.runId || typeof p.accepted !== 'boolean'
    || !Array.isArray(p.criteria) || !p.criteria.length || p.criteria.length > 100
    || p.criteria.some(c => !c || typeof c.text !== 'string' || !c.text || c.text.length > 1024
      || !['passed', 'failed'].includes(c.state) || typeof c.evidence !== 'string' || !c.evidence.trim() || c.evidence.length > 1024)
    || p.accepted !== p.criteria.every(c => c.state === 'passed')
    || !Number.isInteger(p.process?.pid) || p.process.pid <= 0 || p.process.exitCode !== 0
    || !Number.isFinite(Date.parse(p.process.startedAt)) || !Number.isFinite(Date.parse(p.process.finishedAt))
    || Date.parse(p.process.finishedAt) < Date.parse(p.process.startedAt)
    || typeof p.process.node !== 'string' || !/^v\d+\./.test(p.process.node)) throw Error('invalid signed scorer payload');
  if (!verify(null, message(p), key, bytes(report.signature, 64))) throw Error('scorer report signature mismatch');
  return p;
}
