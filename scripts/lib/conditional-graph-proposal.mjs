/** Pure proposal over caller-supplied evidence. Never an execution receipt. */
import { focusDirection } from './focus-registry.mjs';

const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const gates = ['product', 'arch', 'plan', 'code', 'import', 'qa', 'security', 'compliance', 'ship'];
const nodeKinds = ['contract', 'implementation', 'deterministic-check', 'independent-review', 'specialist', 'gate', 'publication-proof'];
const id = /^[a-z][a-z0-9-]{0,63}$/;
const hash = /^[a-f0-9]{64}$/;
const pin = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const slug = v => typeof v === 'string' && id.test(v);
const textList = v => Array.isArray(v) && v.length <= 2000 && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= 8192);
const sorted = v => [...new Set(v)].sort();
const size = v => Buffer.byteLength(JSON.stringify(v), 'utf8');
const scope = 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested';
const reserved = new Set(['deterministic-checks', 'artifact-identity', 'access-authorization', 'runtime-proof']);
const relative = path => !/^(?:\/|[A-Za-z]:)|[\\\x00-\x1f\x7f]/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..');

// Upstream reasons can contain private paths. Only their recognized category is consumed.
const knownReason = r => /^(?:auto:T0:non-behavioral\([1-9]\d*\)|auto:T1:(?:behavioral\([1-9]\d*\)|default)|label:T[012]|deploy:production|bulk:[1-9]\d*files)$/.test(r)
  || /^(?:runtime-sensitive|migration|domain-config|auth-surface|pricing-surface):.+$/.test(r)
  || /^connector:new-write:.+$/.test(r);

function evidenceReason({ focusId, host, plan, base, requiredGates }) {
  if (focusDirection(focusId).state === 'unavailable') return 'unsupported-focus';
  if (!['codex', 'claude-code'].includes(host)) return 'unsupported-host';
  if (!object(plan)) return 'missing-evidence';
  if (plan.version !== 1 || ['nodes', 'edges', 'schemaVersion', 'routeClasses'].some(k => Object.hasOwn(plan, k))) return 'unsupported-plan-schema';
  if (typeof base !== 'string' || !pin.test(base)) return 'missing-pinned-base';
  const a = plan.assessment;
  if (!object(a) || a.base !== base) return 'assessment-base-mismatch';
  if (plan.state !== 'planned' || a.known !== true || plan.planningOnly !== false) return 'evidence-unavailable';
  if (plan.advisory !== true || plan.reusablePass !== false || plan.scope !== scope
    || !hash.test(typeof plan.fingerprint === 'string' ? plan.fingerprint : '')
    || !hash.test(typeof a.fingerprint === 'string' ? a.fingerprint : '')) return 'invalid-evidence-metadata';
  if (!['T0', 'T1', 'T2'].includes(a.tier) || ![null, 'T0', 'T1'].includes(a.escalatedFromLabel)
    || !textList(a.files) || !a.files.length || !a.files.every(relative) || !textList(a.reasons) || !a.reasons.length
    || !a.reasons.every(knownReason)) return 'invalid-assessment';
  if (a.tier !== 'T2' && a.reasons.some(r => /^(?:runtime-sensitive|migration|domain-config|auth-surface|pricing-surface|connector:new-write|deploy:production|bulk):?/.test(r))) return 'invalid-assessment';
  if (!Array.isArray(plan.reviewers) || plan.reviewers.length > 2000 || plan.reviewers.some(r => !object(r)
    || !slug(r.agent) || reserved.has(r.agent) || !textList(r.reasons) || !r.reasons.length || !textList(r.files))) return 'invalid-reviewer-metadata';
  if (!Array.isArray(requiredGates) || requiredGates.length > 128 || requiredGates.some(g => !gates.includes(g))) return 'invalid-gates';
  return null;
}

function validateGraph(nodes, edges) {
  const ids = new Set(nodes.map(n => n.id));
  const edgeIds = new Set(edges.map(e => e.id));
  return nodes.length <= 128 && edges.length <= 256 && ids.size === nodes.length && edgeIds.size === edges.length
    && nodes.every(n => nodeKinds.includes(n.kind)) && edges.every(e => e.kind === 'proposed-dependency'
      && ids.has(e.source) && ids.has(e.target));
}

