import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { beginWork, finishWork, listWorkTasks, linkWork, readWorkTask, observeWorkRun, observeWorkSession, publicWorkTask, acquireProjectLease } from '../../scripts/lib/work-tasks.mjs';
const base = mkdtempSync(join(tmpdir(), 'gcto-task-contract-'));
let n = 0;
const fixture = () => { const d = join(base, String(++n)); mkdirSync(d); const root = join(d, 'project'); mkdirSync(root); return { root, store: join(d, 'store') }; };
after(() => rmSync(base, { recursive: true, force: true }));
const start = (f, more = {}) => beginWork({ root: f.root, host: 'claude-code', goal: 'Export CSV', acceptance: ['Only authorized rows'], authority: { mode: 'native-interactive', writeScope: null }, ...more }, f);

test('task metadata is private, canonical and explicit; host exit is not acceptance', () => {
  const f = fixture(), w = start(f);
  assert.equal(statSync(f.store).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.store, w.task.taskId + '.json')).mode & 0o777, 0o600);
  const session = randomUUID(); linkWork(w.task.taskId, 'sessions', session, { ...f, host: 'claude-code' });
  finishWork(w.task.taskId, w.operation.operationId, 0, f); w.lease.release();
  const t = readWorkTask(w.task.taskId, f);
  assert.equal(t.phase, 'unknown'); assert.deepEqual(t.acceptance, ['Only authorized rows']);
  assert.deepEqual(t.links.sessions, [session]); assert.equal(t.operations[0].state, 'host_returned');
  const pub = JSON.stringify(publicWorkTask(t)); assert.equal(pub.includes(f.root), false); assert.equal(pub.includes('requestDigest'), false);
});
test('same operation replays without dispatch permission; conflicts and stale revisions fail closed', () => {
  const f = fixture(), op = randomUUID(), w = start(f, { operationId: op });
  const replay = start(f, { operationId: op }); assert.equal(replay.replay, true); assert.equal(replay.lease, null);
  assert.throws(() => start(f, { operationId: op, goal: 'Another request' }), /conflicts/);
  finishWork(w.task.taskId, op, 0, f); w.lease.release();
  assert.equal(start(f, { operationId: op }).operation.exitCode, 0);
  assert.throws(() => beginWork({ root: f.root, host: 'claude-code', kind: 'resume', taskId: w.task.taskId, expectedRevision: 1 }, f), /stale/);
  const lease = acquireProjectLease(f.root, f); lease.release(); // stale failure released ownership
});
test('project lease excludes both hosts, does not expire by inference and rejects forged handoff', () => {
  const f = fixture(), w = start(f);
  assert.throws(() => beginWork({ root: f.root, host: 'codex', goal: 'Other work' }, f), /already owned/);
  assert.throws(() => acquireProjectLease(f.root, { ...f, reuseToken: randomUUID() }), /invalid project lease/);
  w.lease.release(); const other = acquireProjectLease(f.root, f); other.release();
});
test('session observations require exact pre-bound identity; Stop never means completed', () => {
  const f = fixture(), w = start(f), session = randomUUID();
  linkWork(w.task.taskId, 'sessions', session, { ...f, host: 'claude-code' });
  assert.equal(observeWorkSession({ cwd: f.root, session_id: randomUUID(), hook_event_name: 'UserPromptSubmit' }, f), null);
  observeWorkSession({ cwd: f.root, session_id: session, hook_event_name: 'UserPromptSubmit' }, f);
  assert.equal(readWorkTask(w.task.taskId, f).phase, 'working');
  for (let i = 0; i < 2; i++) observeWorkSession({ cwd: f.root, session_id: session, hook_event_name: 'Notification', message: 'Permission needed' }, f);
  let t = readWorkTask(w.task.taskId, f); assert.equal(t.metrics.interruptions.native_permission_or_input, 1);
  assert.ok(t.metrics.timeToObservedStartMs >= 0);
  observeWorkSession({ cwd: f.root, session_id: session, hook_event_name: 'Stop' }, f);
  assert.equal(readWorkTask(w.task.taskId, f).phase, 'waiting'); w.lease.release();
});
test('controlled observations preserve pending authority, evidence and unknown acceptance', () => {
  const f = fixture(), w = start(f, { host: 'codex', authority: { mode: 'explicit-paths', writeScope: ['src'] } }), id = randomUUID();
  linkWork(w.task.taskId, 'runs', id, { ...f, host: 'codex' });
  const state = { root: f.root, taskId: w.task.taskId, id, status: 'awaiting-gate', results: { qa: { verdict: 'APPROVED' } }, attempts: [] };
  observeWorkRun(state, f); assert.equal(readWorkTask(w.task.taskId, f).phase, 'needs_decision');
  state.status = 'done'; observeWorkRun(state, f);
  const t = readWorkTask(w.task.taskId, f); assert.equal(t.phase, 'waiting'); assert.match(t.reason, /acceptance/);
  assert.equal(t.evidence[0].verdict, 'APPROVED'); w.lease.release();
});
test('wrong project, corrupt records and workspace-owned stores cannot authorize work', () => {
  const f = fixture(), other = fixture(), w = start(f); w.lease.release();
  assert.throws(() => readWorkTask(w.task.taskId, { store: f.store, root: other.root }), /this project/);
  writeFileSync(join(f.store, randomUUID() + '.json'), '{}');
  assert.equal(listWorkTasks(f.root, f).state, 'degraded'); assert.throws(() => start(f), /unreadable/);
  assert.throws(() => beginWork({ root: other.root, host: 'codex', goal: 'Bad store' }, { store: join(other.root, 'metadata') }), /outside/);
  symlinkSync(other.root, join(base, 'alias'));
  assert.throws(() => beginWork({ root: other.root, host: 'codex', goal: 'Alias store' }, { store: join(base, 'alias', 'metadata') }), /outside/);
});
test('explicit native start registers one observed task; ordinary chat does not create goals', () => {
  const f = fixture(), session = randomUUID();
  assert.equal(observeWorkSession({ cwd: f.root, session_id: session, hook_event_name: 'UserPromptSubmit', prompt: 'Please explain CSV' }, f), null);
  observeWorkSession({ cwd: f.root, session_id: session, hook_event_name: 'UserPromptSubmit', prompt: '/great-cto:start Export CSV' }, f);
  observeWorkSession({ cwd: f.root, session_id: session, hook_event_name: 'UserPromptSubmit', prompt: '/start Export CSV' }, f);
  const listing = listWorkTasks(f.root, f); assert.equal(listing.tasks.length, 1);
  assert.equal(listing.tasks[0].managed, false); assert.equal(listing.tasks[0].goal, 'Export CSV');
  assert.deepEqual(listing.tasks[0].links.sessions, [session]);
  assert.equal(listing.tasks[0].operations.length, 0);
});
test('retired unrelated project records do not degrade current project membership', () => {
  const f = fixture(), other = fixture(), w = start(f); w.lease.release();
  rmSync(f.root, { recursive: true, force: true });
  const listing = listWorkTasks(other.root, { store: f.store });
  assert.equal(listing.state, 'ok'); assert.equal(listing.tasks.length, 0);
});
