/** Read-only operator-pinned observation collection, not provider attestation. */
import { lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { describeMatchedObservations } from './adaptive-benchmark-protocol.mjs';
import { dispatchEvidenceSummary } from './controller-dispatch-evidence.mjs';
import { treeReceipt } from './receipt.mjs';
import { scorerAuthority, verifyScorerReport } from './benchmark-scorer-signature.mjs';
import { baselineInputDigest, readPinnedScorerOracle } from './pinned-benchmark-scorer.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function document(raw, label) {
  try { return JSON.parse(raw); }
  catch { throw Error(`invalid benchmark ${label} JSON`); } // Never echo private input bytes.
}

export function benchmarkPolicySnapshot(state, { entry = state.queue[0] } = {}) {
  // Stand-down audit grows during execution; it is not a policy configuration.
  const gatePolicy = state.gatePolicy ? { ...state.gatePolicy } : null;
  if (gatePolicy) delete gatePolicy.skipped;
  return structuredClone({ graphHash: state.graphHash, allowed: state.allowed, intent: state.intent,
    entry, hostRoutes: state.hostRoutes || {}, maxAttempts: state.maxAttempts,
    checkPolicy: state.checkPolicy || null, gatePolicy, executionBudget: state.executionBudget || null,
    specialistPolicy: state.specialistPolicy || null });
}

function registrationIdentity(registration) {
  const { protocol, trial } = registration || {};
  describeMatchedObservations(protocol, []); // Checks the entire registered protocol digest.
  const block = protocol.blocks.find(b => b.task === trial?.task && b.repetition === trial?.repetition);
  if (registration.version !== 1 || !block || !['legacy', 'adaptive'].includes(trial.arm)
    || typeof registration.scorer?.id !== 'string' || !registration.scorer.id.trim() || !hex(registration.scorer.sha256)
    || !Array.isArray(registration.requiredRoles) || registration.requiredRoles.some(r => typeof r !== 'string' || !r)
    || new Set(registration.requiredRoles).size !== registration.requiredRoles.length
    || mandatory.some(r => !registration.requiredRoles.includes(r))) throw Error('invalid benchmark trial registration or mandatory roles');
  const scenario = protocol.scenarios.find(s => s.id === block.task);
  scorerAuthority(registration.scorer);
  return { registrationDigest: digest(registration), protocolDigest: protocol.digest,
    task: block.task, repetition: block.repetition, arm: trial.arm,
    specificationDigest: block.specificationDigest, acceptanceDigest: block.acceptanceDigest,
    artifact: protocol.artifacts[trial.arm], policyDigest: digest(protocol.policies[trial.arm]),
    scorer: registration.scorer, requiredRoles: registration.requiredRoles, scenario };
}

/** Called only on a newly constructed controller state, before its first dispatch. */
export function bindBenchmarkTrial(state, registration) {
  if (state.benchmarkBinding || state.status !== 'ready' || state.active || state.steps !== 0
    || state.attempts.length || state.approvals.length || state.dispatchEvidence?.records.length
    || state.releasePolicy) throw Error('benchmark binding requires a fresh no-release run');
  const identity = registrationIdentity(registration);
  if (state.prompt !== identity.scenario.task || !same(state.acceptance, identity.scenario.checks)
    || digest(benchmarkPolicySnapshot(state)) !== identity.policyDigest) throw Error('benchmark task, criteria or policy differs from registration');
  const initialReceipt = treeReceipt(state.root);
  if (!initialReceipt || initialReceipt.truncated) throw Error('benchmark requires a readable complete initial Git receipt');
  state.benchmarkBinding = structuredClone({ ...identity, initialReceipt });
  return state.benchmarkBinding;
}

function outside(root, file) {
  const rel = relative(root, realpathSync(file));
  if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw Error('benchmark evidence must be external to the worker project');
}

function boundedFile(file, { privateFile = true, maxBytes = 65536 } = {}) {
  const path = resolve(file);
  if (realpathSync(path) !== path || lstatSync(path).isSymbolicLink()) throw Error('unsafe noncanonical benchmark evidence path');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || (privateFile && (info.mode & 0o077)) || info.size > maxBytes) throw Error('unsafe or oversized bounded benchmark evidence file');
    // Allocate only the observed bounded size; one extra byte detects growth.
    const bytes = Buffer.alloc(info.size + 1); let used = 0, count;
    while (used < bytes.length && (count = readSync(fd, bytes, used, bytes.length - used, null)) > 0) used += count;
    if (used > info.size) throw Error('benchmark evidence grew during bounded read');
    const raw = bytes.subarray(0, used);
    return { raw, sha256: hash(raw) };
  } finally { closeSync(fd); }
}

