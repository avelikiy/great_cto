/** Operator-owned intent and execution receipts, outside worker projects. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, realpathSync, rmSync, existsSync, lstatSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

export const workTaskStore = () => process.env.GREAT_CTO_TASKS_DIR || join(homedir(), '.great_cto', 'work-tasks');
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hosts = new Set(['codex', 'claude-code']);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const projectIdentity = root => 'project:' + createHash('sha256').update(realpathSync(root)).digest('hex');
const canonical = root => realpathSync(root);
const fileFor = (store, id) => { if (!UUID.test(id || '')) throw Error('invalid task UUID'); return join(store, `${id}.json`); };
function assertExternal(root, store) {
  let actual = resolve(store), suffix = [];
  while (!existsSync(actual)) { suffix.unshift(basename(actual)); actual = dirname(actual); }
  actual = join(realpathSync(actual), ...suffix);
  const rel = relative(canonical(root), actual);
  if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw Error('task store must be operator-owned outside the worker project');
  if (existsSync(store) && lstatSync(store).isSymbolicLink()) throw Error('task store cannot be a symlink');
}
function ensureStore(root, store) { assertExternal(root, store); mkdirSync(store, { recursive: true, mode: 0o700 }); if (lstatSync(store).mode & 0o077) throw Error('task store permissions must be 0700'); }
function validate(t) {
  if (!t || t.schemaVersion !== 1 || !UUID.test(t.taskId) || !hosts.has(t.host) || typeof t.root !== 'string'
    || typeof t.goal !== 'string' || !Array.isArray(t.acceptance) || t.acceptance.some(v => typeof v !== 'string')
    || !Number.isInteger(t.revision) || t.revision < 1 || !Array.isArray(t.operations)
    || t.operations.some(o => !o || !UUID.test(o.operationId) || typeof o.requestDigest !== 'string' || !['start', 'resume'].includes(o.kind) || !['running', 'host_returned'].includes(o.state))
    || !Array.isArray(t.links?.runs) || t.links.runs.some(id => !UUID.test(id))
    || !Array.isArray(t.links?.sessions) || t.links.sessions.some(id => !UUID.test(id))
    || !Array.isArray(t.links?.issues) || t.links.issues.some(id => typeof id !== 'string')
    || !Array.isArray(t.observations) || !Array.isArray(t.evidence) || !t.metrics || typeof t.metrics.interruptions !== 'object'
    || !['accepted', 'working', 'needs_decision', 'blocked', 'waiting', 'unknown', 'cancelled', 'completed'].includes(t.phase)) throw Error('invalid task state');
  return t;
}
export function readWorkTask(id, { store = workTaskStore(), root = null } = {}) {
  const file = fileFor(store, id);
  const info = lstatSync(file);
  if (info.isSymbolicLink()) throw Error('task state cannot be a symlink');
  if (info.mode & 0o077) throw Error('task state permissions must be 0600');
  const t = validate(JSON.parse(readFileSync(file, 'utf8')));
  if (t.taskId !== id || (root && canonical(t.root) !== canonical(root))) throw Error('task does not belong to this project');
  return t;
}
export function listWorkTasks(root, { store = workTaskStore() } = {}) {
  assertExternal(root, store);
  if (existsSync(store) && (lstatSync(store).mode & 0o077)) throw Error('task store permissions must be 0700');
  const projectRoot = canonical(root); let names;
  try { names = readdirSync(store); } catch (e) { if (e.code === 'ENOENT') return { state: 'absent', tasks: [], unreadable: 0 }; throw e; }
  const tasks = []; let unreadable = 0;
  for (const name of names.filter(n => UUID.test(n.replace(/\.json$/, '')) && n.endsWith('.json')).sort()) {
    try {
      const t = readWorkTask(name.slice(0, -5), { store });
      if (t.root === projectRoot) tasks.push(t);
    } catch { unreadable++; }
  }
  return { state: unreadable ? 'degraded' : 'ok', tasks, unreadable };
}
function save(t, store) {
  const file = fileFor(store, t.taskId), tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(t, null, 2), { mode: 0o600 }); renameSync(tmp, file);
}
function mutate(id, fn, { store = workTaskStore(), root = null } = {}) {
  const lock = `${fileFor(store, id)}.write-lock`; let acquired = false;
  for (let i = 0; i < 10; i++) {
    try { mkdirSync(lock, { mode: 0o700 }); acquired = true; break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15); }
  }
  if (!acquired) throw Error('task metadata is owned by another writer; inspect the write lock');
  try {
    const t = readWorkTask(id, { store, root });
    if (fn(t) === false) return t;
    t.revision++; t.updatedAt = new Date().toISOString(); save(t, store); return t;
  } finally { rmSync(lock, { recursive: true }); }
}

export function acquireProjectLease(root, { store = workTaskStore(), reuseToken = null } = {}) {
  root = canonical(root); ensureStore(root, store);
  const dir = join(store, 'leases'); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, digest(root) + '.lock');
  if (reuseToken) {
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
    if (owner.token !== reuseToken || owner.pid !== process.ppid || owner.projectId !== projectIdentity(root)) throw Error('invalid project lease handoff');
    return { token: owner.token, release() {} };
  }
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') throw Error('project execution is already owned; inspect its lease before recovery'); throw e; }
  const token = randomUUID();
  try { writeFileSync(join(lock, 'owner.json'), JSON.stringify({ token, pid: process.pid, projectId: projectIdentity(root), acquiredAt: new Date().toISOString() }), { mode: 0o600 }); }
  catch (e) { rmSync(lock, { recursive: true }); throw e; }
  return { token, release() {
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
    if (owner.token !== token || owner.pid !== process.pid) throw Error('project lease ownership changed');
    rmSync(lock, { recursive: true });
  } };
}

function newTaskRecord({ root, host, goal, acceptance = [], authority = null }) {
  const now = new Date().toISOString();
  return { schemaVersion: 1, taskId: randomUUID(), root, managed: true, projectId: projectIdentity(root), host,
        goal: goal.trim(), acceptance: [...acceptance], authority,
        revision: 1, createdAt: now, updatedAt: now, phase: 'accepted', reason: null,
        links: { runs: [], sessions: [], issues: [] }, operations: [], observations: [], evidence: [],
        metrics: { firstObservedStartAt: null, timeToObservedStartMs: null, interruptions: {} } };
}

export function beginWork({ root, host, kind = 'start', goal = null, acceptance = [], authority = null,
  taskId = null, operationId = randomUUID(), expectedRevision = null }, { store = workTaskStore() } = {}) {
  root = canonical(root);
  if (!hosts.has(host) || !['start', 'resume'].includes(kind) || !UUID.test(operationId)) throw Error('invalid work operation');
  if (kind === 'start' && (typeof goal !== 'string' || !goal.trim() || !Array.isArray(acceptance) || acceptance.some(v => typeof v !== 'string' || !v.trim()))) throw Error('goal and acceptance must be explicit strings');
  const requestDigest = digest({ root, host, kind, goal, acceptance, authority, taskId, expectedRevision });
  const prior = listWorkTasks(root, { store });
  if (prior.state === 'degraded') throw Error('task state is unreadable; selection is blocked');
  for (const t of prior.tasks) {
    const op = t.operations.find(o => o.operationId === operationId);
    if (!op) continue;
    if (op.requestDigest !== requestDigest) throw Error('idempotency key conflicts with another request');
    return { task: t, operation: op, replay: true, lease: null };
  }
  const lease = acquireProjectLease(root, { store });
  try {
    const underLease = listWorkTasks(root, { store });
    if (underLease.state === 'degraded') throw Error('task state is unreadable');
    for (const t of underLease.tasks) {
      const existing = t.operations.find(o => o.operationId === operationId);
      if (existing) {
        if (existing.requestDigest !== requestDigest) throw Error('idempotency key conflicts with another request');
        lease.release(); return { task: t, operation: existing, replay: true, lease: null };
      }
    }
    const now = new Date().toISOString(); let task;
    if (kind === 'resume') {
      task = readWorkTask(taskId, { store, root });
      if (task.managed === false) throw Error('observed native session has no managed ownership; resume inside its native host');
      if (['cancelled', 'completed'].includes(task.phase)) throw Error('terminal task cannot resume');
      if (task.operations.some(o => o.state === 'running')) throw Error('previous host operation is not reconciled; inspect it before resume');
      if (task.host !== host) throw Error('task host cannot change during resume');
      if (expectedRevision !== null && task.revision !== expectedRevision) throw Error('stale task revision; refresh before resume');
    } else {
      task = newTaskRecord({ root, host, goal, acceptance, authority });
      save(task, store);
    }
    const operation = { operationId, requestDigest, kind, state: 'running', startedAt: now, finishedAt: null, exitCode: null };
    task = mutate(task.taskId, t => { t.operations.push(operation); }, { store, root });
    return { task, operation, replay: false, lease };
  } catch (e) { lease.release(); throw e; }
}
export function finishWork(taskId, operationId, exitCode, { store = workTaskStore(), root = null } = {}) {
  return mutate(taskId, t => {
    const op = t.operations.find(o => o.operationId === operationId);
    if (!op || op.state !== 'running') throw Error('operation is not running');
    op.state = 'host_returned'; op.exitCode = exitCode; op.finishedAt = new Date().toISOString();
    // Host exit does not prove acceptance, and absence of hooks does not prove progress.
    if (!t.observations.length || (t.host === 'claude-code' && t.phase === 'working')) { t.phase = exitCode === 0 ? 'unknown' : 'blocked'; t.reason = 'Host returned; no execution observation recorded'; }
  }, { store, root });
}
export function linkWork(taskId, type, id, { store = workTaskStore(), root, host } = {}) {
  if (!['runs', 'sessions', 'issues'].includes(type) || typeof id !== 'string' || !id) throw Error('invalid host link');
  if (type !== 'issues' && !UUID.test(id)) throw Error('invalid execution UUID');
  return mutate(taskId, t => {
    if (host && t.host !== host) throw Error('host link mismatch');
    if (t.links[type].includes(id)) return false;
    t.links[type].push(id);
  }, { store, root });
}
function observe(t, { phase, reason = null, kind, at = new Date().toISOString() }) {
  if (t.phase === phase && t.reason === reason && t.observations.at(-1)?.kind === kind) return false;
  t.phase = phase; t.reason = reason; t.observations.push({ kind, phase, reason, at });
  if (phase === 'working' && !t.metrics.firstObservedStartAt) {
    t.metrics.firstObservedStartAt = at; t.metrics.timeToObservedStartMs = Math.max(0, Date.parse(at) - Date.parse(t.createdAt));
  }
  if (['needs_decision', 'blocked'].includes(phase)) t.metrics.interruptions[kind] = (t.metrics.interruptions[kind] || 0) + 1;
}
export function observeWorkRun(state, { store = workTaskStore() } = {}) {
  if (!state.taskId) return null;
  return mutate(state.taskId, t => {
    if (t.host !== 'codex' || !t.links.runs.includes(state.id)) throw Error('run is not linked to task');
    let evidenceChanged = false;
    const started = (state.attempts || []).find(a => a.startedAt)?.startedAt;
    if (started && !t.metrics.firstObservedStartAt) {
      evidenceChanged = true;
      t.metrics.firstObservedStartAt = started; t.metrics.timeToObservedStartMs = Math.max(0, Date.parse(started) - Date.parse(t.createdAt));
    }
    const status = state.status;
    const phase = state.active || state.wave?.status === 'running' ? 'working'
      : ['awaiting-gate', 'awaiting-release'].includes(status) ? 'needs_decision'
      : status === 'blocked' || status === 'manual-action' || status === 'join-wait' ? 'blocked'
      : status === 'done' ? 'waiting' : status === 'cancelled' ? 'cancelled' : 'accepted';
    const reason = status === 'done' ? 'Run finished; acceptance evidence must still be recorded'
      : state.reason || (phase === 'needs_decision' ? 'Host approval required' : null);
    const nextEvidence = Object.entries(state.results || {}).map(([role, r]) => ({ role, verdict: r.verdict || null }));
    evidenceChanged ||= JSON.stringify(nextEvidence) !== JSON.stringify(t.evidence);
    t.evidence = nextEvidence;
    const observed = observe(t, { phase, reason, kind: phase === 'needs_decision' ? 'host_approval' : status === 'manual-action' ? 'manual_action' : 'controlled_run' });
    return observed === false && !evidenceChanged ? false : undefined;
  }, { store, root: state.root });
}
export function registerNativeStart(payload, { store = workTaskStore() } = {}) {
  if (payload?.hook_event_name !== 'UserPromptSubmit' || !UUID.test(payload.session_id || '')) return null;
  const match = String(payload.prompt || '').match(/^\/(?:great[-_]cto:)?start\s+([\s\S]+)$/);
  if (!match || !match[1].trim()) return null;
  const root = canonical(payload.cwd), lease = acquireProjectLease(root, { store });
  try {
    const listing = listWorkTasks(root, { store });
    if (listing.state === 'degraded') throw Error('task state is unreadable');
    if (listing.tasks.some(t => t.links.sessions.includes(payload.session_id))) return null;
    const task = newTaskRecord({ root, host: 'claude-code', goal: match[1],
      authority: { mode: 'native-interactive', writeScope: null } });
    task.managed = false; task.links.sessions.push(payload.session_id);
    observe(task, { phase: 'working', kind: 'native_session' }); save(task, store); return task;
  } finally { lease.release(); }
}
export function observeWorkSession(payload, { store = workTaskStore() } = {}) {
  if (!UUID.test(payload?.session_id || '') || !payload.cwd) return null;
  const listing = listWorkTasks(payload.cwd, { store });
  if (listing.state === 'degraded') throw Error('task metadata is unreadable');
  let tasks = listing.tasks.filter(t => t.host === 'claude-code' && t.links.sessions.includes(payload.session_id));
  if (!tasks.length) { const registered = registerNativeStart(payload, { store }); if (registered) return registered; }
  if (tasks.length !== 1) return null;
  const event = payload.hook_event_name;
  const phase = event === 'UserPromptSubmit' ? 'working' : event === 'Notification' ? 'needs_decision'
    : ['Stop', 'SessionEnd'].includes(event) ? 'waiting' : null;
  if (!phase) return null;
  return mutate(tasks[0].taskId, t => observe(t, { phase,
    reason: event === 'Notification' ? String(payload.message || 'Native host input required').slice(0, 300) : null,
    kind: event === 'Notification' ? 'native_permission_or_input' : 'native_session' }), { store, root: payload.cwd });
}
export function publicWorkTask(t) {
  return { schemaVersion: 1, taskId: t.taskId, projectId: t.projectId, managed: t.managed, host: t.host, goal: t.goal,
    acceptance: t.acceptance, authority: t.authority, revision: t.revision, phase: t.phase, reason: t.reason,
    createdAt: t.createdAt, updatedAt: t.updatedAt, links: t.links, evidence: t.evidence, metrics: t.metrics,
    operations: t.operations.map(({ operationId, kind, state, startedAt, finishedAt, exitCode }) => ({ operationId, kind, state, startedAt, finishedAt, exitCode })) };
}
