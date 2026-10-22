/** Controller-owned observations. Never an execution or approval authority. */
import { createHash } from 'node:crypto';

export const TRACE_LIMITS = Object.freeze({ nodes: 512, edges: 2048, snapshots: 64 });
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest = value => /^[a-f0-9]{64}$/.test(value || '') ? value : null;
const safe = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : null;
const kinds = new Set(['attempt', 'context', 'checks', 'verifier', 'result', 'transition', 'gate', 'approval', 'rework', 'recovery', 'wave', 'manual', 'cancel', 'release', 'reuse']);
const relations = new Set(['dispatch', 'input', 'checks', 'verification', 'outcome', 'transition', 'join', 'gate', 'approval', 'retry', 'recovery', 'wave', 'cancel', 'release']);
const statuses = new Set(['intent', 'recorded', 'verified', 'rework', 'unverifiable', 'blocked', 'passed', 'failed', 'pending', 'approved', 'rejected', 'cancelled', 'recovered', 'manual-action', 'returned', 'threw', 'published', 'skipped']);
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const limited = value => array(value).slice(0, 16).filter(safe);

export function initializeTrace(state) {
  state.executionTrace = { version: 1, runId: state.id, complete: true, truncated: false,
    nodes: [], edges: [], snapshots: [], keys: {}, incoming: {}, approved: {} };
  const entry = recordTrace(state, 'transition', { key: 'entry', role: state.queue?.[0] });
  for (const role of state.queue || []) traceSchedule(state, role, [entry]);
  return state.executionTrace;
}
function traceFor(state) {
  const t = state.executionTrace;
  return t?.version === 1 && t.runId === state.id && Array.isArray(t.nodes) && Array.isArray(t.edges)
    && Array.isArray(t.snapshots) && [t.keys, t.incoming, t.approved].every(v => v && typeof v === 'object' && !Array.isArray(v)) ? t : null;
}
function incomplete(t, truncated = false) { t.complete = false; t.truncated ||= truncated; return null; }

function snapshot(state, t) {
  const graphDigest = sha(state.graph);
  if (!t.snapshots.some(s => s.digest === graphDigest)) {
    if (t.snapshots.length >= TRACE_LIMITS.snapshots) return incomplete(t, true);
    const rules = Object.entries(state.graph || {});
    if (rules.length > 256) return incomplete(t, true);
    if (rules.some(([, r]) => ['on', 'next', 'join', 'gate'].some(k => array(r?.[k]).length > 16))) incomplete(t, true);
    t.snapshots.push({ digest: graphDigest, sourceHash: digest(state.graphHash), rules: rules.map(([role, rule]) => ({
      role: safe(role), on: limited(rule.on),
      next: limited(rule.next), join: limited(rule.join), gates: limited(rule.gate),
    })) });
  }
  return graphDigest;
}

export const receiptDigest = receipt => receipt && typeof receipt === 'object' ? sha(receipt) : null;
export const traceKey = (state, key) => { const keys = traceFor(state)?.keys; return keys && Object.hasOwn(keys, key) ? keys[key] : null; };
export const traceIncoming = (state, role) => { const v = traceFor(state)?.incoming[role]; return Array.isArray(v) ? [...v] : []; };
export function traceSchedule(state, role, ids, append = false) {
  const t = traceFor(state); if (!t) return;
  t.incoming[role] = [...new Set([...(append ? traceIncoming(state, role) : []), ...ids.filter(Boolean)])];
}
export function traceParents(state, roles, includeApprovals = true) {
  const t = traceFor(state); if (!t) return [];
  return [...new Set(roles.flatMap(role => {
    const result = state.results?.[role];
    if (!result) return [];
    const parent = traceKey(state, `result:${result.attemptId}`) || (role === 'devops' ? traceKey(state, `release:${state.release?.id}:published`) : null);
    if (!parent) incomplete(t);
    return [parent, ...(includeApprovals ? array(t.approved[result.digest]) : [])].filter(Boolean);
  }))];
}

/** All parent edges are explicit controller decisions, never time-derived. */
export function recordTrace(state, kind, { key, role = null, attemptId = null, host = null, status = 'recorded',
  parents = [], relation = 'transition', input = null, output = null, resultDigest = null,
  contextDigest = null, waveId = null, gates = [], verdict = null } = {}) {
  const t = traceFor(state);
  if (!t) return null; // Never invent history for old runs.
  if (key && Object.hasOwn(t.keys, key)) return t.keys[key];
  if (!kinds.has(kind) || !statuses.has(status) || !relations.has(relation)) return incomplete(t);
  if (t.nodes.some(n => !n || typeof n.id !== 'string')) return incomplete(t);
  const known = new Set(t.nodes.map(n => n.id));
  const ids = [...new Set(parents.filter(Boolean))];
  if (ids.some(id => !known.has(id))) return incomplete(t);
  if (t.nodes.length >= TRACE_LIMITS.nodes || t.edges.length + ids.length > TRACE_LIMITS.edges) return incomplete(t, true);
  const graphDigest = snapshot(state, t);
  if (!graphDigest) return null;
  if (array(gates).length > 16) incomplete(t, true);
  const id = `node-${t.nodes.length + 1}`;
  t.nodes.push({ id, kind, role: safe(role), attemptId: safe(attemptId), host: ['codex', 'claude-code'].includes(host) ? host : null,
    status, at: new Date().toISOString(), graphDigest, inputDigest: receiptDigest(input), outputDigest: receiptDigest(output),
    resultDigest: digest(resultDigest), contextDigest: digest(contextDigest), waveId: safe(waveId),
    gates: limited(gates), verdict: safe(verdict) });
  for (const from of ids) t.edges.push({ from, to: id, kind: relation });
  if (key) t.keys[key] = id;
  return id;
}

