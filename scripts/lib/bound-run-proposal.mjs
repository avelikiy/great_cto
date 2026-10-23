/** Exact private snapshot inspection. Content identity never grants execution authority. */
import * as nodeFs from 'node:fs';
import { isAbsolute, resolve, join, parse } from 'node:path';
import { createHash } from 'node:crypto';
import { conditionalGraphProposal } from './conditional-graph-proposal.mjs';
import { focusDirection } from './focus-registry.mjs';
import { CODEX_ROLE_PROFILES } from './codex-role-profiles.mjs';
import { APPROVAL_LEVELS, gatesForApprovalLevel } from './approval-level.mjs';
import { GATES_BY_ARCHETYPE } from './gate-policy.mjs';

const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const contracts = new Set(['auth-engineer', 'subscription-billing-engineer', 'integrations-engineer', 'connector-builder',
  'media-pipeline-engineer', 'geo-routing-engineer', 'ai-prompt-architect', 'design-advisor']);
// Mirror the controller's saved-phase floor without importing its execution module.
const regulatoryRoles = new Set(['pci-reviewer', 'regulated-reviewer', 'gdpr-reviewer', 'healthcare-reviewer',
  'us-privacy-reviewer', 'dpdpa-reviewer', 'cmmc-reviewer', 'voice-ai-reviewer', 'hr-ai-reviewer', 'adtech-privacy-reviewer',
  'edtech-reviewer', 'gov-reviewer', 'insurance-reviewer', 'legal-reviewer', 'tax-reviewer', 'rcm-reviewer', 'us-ai-reviewer']);
// Generic embedder profiles have no shipped agent and cannot become public role IDs.
const roles = new Set(Object.keys(CODEX_ROLE_PROFILES).filter(r => !['writer', 'reviewer', 'qa', 'security'].includes(r)));
const gates = new Set(['product', 'arch', 'plan', 'code', 'import', 'qa', 'security', 'compliance', 'ship']);
const hash = /^[a-f0-9]{64}$/, pin = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha = v => createHash('sha256').update(v).digest('hex');
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v)
  ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const size = v => Buffer.byteLength(JSON.stringify(v));
const limits = ['stored-snapshot-not-revalidated', 'content-identity-not-historical-epoch', 'proposal-not-execution-evidence'];
class InspectionFailure extends Error {
  constructor(reason) { super('Snapshot inspection unavailable'); this.reason = reason; }
}
const fail = reason => { throw new InspectionFailure(reason); };
const check = (condition, reason = 'invalid-evidence') => { if (!condition) fail(reason); };
const sameFile = (a, b) => ['dev', 'ino', 'uid', 'mode', 'size', 'nlink', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);
const sameDir = (a, b) => ['dev', 'ino', 'uid', 'mode'].every(k => a[k] === b[k]);
const textList = v => Array.isArray(v) && v.length <= 2000 && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= 8192);
const unique = v => new Set(v).size === v.length;
const roleList = v => Array.isArray(v) && v.length <= roles.size && unique(v) && v.every(r => roles.has(r));
const sameSet = (a, b) => a.length === b.length && a.every(v => b.includes(v));
const relative = p => !/^(?:\/|[A-Za-z]:)|[\\\x00-\x1f\x7f]/.test(p) && !p.split('/').some(s => !s || s === '.' || s === '..');
const reasonKnown = r => /^(?:auto:T0:non-behavioral\([1-9]\d*\)|auto:T1:(?:behavioral\([1-9]\d*\)|default)|label:T[012]|deploy:production|bulk:[1-9]\d*files)$/.test(r)
  || /^(?:runtime-sensitive|migration|domain-config|auth-surface|pricing-surface|connector:new-write):.+$/.test(r);

function envelope(kind) {
  return { schemaVersion: 1, kind, state: 'unavailable', binding: null, proposal: null, advisory: true,
    changesExecution: false, provenance: 'stored-snapshot', currentTreeAssessment: false, reusablePass: false,
    requiredRoles: [...mandatory], limitations: [...limits] };
}

function validateSelection(value, proposal) {
  check(object(value) && typeof value.projectRoot === 'string' && isAbsolute(value.projectRoot)
    && value.projectRoot === resolve(value.projectRoot) && hash.test(value.projectId || '')
    && typeof value.runId === 'string' && uuid.test(value.runId) && ['preparation', 'review'].includes(value.phase)
    && typeof value.storeDir === 'string' && isAbsolute(value.storeDir) && value.storeDir === resolve(value.storeDir), 'invalid-selection');
  if (proposal) {
    check(typeof value.focusId === 'string' && focusDirection(value.focusId).state !== 'unavailable', 'invalid-selection');
    const b = value.binding;
    const fields = ['snapshotDigest', 'epochDigest', 'planFingerprint', 'base', 'policyDigest'];
    check(object(b) && Object.keys(b).length === fields.length && fields.every(k => Object.hasOwn(b, k))
      && fields.every(k => typeof b[k] === 'string' && (k === 'base' ? pin : hash).test(b[k])), 'invalid-selection');
  }
}

