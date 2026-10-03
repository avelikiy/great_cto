/** Controller evidence for scoped review reuse. No gate/dispatch authority. */
import { lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { codexRoleProfile } from './codex-role-profiles.mjs';

export const SCOPED_REVIEW_VERSION = 2;
const sha = value => createHash('sha256').update(value).digest('hex');
const mandatory = new Set(['code-reviewer', 'qa-engineer', 'security-officer', 'ai-eval-engineer']);
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, maxBuffer: 4 * 1024 * 1024 });

// Bounded descriptor observation, not an atomic ancestor handle or OS sandbox.
// Before/after path checks detect observed mutations; same-UID ABA/tampering
// remains outside the cooperative controller's independent admission proof.
function evidenceFile(path, limit) {
  const before = lstatSync(path, { bigint: true });
  const regular = stat => stat.isFile() && stat.nlink === 1n && stat.size <= BigInt(limit);
  const equal = (a,b) => ['dev','ino','uid','mode','nlink','size','mtimeNs','ctimeNs'].every(key => a[key] === b[key]);
  if (!regular(before)) throw Error('unsupported evidence artifact');
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch { throw Error('evidence identity unavailable'); }
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!regular(opened) || !equal(before,opened)) throw Error('evidence changed before reading');
    const buffer = Buffer.alloc(Number(opened.size)+1); let used = 0, count;
    while (used < buffer.length && (count=readSync(fd,buffer,used,buffer.length-used,null))>0) used+=count;
    const after = fstatSync(fd, { bigint: true }), current = lstatSync(path, { bigint: true });
    if (used!==Number(opened.size) || !equal(opened,after) || !equal(after,current)
      || !regular(current) || realpathSync(path)!==path) throw Error('evidence changed during reading');
    return { mode: Number(opened.mode), content: buffer.subarray(0,used) };
  } finally { closeSync(fd); }
}

export function completeScopeAttestation(verification, input) {
  const a = verification?.dependencyAttestation;
  return verification?.state === 'verified' && Array.isArray(verification.findings) && verification.findings.length === 0
    && a?.state === 'complete' && a.inputDigest === input?.digest && Array.isArray(a.checks)
    && a.checks.length > 0 && a.checks.every(c => typeof c === 'string' && c.trim());
}

