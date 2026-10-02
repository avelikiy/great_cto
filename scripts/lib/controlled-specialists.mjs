/** Controller-owned post-build review epoch. No historical PASS reuse. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pinChangeBase } from './runtime-gate-policy.mjs';
import { specialistPlan } from './specialist-plan.mjs';
import { RULES } from '../hooks/auto-attach-reviewers.mjs';
import { codexRoleProfile } from './codex-role-profiles.mjs';

const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const sha = text => createHash('sha256').update(text).digest('hex');
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
function planFor(state, exclude = []) {
  const plan = specialistPlan({ root: state.root, base: state.specialistPolicy.base, rules: RULES, exclude });
  if (plan.state !== 'planned') throw Error(`specialist risk unavailable: ${plan.reason}`);
  if (sha(readFileSync(join(state.root, '.great_cto/PROJECT.md'))) !== state.specialistPolicy.projectDigest) throw Error('project domain policy changed; new assessed run required');
  return plan;
}
function domainRoles(plan) {
  const roles = plan.reviewers.map(r => r.agent).filter(r => !mandatory.includes(r));
  for (const role of roles) {
    if (!role.endsWith('-reviewer')) throw Error(`specialist phase unsupported: ${role} requires a separate contract/evaluation workflow`);
    codexRoleProfile(role); // Unknown domain capability fails before any omission.
  }
  return roles;
}
export function validateSpecialistPolicy(state, policy) {
  if (!policy || policy.mode !== 'adaptive' || policy.workflow !== 'existing-change' || state.intent !== 'delivery'
    || state.queue[0] !== 'senior-dev') throw Error('specialist v1 requires existing-change delivery with senior-dev entry');
  const impl = state.graph['senior-dev'];
  if (!impl || mandatory.some(r => !list(impl.next).includes(r) || !state.graph[r] || !list(state.graph[r].next).includes('devops') || mandatory.filter(p => p !== r).some(p => !list(state.graph[r].join).includes(p)))) throw Error('specialist policy requires intact mandatory review graph');
  if (Object.values(state.graph).flatMap(r => list(r.gate)).indexOf('gate:ship') < 0) throw Error('specialist policy requires ship gate');
  if (!state.allowed.some(p => p === 'docs' || p === 'docs/specialist-reviews')) throw Error('specialist policy requires explicit docs/specialist-reviews write scope');
  state.specialistPolicy = { mode: 'adaptive', workflow: 'existing-change', base: pinChangeBase(state.root, policy.base),
    projectDigest: sha(readFileSync(join(state.root, '.great_cto/PROJECT.md'))) };
  const plan = planFor(state); const roles = domainRoles(plan);
  for (const role of roles) if (!state.graph[role]) state.graph[role] = { on: ['APPROVED', 'SIGNED-OFF', 'PASS', 'SAFE', 'DONE'], produces: ['report'], next: ['devops'] };
  return state.specialistPolicy;
}

export function assertSpecialistEpoch(state) {
  if (!state.specialistPolicy) return;
  const epoch = state.specialistReview;
  const plan = planFor(state, epoch?.reports || []);
  domainRoles(plan);
  if (epoch && plan.fingerprint !== epoch.fingerprint) throw Error('specialist review input/dependencies changed; review epoch invalidated');
}

export function scheduleSpecialists(state) {
  if (!state.specialistPolicy || !state.results['senior-dev'] || state.specialistReview) return;
  const plan = planFor(state); const roles = domainRoles(plan);
  // Do not reinterpret a pre-existing contract-stage edge as post-build approval.
  const all = [...mandatory, ...roles];
  for (const role of roles) state.graph[role] = { on: ['APPROVED', 'SIGNED-OFF', 'PASS', 'SAFE', 'DONE'], produces: ['report'], next: ['devops'] };
  for (const role of all) {
    state.graph[role].join = [...new Set([...list(state.graph[role].join), ...all.filter(p => p !== role)])];
    state.graph[role].gate = [...new Set([...list(state.graph[role].gate), 'gate:ship'])];
  }
  state.graph['senior-dev'].next = [...new Set([...list(state.graph['senior-dev'].next), ...roles])];
  const regulatory = roles.some(r => ['pci-reviewer', 'regulated-reviewer', 'gdpr-reviewer', 'healthcare-reviewer', 'us-privacy-reviewer'].includes(r));
  const hardGates = regulatory ? ['gate:security', 'gate:compliance', 'gate:ship'] : ['gate:ship'];
  state.graph['security-officer'].gate = [...new Set([...list(state.graph['security-officer'].gate), ...hardGates])];
  state.specialistReview = { roles: all, fingerprint: plan.fingerprint, plan, hardGates, reports: [], reusablePass: false };
}

export function validateReviewFiles(state, role, proposal) {
  if (!state.specialistReview?.roles.includes(role)) return;
  for (const file of proposal.files) if (!file.path.startsWith('docs/specialist-reviews/') || !file.path.endsWith('.md') || file.before !== null) throw Error('adaptive reviewers may only create new markdown reports in docs/specialist-reviews');
}
export function recordReviewFiles(state, role, proposal) {
  if (state.specialistReview?.roles.includes(role)) state.specialistReview.reports.push(...proposal.files.map(f => f.path));
}
