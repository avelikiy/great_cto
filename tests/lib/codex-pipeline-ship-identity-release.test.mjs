import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {runStage} from '../../scripts/lib/codex-pipeline.mjs';
import {beginWork, finishWork, controlledDecisions} from '../../scripts/lib/work-tasks.mjs';
import {createShipControllerBoundary} from '../../scripts/lib/gate-check-bound.mjs';
import {stableDigest} from '../../scripts/lib/ship-evidence-identity.mjs';
import {canonical} from '../fixtures/ship-evidence-identity/synthetic.mjs';
import {releaseRun} from '../fixtures/ship-evidence-identity/stage2-release/release-run.mjs';
import {readers} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {invoke, stored, runFile, scenario, readJSON, writeJSON, calls, leaseOwnerPath, sha} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

const effects = f => ({releaseFiles: readdirSync(f.releaseRoot), calls: calls(f).length,
  generations: readdirSync(join(f.store, 'runs', f.state.id, 'generations')).sort()});
function operation(f) {
  const decision = controlledDecisions(f.state)[0]; assert.equal(decision.kind, 'release');
  const work = beginWork({root: f.root, host: 'codex', kind: 'approve', taskId: f.state.taskId, data: {decisionId: decision.decisionId}}, {store: f.tasks});
  f.cleanupFns.push(() => {finishWork(work.task.taskId, work.operation.operationId, 0, {store: f.tasks, root: f.root}); work.lease.release();});
  return {work, decision};
}
function approveCLI(f, command, op = null) {
  const common = ['--ship-revision', String(f.state.shipEvidence.revision)];
  return command === 'approve-task'
    ? invoke(f, [command, f.state.id, '--operation', op.work.operation.operationId, '--decision', op.decision.decisionId, ...common], {GREAT_CTO_WORK_LEASE: op.work.lease.token})
    : invoke(f, [command, f.state.id, '--token', f.state.release.token, ...common]);
}

for (const command of ['approve-release', 'approve-task']) test(`P06 release ${command} approves genuine four-role local candidate without publication effects`, async t => {
  const f = await releaseRun(t); assert.equal(f.state.release.adapter, 'local'); const n = f.state.shipEvidence.revision; f.release();
  const op = command === 'approve-task' ? operation(f) : null; const before = effects(f);
  const out = approveCLI(f, command, op); assert.equal(out.status, 0, out.stderr);
  const saved = stored(f, f.state.id); assert.equal(saved.shipEvidence.revision, n + 1); assert.equal(saved.release.status, 'approved'); assert.ok(saved.release.approvedAt);
  assert.equal(saved.status, 'ready'); assert.equal(saved.results.devops, undefined); assert.equal(saved.release.path, undefined);
  assert.deepEqual(readdirSync(f.releaseRoot), before.releaseFiles); assert.equal(calls(f).length, before.calls);
});

for (const command of ['approve-release', 'approve-task']) for (const loss of ['source', 'global-floor', 'strict-context']) test(`N13 release ${command} refuses ${loss} with unchanged approval bytes and effects`, async t => {
  const f = await releaseRun(t);
  if (loss === 'strict-context') {f.boundary.invalidate(f.state, {reason: 'synthetic-context-revocation'}); f.boundary.save(f.state);}
  if (loss === 'source') writeFileSync(join(f.root, 'src/app.mjs'), 'uncommitted release source moved');
  if (loss === 'global-floor') scenario(f, {tasks: [{id: 'unrelated:global-release-blocker', status: 'open', labels: ['state:blocked']}]});
  f.release(); const op = command === 'approve-task' ? operation(f) : null;
  const bytes = readFileSync(runFile(f, f.state.id)); const before = effects(f);
  const out = approveCLI(f, command, op); assert.equal(out.status, 2, `${command} unexpectedly approved ${loss}`);
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), bytes); assert.deepEqual(effects(f), before);
  assert.equal(stored(f, f.state.id).release.status, 'awaiting-approval'); assert.equal(stored(f, f.state.id).release.approvedAt, undefined);
});