export function validateReviewReusePolicy(state, policy) {
  if (policy == null) return null;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(k => !['scopes', 'sources'].includes(k))
    || !policy.scopes || typeof policy.scopes !== 'object' || Array.isArray(policy.scopes)) throw Error('invalid scoped review policy');
  const sources = policy.sources || {};
  if (typeof sources !== 'object' || Array.isArray(sources) || Object.keys(sources).some(role => !Object.hasOwn(policy.scopes, role))) throw Error('source requires explicit dependency scope');
  for (const [role, dependencies] of Object.entries(policy.scopes)) {
    const capability = state.specialistStages?.[role]?.role || role;
    if (!state.graph[role] || mandatory.has(capability) || (!role.endsWith('-reviewer') && !state.specialistStages?.[role])
      || !Array.isArray(dependencies) || !dependencies.length || dependencies.length > 200
      || new Set(dependencies).size !== dependencies.length || dependencies.some(p => typeof p !== 'string')) throw Error('invalid scoped review role/dependencies');
    const source = sources[role];
    if (source && (typeof source.path !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256 || ''))) throw Error('invalid prior run pin');
    if (source) {
      const rel = relative(realpathSync(state.root), realpathSync(source.path));
      if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`))) throw Error('prior run must be outside worker workspace');
    }
  }
  return structuredClone({ scopes: policy.scopes, sources });
}

function bytes(root, path, tracked = true) {
  if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') || path.includes('\0')
    || path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('invalid dependency path');
  if (tracked) {
    git(root, ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', path]);
    if (git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--cached', '-z']).split('\0').includes(path)) throw Error('ignored dependency input');
  }
  let current = realpathSync(root);
  for (const part of path.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw Error('symlink evidence unsupported');
  }
  const {mode,content} = evidenceFile(current,1024*1024);
  return { path, mode, sha256: sha(content), content };
}

function eligible(state, role) {
  const capability = state.specialistStages?.[role]?.role || role;
  if (mandatory.has(capability) || !(state.specialistPreparation?.roles.includes(role) || state.specialistReview?.roles.includes(role))) throw Error('role is not eligible for scoped reuse');
  return capability;
}

/** Stable task/contract binding, with explicit file-only operator scope. */
export function scopedReviewInput(state, role, dependencies) {
  const capability = eligible(state, role);
  if (!Array.isArray(dependencies) || !dependencies.length || dependencies.length > 200
    || new Set(dependencies).size !== dependencies.length) throw Error('explicit unique dependency closure required');
  const inputs = []; let total = 0;
  for (const path of dependencies) {
    const input = bytes(state.root,path);
    if ((total+=input.content.length) > 8*1024*1024) throw Error('dependency closure exceeds 8 MiB');
    inputs.push(input);
  }
  const project = bytes(state.root, '.great_cto/PROJECT.md', false);
  const contract = state.graph[role];
  if (!contract) throw Error('missing role contract');
  const binding = { version: SCOPED_REVIEW_VERSION, root: realpathSync(state.root), role, capability,
    capabilityDigest: sha(codexRoleProfile(capability)), phase: state.specialistStages?.[role]?.phase || 'post-build',
    projectDigest: project.sha256, graphHash: state.graphHash, contract, workflow: state.specialistPolicy?.workflow,
    task: state.prompt, acceptance: state.acceptance || [], checkPolicy: state.checkPolicy || null,
    inputs: inputs.map(({ path, mode, sha256 }) => ({ path, mode, sha256 })).sort((a, b) => a.path.localeCompare(b.path)) };
  return { binding, digest: sha(JSON.stringify(binding)) };
}

/** Only a fresh verifier's explicit complete-scope attestation can mint evidence. */
export function attestScopedReview(state, role, input, result) {
  eligible(state, role);
  if (!completeScopeAttestation(result.verification, input) || !result.verification.checks?.length) throw Error('independent complete dependency attestation required');
  if (result.checks && result.checks.state !== 'passed') throw Error('prior required checks not passed');
  const actual = scopedReviewInput(state, role, input.binding.inputs.map(i => i.path));
  if (actual.digest !== input.digest) throw Error('dependencies changed during attestation');
  const path = result.meta?.report;
  const prefix = state.specialistStages?.[role] ? 'docs/specialist-contracts/' : 'docs/specialist-reviews/';
  if (typeof path !== 'string' || !path.startsWith(prefix) || !path.endsWith('.md')) throw Error('report must be a phase artifact');
  const report = bytes(state.root, path, false);
  if (!report.content.toString('utf8').trim() || state.writes[path] !== report.sha256) throw Error('report bytes not controller-bound');
  const attempt = state.attempts.find(a => a.id === result.attemptId);
  if (!attempt || attempt.role !== role || attempt.status !== 'verified' || attempt.reuse
    || attempt.proposalDigest == null || JSON.stringify(attempt.verification) !== JSON.stringify(result.verification)) throw Error('original independently verified controller attempt required');
  if (!state.graph[role].on.includes(result.verdict)) throw Error('unaccepted prior verdict');
  return { version: SCOPED_REVIEW_VERSION, input, report: { path, sha256: report.sha256 },
    runId: state.id, role, attemptId: result.attemptId, resultDigest: result.digest,
    verificationDigest: sha(JSON.stringify(result.verification)), checksDigest: sha(JSON.stringify(result.checks || null)) };
}

/** Prior state is operator-pinned outside the worker; no self-selected log lookup. */
export function scopedReviewCandidate(state, role, dependencies, source) {
  const input = scopedReviewInput(state, role, dependencies);
  if (!source || typeof source.path !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256 || '')) throw Error('operator-pinned prior run required');
  const path = realpathSync(source.path), rel = relative(realpathSync(state.root), path);
  if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`))) throw Error('prior run must be outside worker workspace');
  if (lstatSync(source.path).isSymbolicLink() || !lstatSync(path).isFile() || lstatSync(path).size > 4 * 1024 * 1024) throw Error('invalid prior run artifact');
  const {content:raw} = evidenceFile(path,4*1024*1024);
  if (sha(raw) !== source.sha256) throw Error('prior run pin changed');
  let prior;
  try { prior = JSON.parse(raw); } catch { throw Error('prior run is not valid JSON'); }
  const result = prior.results?.[role], evidence = result?.scopedReview;
  if (!evidence || prior.root !== state.root || prior.id === state.id || evidence.input.digest !== input.digest) throw Error('no matching independently scoped evidence');
  const checked = attestScopedReview(prior, role, evidence.input, result);
  if (JSON.stringify(checked) !== JSON.stringify(evidence)) throw Error('prior scoped evidence mismatch');
  const report = bytes(state.root, evidence.report.path, false);
  // The recipient must still perform fresh independent completeness/current-task
  // verification. This candidate never changes results, approvals or the cursor.
  return { input, verdict: result.verdict, content: report.content.toString('utf8'), prior: { runId: prior.id, role,
    attemptId: result.attemptId, resultDigest: result.digest, sourceDigest: source.sha256 },
    requiresFreshAttestation: true, gateAuthority: false };
}