export function traceAttempt(state, attempt, { parents = traceIncoming(state, attempt.role), waveId = null } = {}) {
  const node = recordTrace(state, 'attempt', { key: `attempt:${attempt.id}`, role: attempt.role, attemptId: attempt.id,
    host: attempt.host, status: 'intent', input: attempt.inputReceipt, parents, relation: waveId ? 'wave' : 'dispatch', waveId });
  traceSchedule(state, attempt.role, []);
  return node;
}

export function traceGate(state) {
  const p = state.pending; if (!p) return null;
  const key = `gate:${sha({ role: p.role, result: p.result, gates: p.gates, receipt: p.receipt })}`;
  const rule = state.graph[`${p.role}.${state.results[p.role]?.verdict}`] || state.graph[p.role];
  return recordTrace(state, 'gate', { key, role: p.role, status: 'pending', gates: p.gates,
    parents: traceParents(state, [p.role, ...array(rule?.join)]), relation: 'gate', input: p.receipt, resultDigest: p.result });
}
export function traceApproval(state, pending, rejected = false) {
  const t = traceFor(state); if (!t) return null;
  const parent = traceGate(state);
  const id = recordTrace(state, 'approval', { role: pending.role, status: rejected ? 'rejected' : 'approved',
    parents: [parent], relation: 'approval', input: pending.receipt, resultDigest: pending.result, gates: pending.gates });
  if (id && !rejected) (t.approved[pending.result] ||= []).push(id);
  return id;
}

/** Strict allowlist; no raw prompt, path, receipt map, gate token or report. */
export function projectExecutionTrace(state) {
  const t = traceFor(state);
  const unavailable = reason => ({ state: 'unavailable', complete: false, truncated: false, nodes: [], edges: [], snapshots: [], reason });
  if (!t) return unavailable('This run has no controller-recorded causal history. Legacy and native observations are not reconstructed.');
  if (t.nodes.length > TRACE_LIMITS.nodes || t.edges.length > TRACE_LIMITS.edges || t.snapshots.length > TRACE_LIMITS.snapshots)
    return unavailable('Execution history exceeds the read limit.');
  const ids = new Set(), snapshots = new Set(t.snapshots.map(s => digest(s?.digest)).filter(Boolean));
  const nodes = [];
  for (const n of t.nodes) {
    if (!n || !safe(n.id) || ids.has(n.id) || !kinds.has(n.kind) || !statuses.has(n.status)
      || !snapshots.has(n.graphDigest) || array(n.gates).length > 16 || typeof n.at !== 'string' || n.at.length > 40 || !Number.isFinite(Date.parse(n.at))) return unavailable('Execution history is malformed.');
    ids.add(n.id);
    nodes.push({ id: n.id, kind: n.kind, role: safe(n.role), attemptId: safe(n.attemptId), host: ['codex', 'claude-code'].includes(n.host) ? n.host : null,
      status: n.status, at: n.at, graphDigest: n.graphDigest, inputDigest: digest(n.inputDigest), outputDigest: digest(n.outputDigest),
      resultDigest: digest(n.resultDigest), contextDigest: digest(n.contextDigest), waveId: safe(n.waveId),
      gates: limited(n.gates), verdict: safe(n.verdict) });
  }
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = [];
  for (const e of t.edges) {
    if (!e || !ids.has(e.from) || !ids.has(e.to) || order.get(e.from) >= order.get(e.to) || !relations.has(e.kind))
      return unavailable('Execution dependencies are malformed or cyclic.');
    edges.push({ from: e.from, to: e.to, kind: e.kind });
  }
  const projectedSnapshots = [];
  for (const s of t.snapshots) {
    if (!digest(s?.digest) || !Array.isArray(s.rules) || s.rules.length > 256) return unavailable('Workflow snapshot is malformed.');
    if (s.rules.some(r => ['on', 'next', 'join', 'gates'].some(key => array(r?.[key]).length > 16))) return unavailable('Workflow snapshot exceeds nested limits.');
    projectedSnapshots.push({ digest: s.digest, sourceHash: digest(s.sourceHash), rules: s.rules.map(r => ({
      role: safe(r?.role), on: limited(r?.on), next: limited(r?.next), join: limited(r?.join), gates: limited(r?.gates),
    })) });
  }
  return { state: nodes.length ? 'recorded' : 'empty', complete: t.complete === true && !t.truncated,
    truncated: t.truncated === true, nodes, edges, snapshots: projectedSnapshots,
    reason: t.complete === true && !t.truncated ? null : 'Controller history is incomplete; missing dependencies are not inferred.' };
}
