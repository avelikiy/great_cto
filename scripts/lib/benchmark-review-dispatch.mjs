/** Read-only controller trace audit, not domain/package/provider attestation. */
import { dispatchEvidenceSummary } from './controller-dispatch-evidence.mjs';
import { completeScopeAttestation } from './scoped-review-reuse.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mandatory = new Set(['code-reviewer', 'qa-engineer', 'security-officer', 'ai-eval-engineer']);

export function assertBenchmarkReviewDispatches(state, roles) {
  if (!Array.isArray(roles) || !roles.length || new Set(roles).size !== roles.length
    || roles.some(role => typeof role !== 'string' || !role)
    || dispatchEvidenceSummary(state).evidenceLevel !== 'controller-invocations-recorded') throw Error('benchmark review dispatch: complete valid invocation history required');
  const records = new Map(state.dispatchEvidence.records.map(record => [record.id, record]));
  const used = new Set();
  for (const role of roles) {
    const result = state.results?.[role];
    const matches = state.attempts?.filter(attempt => attempt.id === result?.attemptId) || [];
    const attempt = matches[0];
    const host = state.hostRoutes?.[role] || state.hostRoutes?.[state.specialistStages?.[role]?.role] || 'codex';
    if (!result || typeof result.attemptId !== 'string' || !result.attemptId
      || matches.length !== 1 || attempt.role !== role || attempt.status !== 'verified'
      || attempt.host !== host || result.host !== host || !attempt.inputReceipt || attempt.inputReceipt.truncated
      || !attempt.receipt || attempt.receipt.truncated || !same(result.receipt, attempt.receipt)
      || attempt.verification?.state !== 'verified' || !Array.isArray(attempt.verification.checks)
      || !attempt.verification.checks.length
      || !same(result.verification, attempt.verification)) throw Error('benchmark review dispatch: required role attempt identity mismatch');
    const verifier = records.get(`${attempt.id}:verifier`);
    if (verifier?.kind !== 'verifier' || verifier.role !== 'codex-verifier' || verifier.host !== 'codex'
      || verifier.outcome !== 'returned') throw Error('benchmark review dispatch: required independent verifier missing');
    if (attempt.reuse) {
      const prior = attempt.reuse, source = state.specialistPolicy?.reviewReuse?.sources?.[role];
      if (mandatory.has(role) || attempt.workerCallId || records.has(`${attempt.id}:worker`)
        || !source || !same(result.reuse, prior) || prior.role !== role || prior.runId === state.id
        || typeof prior.runId !== 'string' || !prior.runId || typeof prior.attemptId !== 'string' || !prior.attemptId
        || !/^[a-f0-9]{64}$/.test(prior.resultDigest || '') || !/^[a-f0-9]{64}$/.test(prior.sourceDigest || '') || prior.sourceDigest !== source.sha256
        || !state.specialistPolicy.reviewReuse.scopes?.[role]
        || !/^[a-f0-9]{64}$/.test(attempt.scopedInput?.digest || '')
        || !completeScopeAttestation(attempt.verification, attempt.scopedInput)) throw Error('benchmark review dispatch: reuse lacks fresh scoped attestation');
      continue;
    }
    const workerId = attempt.workerCallId || `${attempt.id}:worker`, worker = records.get(workerId);
    if (attempt.workerCallId) {
      const waves = state.waveHistory?.filter(wave => wave.status === 'verified'
        && workerId === `${wave.id}:${role}` && wave.roles?.includes(role) && wave.hosts?.[role] === host) || [];
      if (waves.length !== 1) throw Error('benchmark review dispatch: worker is not bound to a verified mixed-host wave');
    }
    if (used.has(workerId) || worker?.kind !== 'worker' || worker.role !== role || worker.host !== host
      || worker.outcome !== 'returned' || Date.parse(worker.finishedAt) > Date.parse(verifier.startedAt)) throw Error('benchmark review dispatch: required worker missing, mismatched or after verification');
    used.add(workerId);
  }
  return { version: 1, scope: 'required-controller-review-dispatches-only', roles: [...roles],
    domainSelectionVerified: false, providerExecutionVerified: false };
}
