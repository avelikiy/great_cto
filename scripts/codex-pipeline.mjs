#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newRun, runStage, runParallelWave, parallelPair, approve, reject, recover, cancel } from './lib/codex-pipeline.mjs';
import { approveRelease } from './lib/codex-release.mjs';
import { codexRunStore, listCodexRuns, codexHostDoctor } from './lib/codex-host-state.mjs';
import { beginWork, finishWork, acquireProjectLease, readWorkTask, linkWork, observeWorkRun, controlledDecisions } from './lib/work-tasks.mjs';
import { detectClaude } from './lib/claude-exec.mjs';
import { dispatchEvidenceSummary } from './lib/controller-dispatch-evidence.mjs';
import { projectExecutionTrace } from './lib/execution-trace.mjs';
import { readBenchmarkRegistration, bindBenchmarkTrial } from './lib/adaptive-benchmark-collector.mjs';
import { readDomainPolicy } from './lib/domain-admission.mjs';
import { initializeShipBinding, reassessShipBinding, createShipControllerBoundary } from './lib/gate-check-bound.mjs';

// State is outside the worker workspace. A per-run exclusive lock covers the entire subprocess lifetime.
const args = process.argv.slice(2);
const command = args.shift();
if (args.some(arg => arg.startsWith('--domain-policy='))) {
  console.error('--domain-policy requires a separate private file argument'); process.exit(2);
}
if (args.some(arg => arg.startsWith('--ship-evidence-policy='))) {
  console.error('--ship-evidence-policy requires a separate private file argument'); process.exit(2);
}
if (command !== 'start' && args.includes('--domain-policy')) {
  console.error('domain policy is frozen at start; do not override it'); process.exit(2);
}
const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const routes = raw => {
  if (raw == null) return {};
  if (!raw || raw.startsWith('--')) throw Error('--routes requires role=codex|claude-code pairs');
  const out = Object.create(null);
  for (const part of raw.split(',')) {
    const [role, host, extra] = part.split('=');
    if (!role || !host || extra || out[role]) throw Error('routes must be unique role=codex|claude-code pairs');
    out[role] = host;
  }
  return out;
};
const inheritedLease = process.env.GREAT_CTO_WORK_LEASE;
delete process.env.GREAT_CTO_WORK_LEASE;
const store = codexRunStore();
mkdirSync(store, { recursive: true, mode: 0o700 });
let shipBoundary = null;
const save = state => {
  if (state.shipEvidence) {
    const committed = shipBoundary.save(state);
    try { observeWorkRun(state); }
    catch { throw Object.assign(Error(`SHIP_COMMITTED_OBSERVATION_UNKNOWN persistedRevision=${committed.revision}`), {code: 'SHIP_COMMITTED_OBSERVATION_UNKNOWN', persistedRevision: committed.revision}); }
    return committed;
  }
  const file = join(store, `${state.id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
  observeWorkRun(state);
};
let locked = null, projectLease = null, work = null, taskForFinish = null;
try {
  if (command === 'doctor') {
    const result = codexHostDoctor({ pluginRoot: resolve(value('--plugin-root') || join(dirname(fileURLToPath(import.meta.url)), '..')), store });
    console.log(JSON.stringify(result, null, 2)); process.exit(result.state === 'ready' ? 0 : 2);
  }
  if (command === 'list') {
    const output = JSON.stringify(listCodexRuns({ root: value('--dir') ? realpathSync(resolve(value('--dir'))) : null, store }), null, 2) + '\n';
    // Piped stdout is asynchronous: exiting before the callback can truncate JSON.
    await new Promise((resolve, reject) => {
      process.stdout.write(output, error => error ? reject(error) : resolve());
    });
    process.exit(0);
  }
  let state;
  if (command === 'start') {
    if (args.includes('--ship-evidence-policy')) {
      const permitted = new Set(['--ship-evidence-policy', '--dir', '--task-id', '--allow', '--intent', '--max-attempts', '--prompt', '--routes', '--checks-policy', '--release-policy', '--gate-policy', '--specialist-policy', '--domain-policy', '--entry', '--benchmark-trial']);
      for (let i = 0; i < args.length; i += 2) if (!permitted.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args.filter(a => a === args[i]).length !== 1) throw Error('SHIP_CAPABILITY_INVALID');
    }
    const root = realpathSync(resolve(value('--dir') || '.'));
    const taskId = value('--task-id');
    const allowed = (value('--allow') || '').split(',').map(p => p.trim()).filter(Boolean);
    let acceptance = [], intent = value('--intent') || 'delivery', maxAttempts = value('--max-attempts') === null ? 3 : Number(value('--max-attempts'));
    if (taskId) {
      projectLease = acquireProjectLease(root, { reuseToken: inheritedLease });
      const task = readWorkTask(taskId, { root });
      acceptance = task.acceptance; intent = task.intent || 'delivery'; maxAttempts = task.budget?.maxStageAttempts || 3;
      if (task.host !== 'codex' || task.goal !== value('--prompt')?.trim()
        || JSON.stringify(task.authority?.writeScope) !== JSON.stringify(allowed)) throw Error('task authority does not match run request');
    } else {
      work = beginWork({ root, host: 'codex', goal: value('--prompt'), intent, maxAttempts, authority: { mode: 'explicit-paths', writeScope: allowed } });
      projectLease = work.lease; taskForFinish = work.task.taskId;
    }
    const listing = listCodexRuns({ root, store });
    if (listing.state === 'degraded' || listing.runs.some(r => !['done', 'cancelled'].includes(r.status))) throw Error('unfinished or unreadable project run exists; resume or inspect it first');
    if (args.includes('--routes') && value('--routes') == null) throw Error('--routes requires a value');
    const hostRoutes = routes(value('--routes'));
    if (Object.values(hostRoutes).includes('claude-code')) {
      const claude = detectClaude();
      if (claude.state !== 'available') throw Error(`Claude Code host unavailable: ${claude.why}`);
    }
    let checkPolicy = null;
    if (value('--checks-policy')) {
      const policyPath = realpathSync(value('--checks-policy'));
      const rel = relative(root, policyPath);
      if (rel !== '..' && !rel.startsWith(`..${sep}`)) throw Error('checks policy must be operator-owned outside the target workspace');
      checkPolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
    }
    let releasePolicy = null;
    if (value('--release-policy')) {
      const policyPath = realpathSync(value('--release-policy'));
      const rel = relative(root, policyPath);
      if (rel !== '..' && !rel.startsWith(`..${sep}`)) throw Error('release policy must be operator-owned outside the target workspace');
      releasePolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
    }
    let gatePolicy = null;
    if (args.includes('--gate-policy')) {
      if (!value('--gate-policy')) throw Error('--gate-policy requires an operator-owned policy file');
      const policyPath = realpathSync(value('--gate-policy'));
      const rel = relative(root, policyPath);
      if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`))) throw Error('gate policy must be operator-owned outside the target workspace');
      gatePolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
    }
    let specialistPolicy = null;
    if (args.includes('--specialist-policy')) {
      if (!value('--specialist-policy')) throw Error('--specialist-policy requires an operator-owned policy file');
      const policyPath = realpathSync(value('--specialist-policy'));
      const rel = relative(root, policyPath);
      if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`))) throw Error('specialist policy must be operator-owned outside the target workspace');
      specialistPolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
    }
    let domainPolicy = null;
    if (args.includes('--domain-policy')) {
      if (args.filter(a => a === '--domain-policy').length !== 1 || !value('--domain-policy') || value('--domain-policy').startsWith('--')) throw Error('--domain-policy requires one private operator-owned file');
      domainPolicy = readDomainPolicy(root, value('--domain-policy'));
    }
    state = newRun({ root, prompt: value('--prompt'), checkPolicy, releasePolicy, specialistPolicy, domainPolicy,
      allowed, intent, entry: intent === 'research' ? 'project-auditor' : value('--entry') || 'product-owner',
      maxAttempts, hostRoutes, gatePolicy });
    state.taskId = taskId || work.task.taskId;
    state.acceptance = acceptance;
    if (args.includes('--benchmark-trial')) {
      if (!value('--benchmark-trial')) throw Error('--benchmark-trial requires an operator-owned trial registration');
      bindBenchmarkTrial(state, readBenchmarkRegistration(root, value('--benchmark-trial')));
    }
    linkWork(state.taskId, 'runs', state.id, { root, host: 'codex' });
    if (args.includes('--ship-evidence-policy')) {
      if (args.filter(a => a === '--ship-evidence-policy').length !== 1 || !value('--ship-evidence-policy') || value('--ship-evidence-policy').startsWith('--') || args.includes('--ship-revision')) throw Error('SHIP_POLICY_INVALID');
      const lock = join(store, `${state.id}.lock`); mkdirSync(lock, {mode: 0o700}); locked = lock;
      const initialized = initializeShipBinding({state, policyPath: value('--ship-evidence-policy'), lease: projectLease}, {runStore: realpathSync(store)});
      state = initialized.state; shipBoundary = initialized.boundary;
      try { observeWorkRun(state); } catch { throw Object.assign(Error(`SHIP_COMMITTED_OBSERVATION_UNKNOWN persistedRevision=1`), {code: 'SHIP_COMMITTED_OBSERVATION_UNKNOWN', persistedRevision: 1}); }
    } else save(state);
  } else {
    if (args.includes('--domain-policy')) throw Error('domain policy is frozen at start; do not override during resume');
    const id = args[0];
    if (!/^[0-9a-f-]{36}$/.test(id || '')) throw Error('a run UUID is required');
    state = JSON.parse(readFileSync(join(store, `${id}.json`), 'utf8'));
    if (state.id !== id || state.version !== 1) throw Error('invalid run state');
    if (args.includes('--ship-evidence-policy')) throw Error('SHIP_POLICY_INVALID');
    if (state.shipEvidence && command !== 'status') {
      const permitted = new Set(['--ship-revision', '--dir', ...(command === 'approve-task' ? ['--operation', '--decision'] : []), ...(['approve', 'approve-release', 'reject'].includes(command) ? ['--token'] : []), ...(command === 'reject' ? ['--reason'] : [])]);
      for (let i = 1; i < args.length; i += 2) if (!permitted.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args.filter(a => a === args[i]).length !== 1) throw Error('SHIP_CAPABILITY_INVALID');
      const revision = value('--ship-revision');
      if (!/^[1-9][0-9]*$/.test(revision || '') || !Number.isSafeInteger(Number(revision)) || Number(revision) >= Number.MAX_SAFE_INTEGER) throw Error('SHIP_INVALID_REVISION');
      if (value('--dir') && realpathSync(value('--dir')) !== state.root) throw Error('SHIP_UNBOUND');
    }
    if (command !== 'status') {
      if (command === 'resume' && state.taskId && !inheritedLease) {
        work = beginWork({ root: state.root, host: 'codex', kind: 'resume', taskId: state.taskId });
        projectLease = work.lease; taskForFinish = work.task.taskId;
      } else projectLease = acquireProjectLease(state.root, { reuseToken: inheritedLease });
    }
  }
  if (!['start', 'resume', 'status', 'approve', 'reject', 'approve-release', 'recover', 'cancel', 'approve-task', 'reassess-ship'].includes(command)) throw Error('expected a supported controller command');
  if (command !== 'status') {
    const lock = join(store, `${state.id}.lock`);
    if (!locked) { mkdirSync(lock, {mode: 0o700}); locked = lock; }
    // Reload under lock so simultaneous approvals cannot overwrite one another.
    state = JSON.parse(readFileSync(join(store, `${state.id}.json`), 'utf8'));
    if (state.shipEvidence && command !== 'start') {
      if (Number(value('--ship-revision')) !== state.shipEvidence.revision) throw Error('SHIP_STALE_REVISION');
      shipBoundary = createShipControllerBoundary({root: state.root, store: dirname(state.shipEvidence.policyPath), lease: projectLease}, {runStore: realpathSync(store)});
    }
    if (command === 'reassess-ship') {
      const reassessed = reassessShipBinding({state, expectedRevision: Number(value('--ship-revision')), lease: projectLease}, {runStore: realpathSync(store)});
      state = reassessed.state; shipBoundary = reassessed.boundary;
      try { observeWorkRun(state); } catch { throw Object.assign(Error(`SHIP_COMMITTED_OBSERVATION_UNKNOWN persistedRevision=${state.shipEvidence.revision}`), {code: 'SHIP_COMMITTED_OBSERVATION_UNKNOWN', persistedRevision: state.shipEvidence.revision}); }
    } else {
    if (state.shipEvidence) {
      if (['recover', 'reject', 'cancel'].includes(command)) shipBoundary.invalidate(state, {reason: `operator-${command}`});
      else shipBoundary.assertCurrent(state, {effect: 'metadata'});
    }
    if (command === 'approve-task') {
      if (!inheritedLease || !state.taskId) throw Error('task approval requires operator operation ownership');
      const task = readWorkTask(state.taskId, { root: state.root });
      const operation = task.operations.find(o => o.operationId === value('--operation'));
      const decision = controlledDecisions(state)[0];
      if (!operation || operation.state !== 'running' || operation.kind !== 'approve' || operation.data?.decisionId !== value('--decision') || !decision || decision.decisionId !== value('--decision')) throw Error('task approval is stale or unbound');
      if (decision.kind === 'release') { if (state.shipEvidence) shipBoundary.assertCurrent(state, {effect: 'release'}); approveRelease(state, state.release.token); } else approve(state, state.pending.token, {shipBoundary});
      save(state);
    } else if (command === 'approve') { approve(state, value('--token'), {shipBoundary}); save(state); }
    else if (command === 'reject') { reject(state, value('--token'), value('--reason')); save(state); }
    else if (command === 'approve-release') { if (state.shipEvidence) shipBoundary.assertCurrent(state, {effect: 'release'}); approveRelease(state, value('--token')); save(state); }
    else if (command === 'recover') { recover(state); save(state); }
    else if (command === 'cancel') { cancel(state); save(state); }
    // ADR-026: each stage's context goes to <store>/<run-id>/context/, outside the
    // worker workspace like the state file itself.
    else while (state.status === 'ready') {
      if (state.wave || parallelPair(state)) await runParallelWave(state, { save, contextStore: store, shipBoundary });
      else await runStage(state, { save, contextStore: store, shipBoundary });
    }
    }
  }
  console.log(JSON.stringify({ id: state.id, status: state.status, reason: state.reason,
    controllerDispatch: dispatchEvidenceSummary(state),
    executionGraph: projectExecutionTrace(state),
    release: state.release ? { status: state.release.status, token: state.release.token, adapter: state.release.adapter,
      artifactDigest: state.release.artifactDigest, target: state.release.target, path: state.release.path, url: state.release.url,
      activation: state.release.activation, rollback: state.release.rollback } : null,
    pending: state.pending, queue: state.queue, specialistPreparation: state.specialistPreparation ? {
      roles: state.specialistPreparation.roles, status: state.specialistPreparation.status,
      fingerprint: state.specialistPreparation.fingerprint, reusablePass: false } : null,
    specialistReview: state.specialistReview ? {
      roles: state.specialistReview.roles, fingerprint: state.specialistReview.fingerprint, reusablePass: false } : null,
    hostRoutes: state.hostRoutes || {}, wave: state.wave ? {
      id: state.wave.id, roles: state.wave.roles, hosts: state.wave.hosts, status: state.wave.status } : null,
    rolesCompleted: Object.keys(state.results), stateFile: join(store, `${state.id}.json`) }, null, 2));
  process.exitCode = ['blocked', 'manual-action', 'join-wait'].includes(state.status) ? 2 : 0;
} catch (error) {
  console.error(`codex-pipeline: ${error.code || error.message}${error.persistedRevision ? ` persistedRevision=${error.persistedRevision}` : ''}`);
  process.exitCode = 2;
} finally {
  try {
    try { if (locked) rmdirSync(locked);
      if (taskForFinish) finishWork(taskForFinish, work.operation.operationId, process.exitCode || 0); }
    finally { projectLease?.release(); }
  } catch (error) { console.error(`codex-pipeline: cleanup failed ${error.code || 'UNKNOWN'}`); process.exitCode = 2; }
}
