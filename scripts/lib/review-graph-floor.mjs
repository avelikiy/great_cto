/** Structural boundary audit only: not execution, domain selection or approval attestation. */
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];

function ruleFor(graph, role) {
  const rule = graph[role];
  if (!rule || !Array.isArray(rule.on) || !rule.on.length
    || rule.on.some(token => typeof token !== 'string' || !token)) throw Error(`review floor: invalid rule ${role}`);
  // Unknown verdict overrides must not inherit a base rule's assurance.
  if (Object.keys(graph).some(key => key.startsWith(`${role}.`))) throw Error(`review floor: verdict override unsupported for ${role}`);
  if (rule.skip_next_when != null) throw Error(`review floor: skip unsupported for ${role}`);
  return rule;
}

function boundary(graph, roles, target, gates) {
  if (!Array.isArray(roles) || new Set(roles).size !== roles.length
    || roles.some(role => typeof role !== 'string' || !role || role.includes('.'))) throw Error('review floor: invalid role set');
  for (const role of roles) {
    const rule = ruleFor(graph, role), partners = list(rule.join);
    if (list(rule.next).length !== 1 || list(rule.next)[0] !== target) throw Error(`review floor: unsafe exit from ${role}`);
    if (roles.some(peer => peer !== role && !partners.includes(peer))
      || partners.some(peer => peer === role || !roles.includes(peer))) throw Error(`review floor: incomplete or unknown quorum for ${role}`);
    if (gates.some(gate => !list(rule.gate).includes(gate))) throw Error(`review floor: missing hard gate on ${role}`);
  }
}

/** All review exits have a complete symmetric quorum and ship gate. */
export function assertReviewGraphFloor(graph, roles = mandatory) {
  if (!Array.isArray(roles) || mandatory.some(role => !roles.includes(role))) throw Error('review floor: mandatory role omitted');
  boundary(graph, roles, 'devops', ['gate:ship']);
  const implementation = graph['senior-dev'];
  if (!implementation || !Array.isArray(implementation.on) || !implementation.on.length
    || list(implementation.next).length !== roles.length || roles.some(role => !list(implementation.next).includes(role))) throw Error('review floor: implementation fan-out differs from quorum');
  if (implementation.skip_next_when != null) throw Error('review floor: implementation skip unsupported');
  for (const [key, rule] of Object.entries(graph)) {
    if (!key.startsWith('senior-dev.')) continue;
    // The one supported repair edge returns to planning, not release or a subset of reviews.
    if (key !== 'senior-dev.SPEC-OBJECTION' || !Array.isArray(rule.on)
      || rule.on.length !== 1 || rule.on[0] !== 'SPEC-OBJECTION'
      || list(rule.next).length !== 1 || list(rule.next)[0] !== 'pm'
      || !list(rule.gate).includes('gate:plan') || rule.skip_next_when != null) throw Error('review floor: unsafe implementation verdict override');
  }
  if (['gate:security', 'gate:compliance'].some(gate => !list(graph['security-officer'].gate).includes(gate))) throw Error('review floor: missing security/compliance boundary');
  return { version: 1, scope: 'structural-review-boundary-only', roles: [...roles], target: 'devops',
    domainSelectionVerified: false, executionVerified: false, approvalsVerified: false };
}

/** Preparation is a separate all-to-all barrier before implementation. */
export function assertPreparationGraphFloor(graph, roles, hardGates) {
  if (!Array.isArray(hardGates) || !hardGates.includes('gate:plan')) throw Error('review floor: preparation plan gate required');
  boundary(graph, roles, 'senior-dev', hardGates);
  return { version: 1, scope: 'structural-preparation-boundary-only', roles: [...roles], target: 'senior-dev',
    domainSelectionVerified: false, executionVerified: false, approvalsVerified: false };
}