function externalFile(root, file, options) {
  outside(root, file);
  return boundedFile(file, options);
}
export function privateBenchmarkEvidence(root, file) { return externalFile(root, file); }

export function readBenchmarkRegistration(root, file) {
  const evidence = externalFile(realpathSync(root), file);
  const registration = document(evidence.raw, 'registration');
  registrationIdentity(registration);
  return registration;
}

function assertArtifacts(state) {
  for (const [name, expected] of Object.entries(state.writes || {})) {
    if (!name || isAbsolute(name) || name.includes('\\') || name.split('/').some(p => !p || p === '..' || p === '.')) throw Error('invalid benchmark artifact path');
    const path = resolve(state.root, name), actual = realpathSync(path), info = lstatSync(path);
    if (actual !== path || !info.isFile() || !state.allowed.some(p => name === p || name.startsWith(`${p}/`))
      || boundedFile(path, { privateFile: false, maxBytes: 1024 * 1024 }).sha256 !== expected) throw Error('benchmark artifact drift or unsafe path');
  }
}

function assertScorable(state, registration, receipt) {
  if (state.status !== 'done' || state.active || state.pending || state.wave || state.rework || state.queue.length
    || state.releasePolicy || !receipt || receipt.truncated || !state.attempts.length || !same(state.attempts.at(-1).receipt, receipt)) throw Error('controller is not settled on the scored receipt');
  assertArtifacts(state);
  if (state.dispatchEvidence?.records.some(r => !r || r.outcome === 'intent' || !r.finishedAt)) throw Error('unfinished controller invocation cannot be assessed as settled');
  const required = new Set(registration.requiredRoles);
  // Do not omit reviewers that the actual adaptive controller selected.
  for (const role of state.specialistReview?.roles || []) required.add(role);
  for (const role of required) {
    const result = state.results[role], attempt = state.attempts.find(a => a.id === result?.attemptId);
    const observed = state.dispatchEvidence?.records.find(r => r.id === `${attempt?.id}:verifier`);
    if (!result || !attempt || attempt.role !== role || attempt.status !== 'verified'
      || result.verification?.state !== 'verified' || !result.verification.checks?.length
      || attempt.verification?.state !== 'verified' || !same(result.verification, attempt.verification)
      || observed?.kind !== 'verifier' || observed.outcome !== 'returned') throw Error('missing independently verified required role');
  }
  for (const approval of state.approvals) {
    if (state.results[approval.role]?.digest !== approval.result) throw Error('approval refers to stale result');
  }
}

/** Shared read-only pre/post execution context; not proof of executing this package. */
export function benchmarkScoringContext({ registrationFile, stateFile, stateSha256, artifactFile,
  scorerFile, oracleFile = null }, { settled = false } = {}) {
  if (!hex(stateSha256)) throw Error('exact state byte pin required');
  // Root is not trusted until the bounded private state has been parsed and checked.
  const evidence = boundedFile(stateFile, { maxBytes: 8 * 1024 * 1024 });
  if (evidence.sha256 !== stateSha256) throw Error('controller state byte pin mismatch');
  const state = document(evidence.raw, 'state'), root = realpathSync(state.root);
  if (state.version !== 1 || !state.id || state.root !== root) throw Error('invalid benchmark controller identity');
  outside(root, stateFile);
  const registration = readBenchmarkRegistration(root, registrationFile), identity = registrationIdentity(registration);
  const binding = state.benchmarkBinding;
  if (!binding || !same({ ...binding, initialReceipt: undefined }, { ...identity, initialReceipt: undefined })
    || !binding.initialReceipt || state.prompt !== identity.scenario.task || !same(state.acceptance, identity.scenario.checks)) throw Error('controller trial binding mismatch or absent pre-dispatch binding');
  if (digest(benchmarkPolicySnapshot(state, { entry: registration.protocol.policies[identity.arm].entry })) !== identity.policyDigest) throw Error('controller execution policy drift');
  const artifact = externalFile(root, artifactFile, { privateFile: false, maxBytes: 100 * 1024 * 1024 });
  const scorer = externalFile(root, scorerFile, { privateFile: false, maxBytes: 1024 * 1024 });
  if (artifact.sha256 !== identity.artifact.artifactSha256 || scorer.sha256 !== identity.scorer.sha256) throw Error('package or scorer code pin mismatch');
  const receipt = treeReceipt(root);
  let oracle = null;
  if (identity.scorer.authority) {
    if (!oracleFile) throw Error('registered signed scorer requires pinned oracle evidence');
    oracle = readPinnedScorerOracle(root, oracleFile, identity.scorer.oracleSha256);
    if (oracle.scenario !== identity.task) throw Error('scorer oracle task differs from registered trial');
  }
  if (settled) assertScorable(state, registration, receipt);
  return { state, root, registration, identity, artifact, scorer, receipt, oracle };
}

