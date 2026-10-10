/** Controller invocation evidence, not provider API usage or quality scores. */
const hosts = new Set(['codex', 'claude-code']);
const kinds = new Set(['worker', 'verifier']);

export async function observeControllerCall(state, identity, run, save = () => {}) {
  state.dispatchEvidence ??= { version: 1, completeHistory: false, records: [] };
  const evidence = state.dispatchEvidence;
  if (evidence.version !== 1 || !Array.isArray(evidence.records) || evidence.records.length >= 1024
    || typeof identity.id !== 'string' || !identity.id || !hosts.has(identity.host) || !kinds.has(identity.kind)
    || typeof identity.role !== 'string' || !identity.role || evidence.records.some(r => !r || r.id === identity.id)) throw Error('invalid/replayed controller call observation');
  const record = { id: identity.id, host: identity.host, role: identity.role, kind: identity.kind,
    startedAt: new Date().toISOString(), finishedAt: null, outcome: 'intent' };
  evidence.records.push(record);
  // A crash after durable intent cannot prove whether provider execution began.
  // Summary leaves counts/timing unknown until completion, never restarts it.
  save(state);
  try {
    const result = await run();
    record.outcome = 'returned';
    return result;
  } catch (error) {
    record.outcome = 'threw';
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    save(state);
  }
}

export function dispatchEvidenceSummary(state) {
  const evidence = state.dispatchEvidence;
  if (!evidence || evidence.version !== 1 || !Array.isArray(evidence.records)) return {
    evidenceLevel: 'unavailable', workerCalls: null, verifierCalls: null, activeMs: null, actualCostUsd: null };
  const records = evidence.records;
  const identities = new Set();
  const intervals = [];
  let valid = evidence.completeHistory === true && records.length <= 1024;
  for (const r of records) {
    if (!r || typeof r !== 'object') { valid = false; continue; }
    const start = Date.parse(r.startedAt), end = Date.parse(r.finishedAt);
    if (typeof r.id !== 'string' || !r.id || identities.has(r.id) || !hosts.has(r.host) || !kinds.has(r.kind)
      || typeof r.role !== 'string' || !r.role || typeof r.startedAt !== 'string' || typeof r.finishedAt !== 'string'
      || !['returned', 'threw'].includes(r.outcome) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) valid = false;
    else intervals.push([start, end]);
    identities.add(r.id);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let activeMs = 0, current = null;
  for (const [start, end] of intervals) {
    if (!current) current = [start, end];
    else if (start <= current[1]) current[1] = Math.max(current[1], end);
    else { activeMs += current[1] - current[0]; current = [start, end]; }
  }
  if (current) activeMs += current[1] - current[0];
  return { evidenceLevel: valid ? 'controller-invocations-recorded' : 'incomplete-controller-history',
    workerCalls: valid ? records.filter(r => r.kind === 'worker').length : null,
    verifierCalls: valid ? records.filter(r => r.kind === 'verifier').length : null,
    activeMs: valid ? activeMs : null, actualCostUsd: null,
    semantics: 'worker/verifier invocation attempts include launch failures; provider model-call count, billing and product quality are not inferred' };
}
