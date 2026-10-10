/** Controller-owned specialist phases and review epochs. No historical PASS reuse. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pinChangeBase } from './runtime-gate-policy.mjs';
import { specialistPlan } from './specialist-plan.mjs';
import { RULES } from '../hooks/auto-attach-reviewers.mjs';
import { codexRoleProfile } from './codex-role-profiles.mjs';
import { validateReviewReusePolicy } from './scoped-review-reuse.mjs';
import { assertReviewGraphFloor, assertPreparationGraphFloor } from './review-graph-floor.mjs';

const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const contracts = new Set(['auth-engineer', 'subscription-billing-engineer', 'integrations-engineer', 'connector-builder',
  'media-pipeline-engineer', 'geo-routing-engineer', 'ai-prompt-architect', 'design-advisor']);
const regulatoryRoles = new Set(['pci-reviewer', 'regulated-reviewer', 'gdpr-reviewer', 'healthcare-reviewer',
  'us-privacy-reviewer', 'dpdpa-reviewer', 'cmmc-reviewer', 'voice-ai-reviewer', 'hr-ai-reviewer', 'adtech-privacy-reviewer',
  'edtech-reviewer', 'gov-reviewer', 'insurance-reviewer', 'legal-reviewer', 'tax-reviewer', 'rcm-reviewer', 'us-ai-reviewer']);
const sha = text => createHash('sha256').update(text).digest('hex');
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
function planFor(state, exclude = []) {
  const plan = specialistPlan({ root: state.root, base: state.specialistPolicy.base, rules: RULES, exclude,
    planning: state.specialistPolicy.workflow !== 'existing-change' && !state.results['senior-dev'] });
  if (plan.state !== 'planned') throw Error(`specialist risk unavailable: ${plan.reason}`);
  if (sha(readFileSync(join(state.root, '.great_cto/PROJECT.md'))) !== state.specialistPolicy.projectDigest) throw Error('project domain policy changed; new assessed run required');
  return plan;
}
function selectedRoles(state, plan) {
  const roles = plan.reviewers.map(r => r.agent).filter(r => !mandatory.includes(r));
  for (const role of roles) {
    if (!role.endsWith('-reviewer') && !(state.specialistPolicy.workflow !== 'existing-change' && (contracts.has(role) || role === 'ai-eval-engineer'))) throw Error(`specialist phase unsupported: ${role} requires a separate contract/evaluation workflow`);
    codexRoleProfile(role); // Unknown domain capability fails before any omission.
  }
  return [...new Set([...roles, ...(state.specialistPolicy.contracts || [])])];
}
export function validateSpecialistPolicy(state, policy) {
  const entries = { 'existing-change': 'senior-dev', 'phased-change': 'senior-dev', 'full-cycle': 'product-owner' };
  if (!policy || policy.mode !== 'adaptive' || !Object.hasOwn(entries, policy.workflow) || state.intent !== 'delivery'
    || state.queue[0] !== entries[policy.workflow]) throw Error('specialist policy requires existing-change/phased-change senior-dev entry or full-cycle product-owner entry');
  if (policy.contracts != null && (!Array.isArray(policy.contracts) || policy.contracts.some(r => !contracts.has(r)) || policy.workflow === 'existing-change')) throw Error('unsupported specialist contract policy');
  const impl = state.graph['senior-dev'];
  if (!impl || mandatory.some(r => !list(impl.next).includes(r) || !state.graph[r] || !list(state.graph[r].next).includes('devops') || mandatory.filter(p => p !== r).some(p => !list(state.graph[r].join).includes(p)))) throw Error('specialist policy requires intact mandatory review graph');
  if (Object.values(state.graph).flatMap(r => list(r.gate)).indexOf('gate:ship') < 0) throw Error('specialist policy requires ship gate');
  assertReviewGraphFloor(state.graph);
  if (!state.allowed.some(p => p === 'docs' || p === 'docs/specialist-reviews')) throw Error('specialist policy requires explicit docs/specialist-reviews write scope');
  if (policy.workflow !== 'existing-change' && !state.allowed.includes('docs')) throw Error('phased specialist workflow requires explicit docs write scope');
  if (policy.workflow === 'full-cycle' && (list(state.graph['product-owner']?.next).join() !== 'architect' || !list(state.graph['product-owner']?.gate).includes('gate:product')
    || !list(state.graph.architect?.next).includes('pm') || !list(state.graph.pm?.next).includes('senior-dev')
    || !list(state.graph.architect?.gate).includes('gate:arch') || !list(state.graph.pm?.gate).includes('gate:plan'))) throw Error('full-cycle requires intact product/architecture/plan graph');
  state.specialistPolicy = { mode: 'adaptive', workflow: policy.workflow, base: pinChangeBase(state.root, policy.base), contracts: [...new Set(policy.contracts || [])],
    projectDigest: sha(readFileSync(join(state.root, '.great_cto/PROJECT.md'))) };
  const plan = planFor(state); const roles = selectedRoles(state, plan);
  for (const role of roles) if (!state.graph[role]) state.graph[role] = { on: ['APPROVED', 'SIGNED-OFF', 'PASS', 'SAFE', 'DONE'], produces: ['report'], next: ['devops'] };
  if (policy.workflow !== 'existing-change') {
    // Registration allows explicit host routes before preparation is scheduled.
    state.specialistStages = {};
    for (const role of roles.filter(r => r !== 'ai-eval-engineer')) registerPreparationRole(state, role);
    schedulePreparation(state);
  }
  state.specialistPolicy.reviewReuse = validateReviewReusePolicy(state, policy.reviewReuse);
  return state.specialistPolicy;
}

function registerPreparationRole(state, role) {
  const key = `${role}-prebuild`;
  state.specialistStages[key] = { role, phase: contracts.has(role) ? 'contract' : 'threat-review' };
  state.graph[key] = { on: ['APPROVED', 'SIGNED-OFF', 'PASS', 'SAFE', 'DONE'], produces: ['report'], next: ['senior-dev'] };
  return key;
}

/** Intercept the implementation cursor, never move contract work after code. */
export function schedulePreparation(state) {
  if (!state.specialistPolicy || state.specialistPolicy.workflow === 'existing-change' || state.results['senior-dev'] || !state.queue.includes('senior-dev')) return;
  if (state.specialistPreparation) {
    if (state.specialistPreparation.roles.every(r => state.released.includes(r))) state.specialistPreparation.status = 'complete';
    return;
  }
  const plan = planFor(state); const selected = selectedRoles(state, plan);
  const roles = selected.filter(r => r !== 'ai-eval-engineer').map(r => registerPreparationRole(state, r));
  const gates = ['gate:plan', ...(selected.some(r => regulatoryRoles.has(r)) ? ['gate:security', 'gate:compliance'] : [])];
  for (const role of roles) Object.assign(state.graph[role], { join: roles.filter(r => r !== role), gate: gates });
  assertPreparationGraphFloor(state.graph, roles, gates);
  state.specialistPreparation = { roles, selected, fingerprint: plan.fingerprint, plan, hardGates: gates,
    reports: [], status: roles.length ? 'scheduled' : 'complete', reusablePass: false };
  state.specialistImplementationGraph = structuredClone(state.graph);
  if (roles.length) state.queue.splice(state.queue.indexOf('senior-dev'), 1, ...roles);
}