function directoryChain(fs, path, uid, privateStore = false) {
  const snapshots = [];
  let current = parse(path).root;
  for (const part of ['', ...path.slice(current.length).split('/').filter(Boolean)]) {
    if (part) current = join(current, part);
    const stat = fs.lstatSync(current, { bigint: true });
    check(stat.isDirectory() && !stat.isSymbolicLink() && (stat.uid === uid || stat.uid === 0n)
      && (stat.mode & 0o022n) === 0n, 'unsafe-evidence');
    snapshots.push({ path: current, stat });
  }
  check(fs.realpathSync(path) === path, 'unsafe-evidence');
  if (privateStore) {
    const s = snapshots.at(-1).stat;
    check(s.uid === uid && (s.mode & 0o7777n) === 0o700n, 'unsafe-evidence');
  }
  return snapshots;
}

function boundedRead(fs, path, limit, uid, privateState, handles, buffers) {
  const before = fs.lstatSync(path, { bigint: true });
  const regular = s => s.isFile() && !s.isSymbolicLink() && s.nlink === 1n && s.size >= 0n && s.size <= BigInt(limit);
  check(regular(before), 'unsafe-evidence');
  if (privateState) check(before.uid === uid && (before.mode & 0o7777n) === 0o600n, 'unsafe-evidence');
  else check((before.uid === uid || before.uid === 0n) && (before.mode & 0o022n) === 0n, 'unsafe-evidence');
  check(fs.realpathSync(path) === path, 'unsafe-evidence');
  const fd = fs.openSync(path, nodeFs.constants.O_RDONLY | nodeFs.constants.O_NOFOLLOW | nodeFs.constants.O_NONBLOCK);
  handles.push(fd);
  const opened = fs.fstatSync(fd, { bigint: true });
  check(regular(opened) && sameFile(before, opened), 'snapshot-changed');
  const buffer = Buffer.alloc(Number(opened.size) + 1);
  buffers.push(buffer);
  let used = 0;
  while (used < buffer.length) {
    const n = fs.readSync(fd, buffer, used, buffer.length - used, null);
    if (!n) break;
    used += n;
  }
  check(used === Number(opened.size) && sameFile(opened, fs.fstatSync(fd, { bigint: true }))
    && sameFile(opened, fs.lstatSync(path, { bigint: true })) && fs.realpathSync(path) === path, 'snapshot-changed');
  return { path, fd, stat: opened, buffer, bytes: buffer.subarray(0, used) };
}

function projectGates(text) {
  const read = key => {
    const declarations = [...text.matchAll(new RegExp(`^${key}:.*$`, 'gm'))];
    const matches = [...text.matchAll(new RegExp(`^${key}:[ \\t]*([^\\s#]+)[ \\t]*(?:#.*)?$`, 'gm'))];
    check(matches.length <= 1 && declarations.length === matches.length);
    return matches[0]?.[1];
  };
  const archetype = read('archetype'), primary = read('primary'), level = read('approval-level') || 'gates-only';
  const archetypes = [archetype, primary].filter(Boolean);
  check(archetypes.length > 0 && archetypes.every(a => Object.hasOwn(GATES_BY_ARCHETYPE, a)) && APPROVAL_LEVELS.includes(level));
  return [...new Set(archetypes.flatMap(a => gatesForApprovalLevel(level, { archetype: a, briefReadable: false })))];
}