test('N15 release approve-task transferred parent lease refuses before release approval or generation write', async t => {
  const f = await releaseRun(t); f.release(); const op = operation(f); const path = leaseOwnerPath(f), owner = readFileSync(path);
  f.cleanupFns.unshift(() => writeFileSync(path, owner)); writeJSON(path, {...JSON.parse(owner), token: JSON.parse(owner).token + ':synthetic-transfer'});
  const bytes = readFileSync(runFile(f, f.state.id)), before = effects(f);
  const out = approveCLI(f, 'approve-task', op); assert.equal(out.status, 2); assert.deepEqual(readFileSync(runFile(f, f.state.id)), bytes); assert.deepEqual(effects(f), before);
  writeFileSync(path, owner);
});

for (const loss of ['source', 'global-floor', 'strict-context', 'lease']) test(`N15 actual devops prepare boundary refuses ${loss} before creating release candidate`, async t => {
  const f = await releaseRun(t, {prepare: false}); assert.equal(f.state.release, undefined); assert.equal(f.state.queue[0], 'devops');
  if (loss === 'strict-context') {f.boundary.invalidate(f.state, {reason: 'synthetic-before-devops-revocation'}); f.boundary.save(f.state);}
  if (loss === 'source') writeFileSync(join(f.root, 'src/app.mjs'), 'uncommitted source before devops');
  if (loss === 'global-floor') scenario(f, {tasks: [{id: 'unrelated:devops-blocker', status: 'blocked', labels: []}]});
  if (loss === 'lease') {const path = leaseOwnerPath(f), owner = readFileSync(path); f.cleanupFns.unshift(() => writeFileSync(path, owner)); writeJSON(path, {...JSON.parse(owner), token: JSON.parse(owner).token + ':synthetic-transfer'});}
  const bytes = readFileSync(runFile(f, f.state.id)), before = effects(f);
  try {await runStage(f.state, {shipBoundary: f.boundary, save: value => f.boundary.save(value), contextStore: f.runs});} catch { /* strict guard refusal */ }
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), bytes); assert.deepEqual(effects(f), before);
  assert.equal(stored(f, f.state.id).release, undefined); assert.equal(stored(f, f.state.id).results.devops, undefined);
});

test('N15 exact MAX_SAFE_INTEGER counter seed refuses before generation write or dispatch', async t => {
  const f = await releaseRun(t); const original = stored(f, f.state.id);
  const data = readJSON(join(f.store, 'runs', f.state.id, 'generations', `${original.shipEvidence.revision}.json`));
  const seededGeneration = {...data, revision: Number.MAX_SAFE_INTEGER};
  const bytes = canonical(seededGeneration), digest = sha(bytes);
  const seeded = structuredClone(original); seeded.shipEvidence.revision = Number.MAX_SAFE_INTEGER; seeded.shipEvidence.generationDigest = digest;
  // Only the scalar generation counter changes; actual record/envelope bytes and all authority evidence remain genuine.
  assert.deepEqual(seededGeneration.records, data.records); assert.deepEqual(seededGeneration.completionDigests, data.completionDigests);
  const path = join(f.store, 'runs', f.state.id, 'generations', `${Number.MAX_SAFE_INTEGER}.json`);
  writeFileSync(path, bytes, {mode: 0o600, flag: 'wx'}); writeJSON(runFile(f, f.state.id), seeded);
  writeJSON(join(f.store, 'runs', f.state.id, 'current.json'), {version: 'ship-store-pointer/v1', generation: Number.MAX_SAFE_INTEGER, digest});
  let generationWrites = 0;
  const strict = createShipControllerBoundary({root: f.root, store: f.store, lease: f.lease,
    readPersistedState: id => {assert.equal(id, f.state.id); return stored(f, id);},
    writeGeneration: () => {generationWrites++; throw new Error('overflow reached generation writer');},
  }, {runStore: f.runs, ...readers(f)});
  const before = readFileSync(runFile(f, f.state.id)), callCount = calls(f).length;
  assert.throws(() => strict.save(seeded), {code: 'SHIP_INVALID_REVISION'});
  assert.equal(generationWrites, 0); assert.equal(calls(f).length, callCount); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before);
  assert.equal(Number.isSafeInteger(Number.MAX_SAFE_INTEGER), true);
  // previousGenerationDigest intentionally remains the genuine prior snapshot, not an invented MAX-length history.
});
