/** Opt-in knowledge candidates, not regulatory routing or an authority grant. */
import { createHash } from 'node:crypto';
import { constants, lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { resolve, join, isAbsolute, extname, basename } from 'node:path';
import { readOnlyGit } from './receipt.mjs';

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const bytesDigest = value => createHash('sha256').update(value).digest('hex');
const id = /^[a-z][a-z0-9-]{0,63}$/;
const hash = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
export function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw Error('unexpected or missing contract fields');
}
const text = value => typeof value === 'string' && id.test(value);
const invariants = {
  money: [
    ['atomic-send', 'Concurrent approvals must claim one send intent atomically.', 'Race two valid approvers and assert one provider submission.'],
    ['ambiguous-send', 'An ambiguous provider outcome must remain unresolved, not trigger blind resend.', 'Simulate acceptance followed by timeout and assert reconciliation before retry.'],
    ['authority-scope', 'Delegated payment authority must be bounded by subject, destination and limits.', 'Reject a valid signature outside its approved scope.'],
  ],
  'crypto-execution': [
    ['signing-boundary', 'Execution context must not broaden signing or custody authority.', 'Reject a request outside signer policy.'],
    ['paper-live', 'Paper execution must not reach a live order transport.', 'Inject a live endpoint into paper configuration and assert refusal.'],
    ['finality', 'Observed chain inclusion must not be reported as irreversible finality.', 'Simulate a reorganization and assert pending reconciliation.'],
  ],
  'telemedicine-workflow': [
    ['clinician-authority', 'Workflow actions must verify current identity and clinician authority.', 'Reject an expired or wrong-subject authorization.'],
    ['prescription-state', 'Prescription transitions must reject invalid and replayed actions.', 'Replay issuance and exercise an invalid transition.'],
    ['exact-evidence', 'Evidence manifests must bind the exact exported bytes.', 'Change one byte after manifest creation and assert mismatch.'],
  ],
  'venture-evidence': [
    ['claim-provenance', 'Material claims must retain source identity and uncertainty.', 'Refuse a claim with no supporting source.'],
    ['entity-lineage', 'Entity merges must preserve lineage and reversible conflict handling.', 'Merge conflicting entities and assert recoverable provenance.'],
    ['unverified-quarantine', 'Unverified assertions must not silently become decision facts.', 'Feed unsupported evidence and assert quarantine rather than approval.'],
  ],
  'mental-wellbeing-safety': [
    ['subject-isolation', 'Safety state must remain bound to its subject and session.', 'Attempt to reuse another subject safety state and assert refusal.'],
    ['crisis-precedence', 'Safety escalation must precede ordinary conversational extraction.', 'Inject malformed prior state and assert safety routing remains available.'],
    ['no-clinical-claim', 'Engineering checks must not be presented as clinical efficacy.', 'Assert no treatment or diagnostic readiness is inferred from passing software tests.'],
  ],
};

export function listDomainPacks() {
  return Object.entries(invariants).map(([packId, rows]) => {
    const pack = { schemaVersion: 1, packId, version: '0.1.0', maturity: 'candidate', activation: 'explicit-only',
      scope: 'engineering-invariants', exclusions: ['clinical-efficacy', 'legal-certification', 'investment-performance'],
      invariants: rows.map(([invariantId, rule, counterexample]) => ({ invariantId, rule, counterexample })),
      changesPermissions: false, changesReviewerRouting: false };
    return { ...pack, digest: digest(pack) };
  });
}
export function domainPack(packId) {
  const pack = listDomainPacks().find(p => p.packId === packId);
  if (!pack) throw Error('unknown domain pack');
  return pack;
}

