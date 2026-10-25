/** Local observation only. Never owns execution, gate decisions or native sessions. */
import { createHash } from 'node:crypto';
import { normalizeHostEvents } from './host-graph-events.mjs';
import { appendHostGraphEvent, readHostGraph } from './host-graph-journal.mjs';
import { projectIdentity } from './work-tasks.mjs';

export function graphBinding({ root, runId, sessionId, attemptId = null, host = null }) {
  return { root, projectId: projectIdentity(root), runId, sessionId, attemptId, ...(host ? { host } : {}) };
}
export function recordHostGraphGap(binding, host, mode, diagnosticCodes, { store } = {}) {
  const codes = [...new Set(diagnosticCodes)].sort();
  const id = createHash('sha256').update(JSON.stringify([binding.projectId, binding.runId, binding.sessionId, binding.attemptId, codes])).digest('hex');
  return appendHostGraphEvent(binding, { schemaVersion: 1, id, host, mode, kind: 'error', phase: 'unknown', outcome: 'unknown',
    sessionId: binding.sessionId, attemptId: binding.attemptId || null, parentIds: [], observedAt: new Date().toISOString(), diagnosticCodes: codes }, { store });
}
export function observeHostGraph({ binding, host, mode, sourceVersion, event, store }) {
  try {
    const normalized = normalizeHostEvents({ host, mode, sourceVersion, event, binding });
    const results = normalized.events.map(e => appendHostGraphEvent(binding, e, { store }));
    if (normalized.diagnostics.length) {
      results.push(recordHostGraphGap(binding, host, mode, normalized.diagnostics, { store }));
    }
    const degraded = normalized.diagnostics.length || results.some(r => r.state === 'degraded');
    return { state: degraded ? 'degraded' : results.length ? 'recorded' : 'ignored',
      recorded: results.filter(r => r.state === 'recorded').length,
      // Do not forward parser exceptions or source payloads into public state.
      reason: degraded ? 'Host observations have gaps or unavailable storage.' : null };
  } catch { return { state: 'degraded', recorded: 0, reason: 'Host observation could not be recorded.' }; }
}

/** Explicit call identity links start/end; ordering alone never creates an edge. */
export function projectHostObservations(binding, options = {}) {
  try {
    const read = readHostGraph(binding, options), events = read.events || [];
    const nodes = events.map(e => ({ id: e.id, kind: e.kind, role: e.toolClass || e.kind,
      host: e.host, sourceVersion: e.sourceVersion || null, status: e.outcome === 'unknown' ? e.phase : e.outcome,
      at: e.occurredAt || e.observedAt, attemptId: e.attemptId, source: 'host-observation' }));
    const ids = new Set(nodes.map(n => n.id)), edges = [], starts = new Map(), ends = new Map();
    const callKey = e => JSON.stringify([e.host, e.sessionId, e.attemptId, e.callId]);
    for (const e of events) {
      for (const parent of e.parentIds || []) if (ids.has(parent) && parent !== e.id) edges.push({ from: parent, to: e.id, kind: 'observed-parent' });
      if (e.callId) { const map = e.phase === 'started' ? starts : ends; const key = callKey(e);
        map.set(key, map.has(key) ? null : e.id); }
    }
    for (const e of events) if (e.callId && e.phase !== 'started' && starts.get(callKey(e)) && ends.get(callKey(e)) === e.id) {
      const from = starts.get(callKey(e)); if (from !== e.id) edges.push({ from, to: e.id, kind: 'same-call' });
    }
    const times = events.map(e => Date.parse(e.observedAt)).filter(Number.isFinite);
    return { binding: { runId: binding.runId, sessionId: binding.sessionId, host: binding.host || events[0]?.host || null }, state: nodes.length ? 'recorded' : 'unavailable', source: 'host-observation', complete: false,
      truncated: !!read.cursor, nodes, edges, snapshots: [], diagnostics: (read.diagnostics || []).slice(0, 16),
      observedInterval: times.length ? { from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString() } : null, coverage: read.coverage, health: read.health,
      cursor: read.cursor, total: read.total, reason: read.reason || 'Host observations do not establish controller transitions, delivery completeness or gate approval.' };
  } catch (error) { return { state: 'unavailable', source: 'host-observation', complete: false, truncated: false,
    nodes: [], edges: [], snapshots: [], health: 'degraded', reason: typeof error?.code === 'string' && /^E[A-Z0-9_]+$/.test(error.code)
      ? `Host observation source is unreadable (${error.code}).` : 'Host observation source is unreadable.' }; }
}

export const bindingDigest = binding => createHash('sha256').update(JSON.stringify([
  binding.projectId, binding.runId, binding.sessionId,
])).digest('hex');