/** Binds raw state bytes, package bytes and pinned scorer code to the supplied report. */
export function collectBenchmarkObservation(options) {
  const { stateSha256, scoreFile = null, scoreSha256 = null } = options;
  if (!hex(stateSha256) || (scoreFile && !hex(scoreSha256)) || (!scoreFile && scoreSha256)) throw Error('exact state/score byte pins required');
  const { state, root, registration, identity, artifact, scorer, receipt, oracle } = benchmarkScoringContext(options);
  const telemetry = dispatchEvidenceSummary(state);
  let status = ['blocked', 'cancelled'].includes(state.status) ? (state.status === 'blocked' ? 'blocked' : 'failed') : 'unassessed';
  let accepted = null, scoreDigest = null, trustedScorerProcessSignatureVerified = false;
  if (scoreFile) {
    assertScorable(state, registration, receipt);
    const score = externalFile(root, scoreFile);
    if (score.sha256 !== scoreSha256) throw Error('score byte pin mismatch');
    let report = document(score.raw, 'score');
    if (identity.scorer.authority) {
      const payload = verifyScorerReport(report, identity.scorer);
      if (payload.artifactSha256 !== artifact.sha256 || payload.scorerSha256 !== scorer.sha256
        || payload.oracleSha256 !== identity.scorer.oracleSha256
        || payload.candidateInputDigest !== baselineInputDigest(root, Object.keys(oracle.baseline).sort())) throw Error('signed scorer artifact/oracle/input binding mismatch');
      report = { ...payload, version: 1, source: 'operator-attestation', scorer: identity.scorer };
      trustedScorerProcessSignatureVerified = true;
    }
    if (report.version !== 1 || report.source !== 'operator-attestation' || report.runId !== state.id
      || report.stateSha256 !== stateSha256 || report.registrationDigest !== identity.registrationDigest
      || !same(report.scorer, identity.scorer) || !same(report.receipt, receipt)
      || !Array.isArray(report.criteria) || report.criteria.length !== state.acceptance.length
      || report.criteria.some((c, i) => c?.text !== state.acceptance[i] || !['passed', 'failed'].includes(c.state)
        || typeof c.evidence !== 'string' || !c.evidence.trim())) throw Error('independent score report identity/criteria mismatch');
    status = 'completed'; accepted = report.criteria.every(c => c.state === 'passed'); scoreDigest = score.sha256;
  }
  const row = { task: identity.task, repetition: identity.repetition, arm: identity.arm,
    protocolDigest: identity.protocolDigest, specificationDigest: identity.specificationDigest,
    acceptanceDigest: identity.acceptanceDigest, artifactSha256: artifact.sha256, status, accepted,
    activeMs: telemetry.activeMs, workerCalls: telemetry.workerCalls, verifierCalls: telemetry.verifierCalls,
    humanPauses: null, actionableFindings: null, escapedDefects: null, actualCostUsd: null,
    evidence: { level: trustedScorerProcessSignatureVerified
      ? 'trusted-launcher-signed-scorer-and-pinned-controller-not-provider-attested'
      : 'operator-pinned-controller-and-score-not-provider-attested', runId: state.id,
      controllerStatus: state.status, stateSha256, registrationDigest: identity.registrationDigest,
      scorerSha256: scorer.sha256, scoreSha256: scoreDigest, receipt,
      trustedScorerProcessSignatureVerified,
      graphFloorCoverageVerified: false, executionArtifactProvenanceVerified: false,
      benchmarkEligible: false } };
  describeMatchedObservations(registration.protocol, [row]);
  return row;
}
