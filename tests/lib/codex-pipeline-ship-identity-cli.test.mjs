import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {acquireProjectLease, beginWork, finishWork, controlledDecisions} from '../../scripts/lib/work-tasks.mjs';
import {reassessShipBinding} from '../../scripts/lib/gate-check-bound.mjs';
import {createRun, reassess, reviewAll, generation, gate} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {fixture, isolated, invoke, invokeBound, stored, runFile, readJSON, writeJSON, calls, scenario, leaseOwnerPath, HERE, REPO, CLI} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

async function race(f, args, t) {
  const children = [0, 1].map(() => fork(join(HERE, 'cli-barrier.mjs'), [], {cwd: f.root, env: {...f.env, SHIP_FIXTURE_CONTROLLER: CLI}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']}));
  f.cleanupFns.unshift(() => {for (const child of children) if (child.exitCode === null && !child.killed) child.kill();});
  const outputs = children.map(child => {const row = {stdout: '', stderr: ''}; child.stdout.on('data', bytes => {row.stdout += bytes;}); child.stderr.on('data', bytes => {row.stderr += bytes;}); return row;});
  const exits = children.map((child, i) => once(child, 'exit').then(([status]) => ({...outputs[i], status})));
  await Promise.all(children.map(child => once(child, 'message').then(([message]) => assert.equal(message.ready, true))));
  for (const child of children) child.send({action: 'go', args});
  return Promise.all(exits);
}
test('P07 real shipped CLI start remains provisional/NEEDS_REASSESSMENT and dispatches zero mandatory workers', t => {
  const f = fixture(t); const out = invoke(f, ['start', '--dir', f.root, '--prompt', 'Offline strict fixture', '--allow', 'src,docs', '--entry', 'qa-engineer', '--ship-evidence-policy', f.policyPath]);
  assert.equal(out.status, 2); assert.equal(calls(f).length, 0);
  const files = readdirSync(f.runs).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)); assert.equal(files.length, 1);
  const state = readJSON(join(f.runs, files[0])); assert.equal(state.version, 1); assert.equal(state.shipEvidence.phase, 'NEEDS_REASSESSMENT'); assert.equal(generation({...f, state}).records.length, 0);
});
test('P07 real reassess CLI increments once, status stays read-only and no silent source auto-rebind', t => {
  const f = createRun(t); const n = f.state.shipEvidence.revision; f.release();
  const out = invoke(f, ['reassess-ship', f.state.id, '--ship-revision', String(n)]); assert.equal(out.status, 0, out.stderr);
  const current = stored(f, f.state.id); assert.equal(current.shipEvidence.revision, n + 1); assert.ok(current.shipEvidence.contextDigest);
  const before = readFileSync(runFile(f, f.state.id)); const status = invoke(f, ['status', f.state.id]); assert.equal(status.status, 0); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before);
  writeFileSync(join(f.root, 'docs/qa-engineer.md'), 'new uncommitted evidence');
  const resume = invoke(f, ['resume', f.state.id, '--ship-revision', String(current.shipEvidence.revision)]); assert.equal(resume.status, 2); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before); assert.equal(calls(f).length, 0);
});
test('N14 two actual CLI writers same pinned revision produce exactly one approval and one increment', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const token = f.state.pending.token, n = f.state.shipEvidence.revision; f.release();
  const rows = await race(f, ['approve', f.state.id, '--token', token, '--ship-revision', String(n)], t);
  assert.equal(rows.filter(row => row.status === 0).length, 1, JSON.stringify(rows)); assert.equal(rows.filter(row => row.status === 2).length, 1);
  const saved = stored(f, f.state.id); assert.equal(saved.shipEvidence.revision, n + 1); assert.equal(saved.approvals.filter(a => a.gate === 'gate:ship').length, 1);
  assert.equal(saved.released.filter(r => r === 'security-officer').length, 1);
});
test('N13/N15 missing stale duplicate malformed revision and unauthorized trust flags preserve run bytes', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const n = f.state.shipEvidence.revision; const token = f.state.pending.token; f.release(); const before = readFileSync(runFile(f, f.state.id));
  for (const flags of [[], ['--ship-revision', String(n - 1)], ['--ship-revision', '0'], ['--ship-revision', '1.5'], ['--ship-revision', 'NaN'], ['--ship-revision', String(n), '--ship-revision', String(n)], ['--ship-revision', String(n), '--trusted'], ['--ship-revision', String(n), '--expected', '{}'], ['--ship-revision', String(n), '--ship-evidence-policy', f.policyPath]]) {
    const out = invoke(f, ['approve', f.state.id, '--token', token, ...flags]); assert.equal(out.status, 2, JSON.stringify(flags)); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before);
  }
});
test('N15 legacy schema1 without binding cannot reassess/upgrade or report strict PASS', t => {
  const f = createRun(t); const state = stored(f, f.state.id); delete state.shipEvidence; writeJSON(runFile(f, state.id), state); f.release(); const before = readFileSync(runFile(f, state.id));
  const out = invoke(f, ['reassess-ship', state.id, '--ship-revision', '1']); assert.equal(out.status, 2); assert.deepEqual(readFileSync(runFile(f, state.id)), before);
  assert.equal(invokeBound(f, state.id, 1).status, 2);
});
test('N15 corrupt and overflow revisions refuse before mutation/effects and never consume a generation', t => {
  for (const revision of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    const f = createRun(t); const state = stored(f, f.state.id); state.shipEvidence.revision = revision; writeJSON(runFile(f, state.id), state); f.release();
    const before = readFileSync(runFile(f, state.id)); const generations = readdirSync(join(f.store, 'runs', state.id, 'generations'));
    const out = invoke(f, ['cancel', state.id, '--ship-revision', String(revision)]); assert.equal(out.status, 2); assert.deepEqual(readFileSync(runFile(f, state.id)), before);
    assert.deepEqual(readdirSync(join(f.store, 'runs', state.id, 'generations')), generations); assert.equal(calls(f).length, 0);
  }
});
test('P07/N15 real direct and parent-handoff lease assertions detect transferred token/pid/project', async t => {
  const f = fixture(t); isolated(f, t); const lease = acquireProjectLease(f.root, {store: f.tasks}); const path = leaseOwnerPath(f); const original = readFileSync(path);
  f.cleanupFns.push(() => {writeFileSync(path, original); lease.release();}); assert.doesNotThrow(() => lease.assertOwned());
  for (const delta of [{token: 'transferred'}, {pid: process.pid + 1}, {projectId: 'other-project'}]) {writeJSON(path, {...JSON.parse(original), ...delta}); assert.throws(() => lease.assertOwned()); writeFileSync(path, original);}
  const child = fork(join(HERE, 'lease-child.mjs'), [], {env: {...f.env, GREAT_CTO_WORK_LEASE: lease.token, SHIP_FIXTURE_ROOT: f.root, SHIP_FIXTURE_LEASE_MODULE: join(REPO, 'scripts/lib/work-tasks.mjs')}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  f.cleanupFns.unshift(() => {if (child.exitCode === null && !child.killed) child.kill();}); const [ready] = await once(child, 'message'); assert.equal(ready.ready, true, ready.error);
  child.send('check'); const [owned] = await once(child, 'message'); assert.equal(owned.owned, true);
  writeJSON(path, {...JSON.parse(original), token: 'transferred-parent'}); child.send('check'); const [lost] = await once(child, 'message'); assert.equal(lost.owned, false); writeFileSync(path, original);
  const exit = once(child, 'exit'); child.send('release'); await once(child, 'message'); await exit;
  assert.equal(existsSync(path), true, 'child handoff release cannot delete parent lease');
});
test('P06/N15 actual approve-task parent handoff uses same pinned generation and strict approval floor', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const n = f.state.shipEvidence.revision; f.release();
  const decision = controlledDecisions(f.state)[0]; const work = beginWork({root: f.root, host: 'codex', kind: 'approve', taskId: f.state.taskId, data: {decisionId: decision.decisionId}}, {store: f.tasks});
  f.cleanupFns.push(() => {finishWork(work.task.taskId, work.operation.operationId, 0, {store: f.tasks, root: f.root}); work.lease.release();});
  const out = invoke(f, ['approve-task', f.state.id, '--operation', work.operation.operationId, '--decision', decision.decisionId, '--ship-revision', String(n)], {GREAT_CTO_WORK_LEASE: work.lease.token});
  assert.equal(out.status, 0, out.stderr); const saved = stored(f, f.state.id); assert.equal(saved.shipEvidence.revision, n + 1); assert.equal(saved.approvals.filter(a => a.gate === 'gate:ship').length, 1);
});
test('N13 approve-task stale source cannot save approval, transition or generation', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const n = f.state.shipEvidence.revision; f.release(); const decision = controlledDecisions(f.state)[0];
  const work = beginWork({root: f.root, host: 'codex', kind: 'approve', taskId: f.state.taskId, data: {decisionId: decision.decisionId}}, {store: f.tasks});
  f.cleanupFns.push(() => {finishWork(work.task.taskId, work.operation.operationId, 0, {store: f.tasks, root: f.root}); work.lease.release();});
  writeFileSync(join(f.root, 'src/app.mjs'), 'uncommitted source changed'); const before = readFileSync(runFile(f, f.state.id));
  const out = invoke(f, ['approve-task', f.state.id, '--operation', work.operation.operationId, '--decision', decision.decisionId, '--ship-revision', String(n)], {GREAT_CTO_WORK_LEASE: work.lease.token});
  assert.equal(out.status, 2); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before);
});
test('N15 actual CLI observer failure after rename reports committed unknown and cannot duplicate approval', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const n = f.state.shipEvidence.revision, token = f.state.pending.token; f.release();
  const out = invoke(f, ['approve', f.state.id, '--token', token, '--ship-revision', String(n)], {
    NODE_OPTIONS: `${f.env.NODE_OPTIONS} --import=${join(HERE, 'observer-fault.mjs')}`,
    SHIP_FIXTURE_FAULT_RUN_FILE: runFile(f, f.state.id), SHIP_FIXTURE_FAULT_TASK_FILE: join(f.tasks, `${f.state.taskId}.json`),
  });
  assert.equal(out.status, 2); assert.match(out.stderr + out.stdout, /SHIP_COMMITTED_OBSERVATION_UNKNOWN/); assert.ok((out.stderr + out.stdout).includes(String(n + 1)));
  const saved = stored(f, f.state.id); assert.equal(saved.shipEvidence.revision, n + 1); assert.equal(saved.approvals.filter(a => a.gate === 'gate:ship').length, 1);
  const before = readFileSync(runFile(f, f.state.id)); const retry = invoke(f, ['approve', f.state.id, '--token', token, '--ship-revision', String(n)]); assert.equal(retry.status, 2); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before);
});
