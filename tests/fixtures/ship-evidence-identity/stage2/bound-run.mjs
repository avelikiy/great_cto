import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync, mkdirSync, rmdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {newRun, runStage, runParallelWave} from '../../../../scripts/lib/codex-pipeline.mjs';
import {beginWork, finishWork, linkWork} from '../../../../scripts/lib/work-tasks.mjs';
import {initializeShipBinding, reassessShipBinding, createShipControllerBoundary, evaluateBoundGate} from '../../../../scripts/lib/gate-check-bound.mjs';
import {stableDigest} from '../../../../scripts/lib/ship-evidence-identity.mjs';
import {fixture, isolated, readJSON, runFile, writeJSON, stored, scenario, calls, sha} from './harness.mjs';
export function readers(f) {
  return {
    readTasks: () => {const data = readJSON(f.scenarioPath); return {state: data.taskReadError ? 'UNKNOWN' : 'COMPLETE', tasks: data.tasks || [], snapshotDigest: data.taskReadError ? null : stableDigest(data.tasks || []), diagnostics: data.taskReadError ? [{code: 'TASK_READ_UNKNOWN', subject: 'synthetic-tasks'}] : []};},
    readJournals: () => {const data = readJSON(f.scenarioPath); return {state: data.journalReadError ? 'UNKNOWN' : 'COMPLETE', journals: data.journals || [], snapshotDigest: data.journalReadError ? null : stableDigest(data.journals || []), diagnostics: data.journalReadError ? [{code: 'JOURNAL_READ_UNKNOWN', subject: 'synthetic-journals'}] : []};},
  };
}
export function createRun(t, options = {}) {
  const f = fixture(t, options); isolated(f, t);
  const work = beginWork({root: f.root, host: 'codex', goal: 'Synthetic bound source review', authority: {mode: 'explicit-paths', writeScope: ['src', 'docs']}, maxAttempts: 3}, {store: f.tasks});
  f.lease = work.lease; let held = true;
  f.release = () => {if (held) {if (f.lockPath && existsSync(f.lockPath)) rmdirSync(f.lockPath); finishWork(work.task.taskId, work.operation.operationId, 0, {store: f.tasks, root: f.root}); f.lease.release(); held = false;}};
  f.cleanupFns.push(f.release);
  const checkPolicy = options.checks ? {backend: 'local', trusted: true, inputs: ['src/app.mjs'], timeoutMs: 10000, commands: [[process.execPath, '-e', 'const fs=require("node:fs"); if(!fs.readFileSync("src/app.mjs","utf8").includes("42")) process.exit(1)']]} : null;
  const state = newRun({root: f.root, pluginRoot: f.pluginRoot, prompt: work.task.goal, allowed: ['src', 'docs'], entry: 'qa-engineer', maxAttempts: 3,
    checkPolicy, hostRoutes: options.hostRoutes || {}});
  state.taskId = work.task.taskId;
  linkWork(state.taskId, 'runs', state.id, {store: f.tasks, root: f.root, host: 'codex'});
  f.lockPath = join(f.runs, `${state.id}.lock`); mkdirSync(f.lockPath, {mode: 0o700});
  const initialized = initializeShipBinding({state, policyPath: f.policyPath, lease: f.lease}, {runStore: f.runs, ...readers(f)});
  f.state = initialized.state; f.boundary = initialized.boundary;
  return f;
}
export function reassess(f) {
  const out = reassessShipBinding({state: f.state, expectedRevision: f.state.shipEvidence.revision, lease: f.lease}, {runStore: f.runs, ...readers(f)});
  f.state = out.state; f.boundary = out.boundary; return out;
}
export function boundary(f, overrides = {}) {
  return createShipControllerBoundary({root: f.root, store: f.store, lease: f.lease,
    readPersistedState: id => stored(f, id),
    writeGeneration: ({runId, generation, digest, bytes}) => {
      const path = join(f.store, 'runs', runId, 'generations', `${generation}.json`); mkdirSync(dirname(path), {recursive: true, mode: 0o700});
      if (existsSync(path)) {const actual = sha(readFileSync(path)); if (actual !== digest) {const e = new Error('synthetic immutable generation conflict'); e.code = 'SHIP_GENERATION_CONFLICT'; throw e;} return {created: false, digest: actual};}
      writeFileSync(path, bytes, {mode: 0o600, flag: 'wx'}); return {created: true, digest: sha(readFileSync(path))};
    }, ...overrides}, {runStore: f.runs, ...readers(f)});
}
export function gate(f) {return evaluateBoundGate({root: f.root, store: f.store, runId: f.state.id, expectedRevision: f.state.shipEvidence.revision}, {runStore: f.runs, ...readers(f)});}
export function generation(f) {return readJSON(join(f.store, 'runs', f.state.id, 'generations', `${f.state.shipEvidence.revision}.json`));}
export async function reviewAll(f, {parallel = false, ...options} = {}) {
  if (parallel) await runParallelWave(f.state, {shipBoundary: f.boundary, save: s => f.boundary.save(s), contextStore: f.runs, ...options});
  else {
    for (let i = 0; i < 4 && f.state.status === 'ready'; i++) await runStage(f.state, {shipBoundary: f.boundary, save: s => f.boundary.save(s), contextStore: f.runs, ...options});
  }
  return f.state;
}