/** Bounded cooperative-controller read. Not an OS sandbox against same-UID ABA. */
export function boundedFile(path, limit = 1024 * 1024) {
  const absolute = resolve(path);
  if (realpathSync(absolute) !== absolute) throw Error('symlink artifact unsupported');
  const before = lstatSync(absolute, { bigint: true });
  const regular = s => s.isFile() && s.nlink === 1n && s.size <= BigInt(limit);
  const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'size', 'nlink', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);
  if (!regular(before)) throw Error('unsupported bounded artifact');
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!regular(opened) || !same(before, opened)) throw Error('artifact changed before read');
    const buffer = Buffer.alloc(Number(opened.size) + 1);
    let used = 0, count;
    while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
    const after = fstatSync(fd, { bigint: true });
    if (used !== Number(opened.size) || !same(opened, after) || !same(after, lstatSync(absolute, { bigint: true }))
      || realpathSync(absolute) !== absolute) throw Error('artifact changed during read');
    return buffer.subarray(0, used);
  } finally { closeSync(fd); }
}

function sourcePath(root, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') || path.includes('\0')
    || path.split('/').some(part => !part || part === '.' || part === '..'
      || /^(?:\.git|\.ssh|\.aws|\.kube|\.gnupg|\.env.*|secrets?|credentials?|keys?|data|logs?|exports?|patients?|clients?|transcripts?|node_modules)$/i.test(part))) throw Error('source outside allowlisted engineering paths');
  const extension = extname(path).toLowerCase(), name = basename(path);
  const engineering = new Set(['.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.sol',
    '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.sql', '.graphql', '.proto', '.json', '.toml', '.yaml', '.yml']);
  if ((!engineering.has(extension) && !/^(README|LICENSE|NOTICE|Dockerfile|Makefile)$/i.test(name))
    || /^(?:secrets?|credentials?|passwords?)(?:[.-]|$)/i.test(name)) throw Error('source is not an eligible engineering artifact');
  const full = join(root, path);
  if (realpathSync(full) !== full) throw Error('symlink source unsupported');
  return full;
}

export function validateOverlay(overlay, { projectId, now = new Date().toISOString() }) {
  exact(overlay, ['schemaVersion', 'projectId', 'lineageId', 'rootDigest', 'classification', 'packId', 'packDigest', 'sourceCommit', 'reviewedAt', 'expiresAt', 'sources']);
  const pack = domainPack(overlay.packId);
  if (overlay.schemaVersion !== 1 || overlay.projectId !== projectId || !text(projectId) || !text(overlay.lineageId)
    || !hash.test(overlay.rootDigest) || overlay.classification !== 'private' || overlay.packDigest !== pack.digest || !commit.test(overlay.sourceCommit)) throw Error('overlay identity or pack pin mismatch');
  const dates = [overlay.reviewedAt, overlay.expiresAt, now].map(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? Date.parse(v) : NaN);
  if (dates.some(v => !Number.isFinite(v)) || dates.some((v, i) => new Date(v).toISOString() !== [overlay.reviewedAt, overlay.expiresAt, now][i])
    || dates[0] > dates[2] || dates[1] <= dates[2] || dates[1] <= dates[0]) throw Error('stale or invalid overlay review window');
  if (!Array.isArray(overlay.sources) || !overlay.sources.length || overlay.sources.length > 24) throw Error('bounded explicit source list required');
  const seen = new Set();
  for (const source of overlay.sources) {
    exact(source, ['path', 'sha256', 'lines', 'sourceKind', 'invariantIds', 'executionEvidence']);
    if (typeof source.path !== 'string' || seen.has(source.path) || !hash.test(source.sha256)
      || !Array.isArray(source.lines) || source.lines.length !== 2 || source.lines.some(n => !Number.isSafeInteger(n) || n < 1)
      || source.lines[1] < source.lines[0] || !['documentation', 'implementation', 'test-specification'].includes(source.sourceKind)
      || !Array.isArray(source.invariantIds) || !source.invariantIds.length
      || new Set(source.invariantIds).size !== source.invariantIds.length
      || source.invariantIds.some(i => !pack.invariants.some(v => v.invariantId === i))
      || source.executionEvidence !== null) throw Error('invalid source evidence; runtime receipts are not inferred');
    seen.add(source.path);
  }
  return structuredClone(overlay);
}