export function specialistRole(state, role) { return state.specialistStages?.[role]?.role || role; }

export function assertSpecialistEpoch(state) {
  if (!state.specialistPolicy) return;
  const epoch = state.specialistReview;
  const preparation = state.specialistPreparation;
  assertReviewGraphFloor(state.graph, epoch?.roles || mandatory);
  if (preparation) assertPreparationGraphFloor(state.graph, preparation.roles, preparation.hardGates);
  const inspectingPreparation = !epoch && preparation?.status === 'scheduled';
  const plan = planFor(state, inspectingPreparation ? preparation.reports : epoch?.reports || []);
  const selected = selectedRoles(state, plan);
  const matches = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === actual.length && expected.every(value => actual.includes(value));
  if (epoch) {
    const expected = [...mandatory, ...selected.filter(role => !contracts.has(role))];
    const gates = selected.some(role => regulatoryRoles.has(role))
      ? ['gate:security', 'gate:compliance', 'gate:ship'] : ['gate:ship'];
    if (!matches(epoch.roles, expected) || !matches(epoch.hardGates, gates)) throw Error('review floor: selected domain quorum or hard gates changed');
  }
  if (preparation) {
    // Preparation's stored selection can be wider than a later plan, but never narrower.
    if (!Array.isArray(preparation.selected) || selected.some(role => !preparation.selected.includes(role))) throw Error('implementation requires new domain/contract assessment; review floor: preparation domain selection narrowed');
    const expected = preparation.selected.filter(role => role !== 'ai-eval-engineer').map(role => `${role}-prebuild`);
    const gates = ['gate:plan', ...(preparation.selected.some(role => regulatoryRoles.has(role)) ? ['gate:security', 'gate:compliance'] : [])];
    if (!matches(preparation.roles, expected) || !matches(preparation.hardGates, gates)) throw Error('review floor: preparation quorum or hard gates changed');
  }
  if (inspectingPreparation && plan.fingerprint !== preparation.fingerprint) throw Error('specialist preparation input/dependencies changed; pre-build epoch invalidated');
  if (epoch && plan.fingerprint !== epoch.fingerprint) throw Error('specialist review input/dependencies changed; review epoch invalidated');
}