export function conditionalGraphProposal(input) {
  const value = object(input) ? input : {};
  const { focusId, host, plan, base, requiredGates = [] } = value;
  const supportedFocus = focusDirection(focusId).state !== 'unavailable';
  let complete = true;
  let roles = [...mandatory];
  // Requirements survive even an unknown upstream plan; hostile identifiers never become public text.
  if (Array.isArray(plan?.reviewers)) {
    if (plan.reviewers.length > 2000) complete = false;
    else for (const r of plan.reviewers) {
      if (slug(r?.agent)) roles.push(r.agent);
      else complete = false;
    }
  }
  roles = sorted(roles);
  let required = sorted(['import', 'ship', ...(Array.isArray(requiredGates) && requiredGates.length <= 128
    ? requiredGates.filter(g => gates.includes(g)) : [])]);
  const limitations = ['caller-supplied-evidence-not-reverified', 'proposal-not-execution-evidence', 'publication-requires-separate-authority'];
  if (Array.isArray(plan?.reviewers) && plan.reviewers.length > 2000) limitations.push('requirements-overflow');
  if (host === 'claude-code') limitations.push('native-causal-coverage-unavailable', 'native-enforcement-not-attested');
  const p = { schemaVersion: 1, kind: 'conditional-graph-proposal', advisory: true, changesExecution: false,
    focusId: supportedFocus ? focusId : null, registryVersion: 1, assessmentState: 'unavailable', assessmentFingerprint: null,
    routeClasses: [], nodes: [], edges: [], requiredRoles: roles, requiredRolesComplete: complete,
    requiredGates: required, reasons: [], limitations };
  const unavailable = reason => {
    p.assessmentState = 'unavailable'; p.assessmentFingerprint = null;
    p.nodes = []; p.edges = []; p.routeClasses = [];
    p.reasons = [reason];
    p.requiredGates = sorted([...p.requiredGates, 'security', 'compliance']);
    p.limitations = sorted([...p.limitations, 'no-selective-omission']);
    if (!p.requiredRolesComplete) p.limitations = sorted([...p.limitations, 'requirements-incomplete']);
    if (size(p) > 65536) {
      // A finite envelope cannot enumerate unbounded requirements. Explicit incompleteness forbids omission.
      p.requiredRoles = [...mandatory]; p.requiredRolesComplete = false;
      p.limitations = sorted([...p.limitations, 'requirements-overflow', 'requirements-incomplete']);
    }
    return p;
  };
  const reason = evidenceReason({ focusId, host, plan, base, requiredGates });
  if (reason) return unavailable(reason);

  const assessment = plan.assessment;
  const architecture = assessment.files.some(f => /(?:^|\/)(?:architecture|adr)\//i.test(f));
  const sensitive = assessment.tier === 'T2';
  const publication = assessment.reasons.includes('deploy:production')
    || assessment.files.some(f => /(?:^|\/)(?:release|releases|deploy|deployment|publish|install)(?:\/|\.)/i.test(f));
  p.routeClasses = ['ordinary', ...(architecture ? ['architecture'] : []), ...(sensitive ? ['sensitive'] : []), ...(publication ? ['publication'] : [])];
  if (architecture) roles.push('architect', 'pm');
  if (publication) roles.push('devops');
  p.requiredRoles = sorted(roles);
  if (sensitive) required.push('security', 'compliance');
  p.requiredGates = sorted(required);
  const nodes = new Map(); const edges = new Map();
  const node = (key, kind) => { nodes.set(key, { id: key, kind }); return key; };
  const edge = (source, target, reason) => {
    const key = `${source}:${target}`;
    edges.set(key, { id: key, kind: 'proposed-dependency', source, target, reason });
  };
  node('senior-dev', 'implementation'); node('deterministic-checks', 'deterministic-check');
  edge('senior-dev', 'deterministic-checks', 'verify-implementation');
  if (architecture) {
    node('architect', 'contract'); node('pm', 'contract');
    edge('architect', 'pm', 'architecture-before-plan'); edge('pm', 'senior-dev', 'plan-before-implementation');
  }
  if (publication) node('devops', 'contract');
  for (const r of p.requiredRoles) {
    if (['senior-dev', 'architect', 'pm', 'devops'].includes(r) && nodes.has(r)) continue;
    node(r, mandatory.includes(r) ? 'independent-review' : 'specialist');
    edge('deterministic-checks', r, 'required-delivery-review');
  }
  for (const g of p.requiredGates) {
    const gate = node(`gate:${g}`, 'gate');
    if (['product', 'arch', 'plan', 'import'].includes(g)) edge(gate, 'senior-dev', 'required-gate-before-implementation');
    else for (const r of p.requiredRoles) if (!['architect', 'pm', 'senior-dev', 'devops'].includes(r)) edge(r, gate, 'required-review-before-gate');
  }
  if (publication) {
    node('devops', 'contract');
    for (const proof of ['artifact-identity', 'access-authorization', 'runtime-proof']) {
      node(proof, 'publication-proof'); edge('gate:ship', proof, 'publication-requires-proof');
      edge(proof, 'devops', 'proof-before-publication');
    }
  }
  p.nodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  p.edges = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
  p.assessmentState = 'known'; p.assessmentFingerprint = assessment.fingerprint;
  p.reasons = p.routeClasses.map(c => `${c}-route`);
  p.limitations = sorted(p.limitations);
  if (!validateGraph(p.nodes, p.edges) || size(p) > 65536) return unavailable('proposal-overflow');
  return p;
}
