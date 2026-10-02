/** Same-machine cross-host admission control, outside worker project scope. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmdirSync, realpathSync, existsSync, lstatSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const outside = (root, path) => { const rel = relative(root, path); return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel); };
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function readExecutionBudget(root, { env = process.env } = {}) {
  if (!env.GREAT_CTO_AGENT_BUDGET_FILE) return null;
  root = realpathSync(root);
  const file = realpathSync(env.GREAT_CTO_AGENT_BUDGET_FILE);
  if (!outside(root, file)) throw Error('agent budget policy must be outside the worker workspace');
  if ((lstatSync(file).mode & 0o077) !== 0) throw Error('agent budget policy must be private (0600)');
  const policy = JSON.parse(readFileSync(file, 'utf8'));
  for (const [key, min, max] of [['maxConcurrent', 1, 16], ['maxCallsPerRun', 2, 512]]) {
    if (!Number.isInteger(policy[key]) || policy[key] < min || policy[key] > max) throw Error(`invalid agent budget ${key}`);
  }
  if (policy.maxDepth !== 1) throw Error('v1 requires maxDepth=1; nested delegation is not admitted');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(policy.runId || '')) throw Error('explicit shared budget runId required');
  const limits = { maxConcurrent: policy.maxConcurrent, maxDepth: 1, maxCallsPerRun: policy.maxCallsPerRun };
  const configured = env.GREAT_CTO_AGENT_BUDGET_STORE || join(homedir(), '.great_cto', 'agent-execution');
  if (!isAbsolute(configured) || !outside(root, configured)) throw Error('agent budget store must be absolute and outside workspace');
  mkdirSync(configured, { recursive: true, mode: 0o700 });
  const store = realpathSync(configured);
  if (!outside(root, store) || (lstatSync(store).mode & 0o077) !== 0) throw Error('agent budget store must be private and outside workspace');
  return { store, limits, policyDigest: sha(JSON.stringify(limits)), runKey: sha(policy.runId) };
}

function atomicJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}

/** A crashed lock stays closed. No TTL/PID assumption can prove a worker ended. */
function transaction(budget, operation) {
  const lock = join(budget.store, 'lock'); const deadline = Date.now() + 1500;
  while (true) {
    try { mkdirSync(lock, { mode: 0o700 }); break; }
    catch (e) { if (e.code !== 'EEXIST' || Date.now() >= deadline) throw Error('agent budget lock unavailable; inspect/reconcile, never bypass'); sleep(10); }
  }
  const lockToken = randomUUID();
  try {
    atomicJson(join(lock, 'owner.json'), { token: lockToken, pid: process.pid });
    const path = join(budget.store, 'ledger.json');
    const ledger = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { version: 1, policyDigest: budget.policyDigest, limits: budget.limits, nextFence: 0, leases: {}, calls: {}, retired: {}, events: [] };
    if (ledger.version !== 1 || ledger.policyDigest !== budget.policyDigest || JSON.stringify(ledger.limits) !== JSON.stringify(budget.limits) || !ledger.leases || !ledger.calls || !ledger.retired || !Array.isArray(ledger.events) || !Number.isSafeInteger(ledger.nextFence) || ledger.nextFence < 0 || Object.values(ledger.calls).some(n => !Number.isSafeInteger(n) || n < 0)) throw Error('agent budget ledger/policy mismatch; admission refused');
    const result = operation(ledger);
    atomicJson(path, ledger);
    return result;
  } finally {
    // Only the holder may unlock. Never delete somebody else's state recursively.
    const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
    if (owner.token !== lockToken) throw Error('agent budget lock ownership changed');
    unlinkSync(join(lock, 'owner.json')); rmdirSync(lock);
  }
}

const event = (ledger, entry) => {
  ledger.events.push({ at: new Date().toISOString(), ...entry });
  if (ledger.events.length > 2000) ledger.events.splice(0, ledger.events.length - 2000);
};