function validateEvidence(state, phase, policyDigest) {
  const policy = state.specialistPolicy;
  const selectedPhase = state[phase === 'review' ? 'specialistReview' : 'specialistPreparation'];
  check(object(policy) && object(selectedPhase) && object(selectedPhase.plan), 'unsupported-evidence');
  check(policy.mode === 'adaptive' && ['existing-change', 'phased-change', 'full-cycle'].includes(policy.workflow)
    && typeof policy.base === 'string' && pin.test(policy.base) && hash.test(policy.projectDigest || '')
    && policy.projectDigest === policyDigest && Array.isArray(policy.contracts) && unique(policy.contracts)
    && policy.contracts.every(r => contracts.has(r)));
  const plan = selectedPhase.plan, a = plan.assessment;
  check(plan.version === 1 && !['nodes', 'edges', 'schemaVersion', 'routeClasses'].some(k => Object.hasOwn(plan, k)), 'unsupported-evidence');
  check(plan.state === 'planned' && plan.advisory === true && plan.reusablePass === false
    && plan.scope === 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested'
    && hash.test(plan.fingerprint || '') && selectedPhase.fingerprint === plan.fingerprint
    && selectedPhase.reusablePass === false && object(a) && a.base === policy.base
    && plan.planningOnly === (phase === 'preparation'));
  check(Array.isArray(plan.reviewers) && plan.reviewers.length <= 2000
    && plan.reviewers.every(r => object(r) && roles.has(r.agent) && textList(r.reasons) && r.reasons.length > 0
      && textList(r.files) && r.files.every(relative)) && unique(plan.reviewers.map(r => r.agent)));
  const required = [...new Set([...mandatory, ...plan.reviewers.map(r => r.agent), ...policy.contracts])];
  check(Array.isArray(selectedPhase.hardGates) && selectedPhase.hardGates.length <= gates.size
    && selectedPhase.hardGates.every(g => typeof g === 'string' && gates.has(g.replace(/^gate:/, '')))
    && unique(selectedPhase.hardGates.map(g => g.replace(/^gate:/, ''))));
  if (phase === 'preparation') {
    check(policy.workflow !== 'existing-change' && roleList(selectedPhase.selected));
    check(required.filter(r => !mandatory.includes(r)).every(r => selectedPhase.selected.includes(r)));
    check(selectedPhase.selected.every(r => r.endsWith('-reviewer') || contracts.has(r) || r === 'ai-eval-engineer'));
    const stages = selectedPhase.selected.filter(r => r !== 'ai-eval-engineer').map(r => `${r}-prebuild`);
    check(Array.isArray(selectedPhase.roles) && unique(selectedPhase.roles) && sameSet(selectedPhase.roles, stages));
    check(stages.every(stage => object(state.specialistStages?.[stage])
      && state.specialistStages[stage].role === stage.slice(0, -9)
      && state.specialistStages[stage].phase === (contracts.has(state.specialistStages[stage].role) ? 'contract' : 'threat-review')));
    // The controller's clean prebuild assessment has no fingerprint. Do not invent one.
    if (a.known === false) check(a.tier === 'T2' && Array.isArray(a.files) && a.files.length === 0
      && Array.isArray(a.reasons) && a.reasons.length === 1 && a.reasons[0] === 'assessment-unavailable:empty change has no risk evidence'
      && !Object.hasOwn(a, 'fingerprint'));
    else validateAssessment(a);
  } else {
    validateAssessment(a);
    check(roleList(selectedPhase.roles) && sameSet(selectedPhase.roles, required.filter(r => !contracts.has(r))));
    if (Object.hasOwn(selectedPhase, 'selected')) check(roleList(selectedPhase.selected)
      && required.filter(r => !mandatory.includes(r)).every(r => selectedPhase.selected.includes(r)));
  }
  const hardGates = selectedPhase.hardGates.map(g => g.replace(/^gate:/, ''));
  const floor = [phase === 'review' ? 'ship' : 'plan'];
  if ([...required, ...(selectedPhase.selected || [])].some(r => regulatoryRoles.has(r))) floor.push('security', 'compliance');
  check(floor.every(g => hardGates.includes(g)));
  return { phaseData: selectedPhase, plan, base: policy.base, required };
}

function validateAssessment(a) {
  check(a.known === true && hash.test(a.fingerprint || '') && ['T0', 'T1', 'T2'].includes(a.tier)
    && [null, 'T0', 'T1'].includes(a.escalatedFromLabel) && textList(a.files) && a.files.length > 0 && a.files.every(relative)
    && textList(a.reasons) && a.reasons.length > 0 && a.reasons.every(reasonKnown));
  check(a.tier === 'T2' || !a.reasons.some(r => /^(?:runtime-sensitive|migration|domain-config|auth-surface|pricing-surface|connector:new-write|deploy:production|bulk):?/.test(r)));
}