export function scheduleSpecialists(state) {
  if (!state.specialistPolicy || !state.results['senior-dev'] || state.specialistReview) return;
  const plan = planFor(state); const selected = selectedRoles(state, plan);
  if (state.specialistPolicy.workflow !== 'existing-change' && (!state.specialistPreparation || state.specialistPreparation.status !== 'complete'
    || selected.some(r => !state.specialistPreparation.selected.includes(r)))) throw Error('implementation requires new domain/contract assessment; start a newly assessed phased run');
  const roles = selected.filter(r => !contracts.has(r));
  // Do not reinterpret a pre-existing contract-stage edge as post-build approval.
  const all = [...mandatory, ...roles];
  for (const role of roles) state.graph[role] = { on: ['APPROVED', 'SIGNED-OFF', 'PASS', 'SAFE', 'DONE'], produces: ['report'], next: ['devops'] };
  for (const role of all) {
    state.graph[role].join = [...new Set([...list(state.graph[role].join), ...all.filter(p => p !== role)])];
    state.graph[role].gate = [...new Set([...list(state.graph[role].gate), 'gate:ship'])];
  }
  state.graph['senior-dev'].next = [...new Set([...list(state.graph['senior-dev'].next), ...roles])];
  const regulatory = roles.some(r => regulatoryRoles.has(r));
  const hardGates = regulatory ? ['gate:security', 'gate:compliance', 'gate:ship'] : ['gate:ship'];
  state.graph['security-officer'].gate = [...new Set([...list(state.graph['security-officer'].gate), ...hardGates])];
  assertReviewGraphFloor(state.graph, all);
  state.specialistReview = { roles: all, fingerprint: plan.fingerprint, plan, hardGates, reports: [], reusablePass: false };
}

export function validateReviewFiles(state, role, proposal) {
  const preparation = state.specialistPreparation?.roles.includes(role);
  if (!preparation && !state.specialistReview?.roles.includes(role)) return;
  const directory = preparation ? 'docs/specialist-contracts/' : 'docs/specialist-reviews/';
  for (const file of proposal.files) if (!file.path.startsWith(directory) || !file.path.endsWith('.md') || file.before !== null) throw Error(`adaptive reviewers may only create new markdown reports in ${directory}`);
  if (state.graph[role].on.includes(proposal.verdict) && list(state.graph[role].produces).includes('report')
    && !proposal.files.some(file => file.path === proposal.meta?.report && file.content?.trim())) throw Error('specialist report must name a newly proposed phase artifact, not existing input');
}
export function recordReviewFiles(state, role, proposal) {
  if (state.specialistReview?.roles.includes(role)) state.specialistReview.reports.push(...proposal.files.map(f => f.path));
  if (state.specialistPreparation?.roles.includes(role)) state.specialistPreparation.reports.push(...proposal.files.map(f => f.path));
}