/** Allocate a whole wave atomically, so one host cannot consume half a quorum. */
export function reserveAgents(budget, requests) {
  if (!budget) return requests.map(() => null);
  return transaction(budget, ledger => {
    const deny = reason => { event(ledger, { kind: 'denied', runKey: budget.runKey, reason }); return { error: reason }; };
    if (!Array.isArray(requests) || !requests.length) return deny('empty agent reservation');
    for (const r of requests) if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(r.callId || '') || !['codex', 'claude-code'].includes(r.host) || r.depth !== 1) return deny('invalid agent identity or delegation depth');
    const seen = new Set();
    for (const r of requests) { if (seen.has(r.callId)) return deny('duplicate call identity'); seen.add(r.callId); }
    const present = requests.map(r => Object.values(ledger.leases).find(l => l.runKey === budget.runKey && l.callId === r.callId));
    if (present.some(Boolean)) {
      if (present.every((lease, i) => lease && lease.host === requests[i].host && lease.role === (requests[i].role || 'worker') && lease.depth === requests[i].depth)) return present;
      return deny('partial/conflicting reservation replay');
    }
    if (requests.some(r => ledger.retired[sha(`${budget.runKey}\0${r.callId}`)])) return deny('completed/reconciled call identity cannot be reused');
    if (Object.keys(ledger.leases).length + requests.length > ledger.limits.maxConcurrent) return deny('global agent concurrency exhausted');
    if ((ledger.calls[budget.runKey] || 0) + requests.length > ledger.limits.maxCallsPerRun) return deny('shared run agent-call budget exhausted');
    const leases = requests.map(r => {
      const lease = { token: randomUUID(), fence: ++ledger.nextFence, runKey: budget.runKey, callId: r.callId, host: r.host, role: r.role || 'worker', depth: r.depth, acquiredAt: new Date().toISOString(), ownerPid: Object.hasOwn(r, 'ownerPid') ? r.ownerPid : process.pid };
      ledger.leases[lease.token] = lease;
      event(ledger, { kind: 'admitted', ...lease }); return lease;
    });
    ledger.calls[budget.runKey] = (ledger.calls[budget.runKey] || 0) + leases.length;
    return leases;
  });
}

export function requireAgents(budget, requests) {
  const result = reserveAgents(budget, requests);
  if (result.error) throw Error(result.error);
  return result;
}

export function releaseAgent(budget, lease) {
  if (!budget || !lease) return;
  return transaction(budget, ledger => {
    const current = ledger.leases[lease.token];
    if (!current || current.fence !== lease.fence || current.runKey !== budget.runKey) throw Error('stale or foreign agent lease');
    ledger.retired[sha(`${current.runKey}\0${current.callId}`)] = current.fence;
    delete ledger.leases[lease.token]; event(ledger, { kind: 'released', token: lease.token, fence: lease.fence, runKey: lease.runKey });
  });
}

/** Explicit reconciliation is not automatic expiry; caller must confirm work stopped. */
export function reconcileAgent(budget, { token, fence, confirmedStopped = false }) {
  if (!confirmedStopped) throw Error('operator confirmation that execution stopped is required');
  return releaseAgent(budget, { token, fence });
}

export function reconcileBudgetLock(budget, { token, confirmedStopped = false }) {
  if (!confirmedStopped) throw Error('operator confirmation required for crashed lock recovery');
  const lock = join(budget.store, 'lock');
  const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
  if (owner.token !== token || !Number.isInteger(owner.pid)) throw Error('lock recovery identity mismatch');
  try { process.kill(owner.pid, 0); throw Error('lock owner still alive; recovery refused'); }
  catch (e) { if (e.code !== 'ESRCH') throw e; }
  const recovery = join(budget.store, 'recovery'); mkdirSync(recovery, { mode: 0o700 });
  try {
    if (JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')).token !== token) throw Error('lock owner changed');
    unlinkSync(join(lock, 'owner.json')); rmdirSync(lock);
  } finally { rmdirSync(recovery); }
}

export function budgetSnapshot(budget) {
  return transaction(budget, ledger => ({ active: Object.values(ledger.leases), calls: ledger.calls[budget.runKey] || 0, limits: ledger.limits, events: ledger.events.slice(-50) }));
}

export async function withAgentBudget(state, { callId, host, role }, run) {
  const budget = state.executionBudget;
  const [lease] = requireAgents(budget, [{ callId, host, role, depth: 1 }]);
  try { return await run(); } finally { releaseAgent(budget, lease); }
}