async function inspect(input, proposal, dependencies) {
  const body = envelope(proposal ? 'controlled-run-proposal-inspection' : 'controlled-run-proposal-binding');
  const fs = dependencies?.fs || nodeFs, projector = dependencies?.projector || conditionalGraphProposal;
  const handles = [], buffers = [];
  try {
    validateSelection(input, proposal);
    const { projectRoot, projectId, runId, phase, storeDir } = input;
    const uid = BigInt(process.geteuid());
    const directories = [...directoryChain(fs, storeDir, uid, true), ...directoryChain(fs, projectRoot, uid)];
    check(sha(projectRoot) === projectId, 'unavailable');
    const stateRead = boundedRead(fs, join(storeDir, `${runId}.json`), 1048576, uid, true, handles, buffers);
    let state;
    try { state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stateRead.bytes)); } catch { fail('invalid-evidence'); }
    check(object(state), 'invalid-evidence');
    // An explicit foreign root must not expose that run's schema or phase metadata.
    if (typeof state.root === 'string' && state.root !== projectRoot) fail('unavailable');
    const snapshotDigest = sha(stateRead.bytes);
    if (proposal) check(snapshotDigest === input.binding.snapshotDigest, 'snapshot-changed');
    check(state.version === 1, 'unsupported-evidence');
    check(state.id === runId && typeof state.root === 'string', 'invalid-evidence');
    check(state.root === projectRoot, 'unavailable');
    directories.push(...directoryChain(fs, join(projectRoot, '.great_cto'), uid));
    const policyRead = boundedRead(fs, join(projectRoot, '.great_cto', 'PROJECT.md'), 65536, uid, false, handles, buffers);
    const policyDigest = sha(policyRead.bytes);
    if (proposal) check(policyDigest === input.binding.policyDigest, 'snapshot-changed');
    let policyText;
    try { policyText = new TextDecoder('utf-8', { fatal: true }).decode(policyRead.bytes); } catch { fail('invalid-evidence'); }
    const currentGates = projectGates(policyText);
    const { phaseData, plan, base, required } = validateEvidence(state, phase, policyDigest);
    const binding = { snapshotDigest, epochDigest: sha(canonical({ phase, planFingerprint: plan.fingerprint,
      assessmentFingerprint: plan.assessment.fingerprint ?? null, base, policyDigest, roles: phaseData.roles,
      selected: phaseData.selected ?? null, hardGates: phaseData.hardGates })), planFingerprint: plan.fingerprint, base, policyDigest };
    if (proposal) check(Object.keys(binding).every(k => binding[k] === input.binding[k]), 'snapshot-changed');
    let graph = null;
    if (proposal && phase === 'review') {
      const requiredGates = [...new Set([...currentGates, ...phaseData.hardGates.map(g => g.replace(/^gate:/, '')), 'import', 'ship'])];
      // Explicit policy contracts can be wider than the saved plan's reviewers.
      const projectionPlan = { version: plan.version, state: plan.state, advisory: plan.advisory, planningOnly: plan.planningOnly,
        reusablePass: plan.reusablePass, fingerprint: plan.fingerprint, scope: plan.scope, assessment: plan.assessment, reviewers: [...plan.reviewers,
        ...required.filter(r => !plan.reviewers.some(v => v.agent === r)).map(agent => ({ agent, reasons: ['required contract'], files: [] }))] };
      graph = projector({ focusId: input.focusId, host: 'codex', plan: projectionPlan, base, requiredGates });
      check(graph?.schemaVersion === 1 && graph.assessmentState === 'known' && graph.requiredRolesComplete === true
        && required.every(r => graph.requiredRoles.includes(r)) && requiredGates.every(g => graph.requiredGates.includes(g))
        && size(graph) <= 65536);
    }
    try {
      for (const r of [stateRead, policyRead]) check(sameFile(r.stat, fs.fstatSync(r.fd, { bigint: true }))
        && sameFile(r.stat, fs.lstatSync(r.path, { bigint: true })) && fs.realpathSync(r.path) === r.path, 'snapshot-changed');
      for (const d of directories) check(sameDir(d.stat, fs.lstatSync(d.path, { bigint: true }))
        && fs.realpathSync(d.path) === d.path, 'snapshot-changed');
    } catch { fail('snapshot-changed'); }
    if (proposal && phase === 'preparation') fail('planning-only-evidence');
    const available = { schemaVersion: 1, kind: body.kind, state: 'available', projectId, controller: 'codex', runId, phase,
      binding, provenance: 'stored-snapshot', advisory: true, changesExecution: false, currentTreeAssessment: false, reusablePass: false,
      ...(proposal ? { focusId: input.focusId, registryVersion: 1, proposal: graph, limitations: [...limits] } : {}) };
    check(size(available) <= 98304); return { status: 200, body: available };
  } catch (error) {
    const reason = error instanceof InspectionFailure ? error.reason : error.code === 'ENOENT' ? 'unavailable' : 'unsafe-evidence';
    const status = reason === 'invalid-selection' ? 400 : reason === 'unavailable' ? 404 : reason === 'snapshot-changed' ? 409 : 200;
    return { status, body: { ...body, reason } };
  } finally {
    for (const buffer of buffers) buffer.fill(0);
    for (const fd of handles) { try { fs.closeSync(fd); } catch { /* Never publish filesystem exceptions. */ } }
  }
}

// Optional second argument is an internal deterministic-test dependency seam, never HTTP input.
export async function readBoundRunBinding(input, dependencies) { return inspect(input, false, dependencies); }
export async function readBoundRunProposal(input, dependencies) { return inspect(input, true, dependencies); }