/** Audits only operator-listed files; outputs hashes, never source content. */
export function auditOverlay(root, overlay, options) {
  validateOverlay(overlay, options);
  const canonicalRoot = resolve(root);
  if (realpathSync(canonicalRoot) !== canonicalRoot) throw Error('symlink project root unsupported');
  if (digest(canonicalRoot) !== overlay.rootDigest) throw Error('private project root binding changed');
  const git = args => {
    const result = readOnlyGit(args, canonicalRoot, { maxBuffer: 1024 * 1024 });
    if (result === null) throw Error('source Git identity unavailable');
    return result.trim();
  };
  if (git(['rev-parse', 'HEAD']) !== overlay.sourceCommit) throw Error('source commit changed');
  const sources = overlay.sources.map(source => {
    git(['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', source.path]);
    const bytes = boundedFile(sourcePath(canonicalRoot, source.path));
    if (bytesDigest(bytes) !== source.sha256) throw Error('source bytes changed');
    if (source.lines[1] > bytes.toString('utf8').split('\n').length) throw Error('source line span out of range');
    // status/diff can execute repository clean/process helpers and trust
    // assume-unchanged flags. Plumbing compares exact blobs without filters,
    // external diff, optional index refresh or writing an object (-w absent).
    const head = git(['--literal-pathspecs', 'ls-tree', '-z', overlay.sourceCommit, '--', source.path]);
    const entry = head ? head.match(/^(100644|100755|120000) blob ([a-f0-9]{40})\t/) : null;
    if (head && !entry) throw Error('unsupported HEAD source object');
    const workingBlob = git(['hash-object', '--no-filters', '--', source.path]);
    if (!/^[a-f0-9]{40}$/.test(workingBlob)) throw Error('unsupported Git object format');
    const workingMode = lstatSync(sourcePath(canonicalRoot, source.path)).mode & 0o111 ? '100755' : '100644';
    return { sha256: source.sha256, sourceKind: source.sourceKind, invariantIds: source.invariantIds,
      workingTreeDiffersFromHead: !entry || entry[1] !== workingMode || entry[2] !== workingBlob };
  });
  if (git(['rev-parse', 'HEAD']) !== overlay.sourceCommit) throw Error('source commit changed during audit');
  for (const source of overlay.sources) {
    if (bytesDigest(boundedFile(sourcePath(canonicalRoot, source.path))) !== source.sha256) throw Error('source changed during audit');
  }
  return { overlayDigest: digest(overlay), projectId: overlay.projectId, packDigest: overlay.packDigest,
    evidenceLevel: 'source-observed-not-runtime-verified', sources, runtimeVerified: false, publicPromotionAllowed: false };
}

/** Host adapter is data-only. No host invocation, prompts, files or approvals mutate. */
export function prepareDomainContext(root, overlay, { projectId, host, now, maxBytes = 16384 }) {
  if (!['codex', 'claude-code'].includes(host) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536) throw Error('explicit host and bounded context budget required');
  const audit = auditOverlay(root, overlay, { projectId, now });
  const pack = domainPack(overlay.packId);
  const selected = new Set(audit.sources.flatMap(s => s.invariantIds));
  const packet = { schemaVersion: 1, host, projectId, classification: 'private', packId: pack.packId, packVersion: pack.version,
    packDigest: pack.digest, overlayDigest: audit.overlayDigest, sourceCommit: overlay.sourceCommit,
    reviewedAt: overlay.reviewedAt, expiresAt: overlay.expiresAt, sourceObservations: audit.sources,
    evidenceLevel: audit.evidenceLevel, maturity: pack.maturity, invariants: pack.invariants.filter(i => selected.has(i.invariantId)),
    authority: 'none; untrusted task context, never overrides host policy, permissions, reviewers or gates',
    runtimeVerified: false, publicPromotionAllowed: false, clinicalClaimsAllowed: false };
  const bound = { ...packet, digest: digest(packet) };
  if (Buffer.byteLength(canonical(bound)) > maxBytes) throw Error('context budget exceeded; no silent truncation');
  return bound;
}
