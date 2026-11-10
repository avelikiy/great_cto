// Synthetic only. No journal, credential, real reviewer or publication authority.
import { createHash } from 'node:crypto';
export const authority = 'NONE';
export const releaseEligibility = 'NOT_CHECKED';
export const sha = (text) => createHash('sha256').update(text).digest('hex');
function codepointOrder(a, b) {
  const aa = Array.from(a, c => c.codePointAt(0)), bb = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort(codepointOrder).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => sha(canonical(value));
export const copy = value => structuredClone(value);
export function fixture(evidenceClass = 'LOCAL_FIXTURE') {
  const requiredReviewers = ['qa-engineer', 'security-officer', 'library-reviewer'].map(role => ({role, requiredChecks: ['check:acceptance', 'check:boundary'], independentOf: ['actor:implementer']}));
  const expected = {
    version: 'ship-context/v1', repositoryId: 'repo:synthetic', projectId: 'project:synthetic',
    source: {head: '1'.repeat(40), tree: '2'.repeat(40), clean: true, dirtyDigest: null, exclusionsDigest: sha('no-exclusions')},
    taskId: 'task:candidate', runId: 'run:synthetic', gateId: 'gate:ship', policyDigest: sha('frozen-policy'),
    requirementsDigest: digest(requiredReviewers), evidenceClass, requiredReviewers,
  };
  const contextDigest = digest(expected);
  const invocations = requiredReviewers.map(({role, independentOf, requiredChecks}) => ({
    version: 'ship-assignment/v1', reviewerInvocationId: `invocation:${role}`, role, expectedContextDigest: contextDigest,
    taskId: expected.taskId, runId: expected.runId, reviewerActorId: `actor:${role}`, independentOf: [...independentOf],
    requiredChecks: [...requiredChecks], issuedAtMs: 100, expiresAtMs: 1000, revoked: false, origin: 'CONTROLLER',
  }));
  const records = invocations.map((inv, ordinal) => ({
    version: 'ship-evidence/v2', recordId: `review:${inv.role}`, reviewerInvocationId: inv.reviewerInvocationId,
    expectedContextDigest: contextDigest, role: inv.role, outcome: 'PASS',
    checkEvidence: inv.requiredChecks.map(checkId => ({checkId, state: 'PASS', evidenceDigest: sha(`evidence:${checkId}`)})),
    reviewedEvidenceDigest: sha(`reviewed:${inv.role}`), authority: 'CONTROLLED_REVIEW',
    releaseEligibility: 'SOURCE_GATE_ONLY', evidenceClass, findingIds: [], startedAtMs: 200, finishedAtMs: 300,
    rawRecordDigest: sha(`raw:${inv.role}`), origin: {journalId: 'journal:synthetic', ordinal, rawDigest: sha(`line:${ordinal}`)},
  }));
  return {expected, invocations, records, obligations: [], resolutions: [], tasks: [], readStatus: {
    version: 'ship-read-status/v1', nowMs: 400, context: 'COMPLETE', assignments: 'COMPLETE', journals: 'COMPLETE',
    tasks: 'COMPLETE', policy: 'COMPLETE', origins: 'COMPLETE', trustedOwnerDecisions: [],
  }};
}
export function negative(input, name = 'A', overrides = {}) {
  const r = {...copy(input.records[0]), recordId: `negative:${name}`, outcome: 'FAIL', findingIds: [`finding:${name}`],
    rawRecordDigest: sha(`negative:${name}`), origin: {journalId: 'journal:old', ordinal: name.charCodeAt(0), rawDigest: sha(`negative-line:${name}`)}, ...overrides};
  input.records.push(r);
  return r;
}
export function obligation(record, findingId = record.findingIds[0] || `record:${record.rawRecordDigest}`) {
  return {findingId, originRecordDigest: record.rawRecordDigest, originContextDigest: record.expectedContextDigest,
    role: record.role, severity: 'HIGH', category: 'correctness', origin: copy(record.origin)};
}
export function resolution(input, record, suffix = 'A') {
  return {version: 'ship-resolution/v1', resolutionId: `resolution:${suffix}`, kind: 'TECHNICAL',
    findingId: record.findingIds[0], originRecordDigest: record.rawRecordDigest, originContextDigest: record.expectedContextDigest,
    targetContextDigest: digest(input.expected), reviewerInvocationId: input.invocations[0].reviewerInvocationId,
    reviewRecordId: input.records[0].recordId, fixCommit: input.expected.source.head,
    changeEvidenceDigest: sha('fix-diff'), verificationEvidenceDigest: sha('verification'), implementerActorId: 'actor:implementer'};
}
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
