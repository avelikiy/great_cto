import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectWork } from './lib/work.mjs';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';

const id = randomUUID();
const run = overrides => ({ id, status: 'ready', attempts: [], rolesCompleted: [], ...overrides });
const project = (runs, issues = [], extra = {}) => projectWork({ projectId: 'example', codex: { state: 'ok', runs }, issues, ...extra });

test('ordinary resume is copy-only; pending approval, active owner and terminal state never permit it', () => {
  const allowed = project([run()]).entries[0];
  assert.equal(allowed.capabilities[0].enabled, true);
  assert.match(allowed.command, /resume .* --host codex/);
  for (const change of [{ pending: { role: 'architect' } }, { status: 'awaiting-gate' }, { status: 'awaiting-release' },
    { active: 'worker' }, { wave: { status: 'running' } }, { status: 'blocked' }, { status: 'done' }, { status: 'cancelled' }]) {
    const entry = project([run(change)]).entries[0];
    assert.equal(entry.capabilities[0].enabled, false, JSON.stringify(change));
    assert.equal(entry.command, null);
  }
});
test('issues and runs never join by title; closed issue does not imply verified goal', () => {
  const result = project([run({ status: 'done' })], [{ id: 'a', title: id, raw_status: 'closed' }]);
  assert.equal(result.entries.length, 2);
  for (const e of result.entries) { assert.equal(e.taskId, null); assert.equal(e.phase, null); assert.match(e.outcome, /acceptance is not recorded/); }
});
test('revision remains stable across read timestamps, changes with state; degraded empty is not complete', () => {
  const a = project([], [], { sources: [{ id: 'codex', health: 'unavailable', observedAt: 'one', reason: 'broken' }] });
  const b = project([], [], { observedAt: 'two', sources: [{ id: 'codex', health: 'unavailable', observedAt: 'two', reason: 'broken' }] });
  assert.equal(a.revision, b.revision); assert.equal(a.health, 'degraded');
  assert.notEqual(a.revision, project([run()]).revision);
});
test('projection drops approval tokens, prompt, artifact bytes and raw issue notes', () => {
  const secret = randomUUID();
  const encoded = JSON.stringify(project([run({ prompt: secret, pending: { token: secret }, release: { token: secret, artifacts: secret } })], [{ id: 'x', notes: secret }]));
  assert.equal(encoded.includes(secret), false);
});

const cwd = mkdtempSync(join(tmpdir(), 'gcto-work-'));
const home = mkdtempSync(join(tmpdir(), 'gcto-work-home-'));
mkdirSync(join(cwd, '.great_cto')); mkdirSync(join(home, '.great_cto', 'codex-runs'), { recursive: true });
writeFileSync(join(cwd, '.great_cto', 'tasks.md'), '| id | title | status | owner |\n| --- | --- | --- | --- |\n| i-1 | Example work | open | CTO |\n');
writeFileSync(join(home, '.great_cto', 'codex-runs', `${id}.json`), JSON.stringify({ version: 1, id, root: cwd, status: 'ready', results: {}, attempts: [] }));
const { port, proc } = await startServerOnFreePort({ entry: new URL('./server.mjs', import.meta.url).pathname,
  cwd, env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1' }, readyPath: '/api/heartbeat', portEnv: 'PORT' });
const base = `http://127.0.0.1:${port}`;
after(async () => { const { reap } = await import('../../tests/helpers/reap.mjs'); await reap(proc); rmSync(cwd, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });

test('HTTP projection scopes reads, fails unknown project closed and refuses execution writes', async () => {
  const r = await fetch(base + '/api/work'); const snapshot = await r.json();
  assert.equal(r.status, 200); assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.projectId, /^project:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(snapshot).includes(cwd), false);
  assert.equal(snapshot.entries.find(e => e.runId === id).host, 'codex');
  assert.equal(snapshot.entries.find(e => e.issueIds.includes('i-1')).runId, null);
  assert.equal((await fetch(base + '/api/work?project=unknown-no-fallback')).status, 404);
  assert.equal((await fetch(base + '/api/work', { method: 'POST', headers: { Origin: base } })).status, 405);
  assert.equal((await fetch(base + '/api/work/publication-preview?project=unknown-no-fallback&task=' + id)).status, 404);
  assert.equal((await fetch(base + '/api/work/publication-preview?task=' + id, { method: 'POST', headers: { Origin: base } })).status, 405);
  assert.equal((await fetch(base + '/api/work/publication-preview?task=bad-id')).status, 409);
});
test('HTTP degraded store reports unreadable records instead of all clear', async () => {
  writeFileSync(join(home, '.great_cto', 'codex-runs', `${randomUUID()}.json`), '{bad');
  const snapshot = await (await fetch(base + '/api/work')).json();
  assert.equal(snapshot.health, 'degraded');
  assert.match(snapshot.sources.find(s => s.id === 'codex').reason, /could not be read/);
  assert.equal(snapshot.entries.some(e => e.runId === id), true);
});

test('HTTP cockpit links project activity without exposing other sessions or raw event contents', async () => {
  writeFileSync(join(cwd, '.great_cto', 'events.jsonl'), [
    { kind: 'tool', session: id, ts: '2026-10-09T12:00:00Z', tool: 'Read', prompt: 'PRIVATE_PROMPT', output: 'PRIVATE_OUTPUT' },
    { kind: 'agent-stop', session: 'unrelated', agent: 'UNRELATED_AGENT', ok: true },
  ].map(e => JSON.stringify(e)).join('\n') + '\n');
  const snapshot = await (await fetch(base + '/api/work')).json();
  const inspector = snapshot.entries.find(e => e.runId === id).inspector;
  assert.equal(inspector.state, 'recorded'); assert.equal(inspector.events.length, 1);
  assert.equal(inspector.events[0].tool, 'Read');
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_PROMPT|PRIVATE_OUTPUT|UNRELATED_AGENT/);
  writeFileSync(join(cwd, '.great_cto', 'events.jsonl'), '{bad\n');
  const degraded = await (await fetch(base + '/api/work')).json();
  assert.equal(degraded.sources.find(s => s.id === 'activity').health, 'degraded');
  assert.equal(degraded.entries.find(e => e.runId === id).inspector.partial, true);
});

test('shared tasks use explicit links, goal and host capabilities instead of duplicate run rows', () => {
  const taskId = randomUUID();
  const task = { taskId, host: 'codex', goal: 'Export authorized CSV', acceptance: ['Check row access'], phase: 'accepted',
    revision: 4, updatedAt: '2026-10-02T00:00:00Z', links: { runs: [id], issues: [], sessions: [] }, operations: [], evidence: [], metrics: {} };
  const snapshot = project([run()], [], { tasks: [task] });
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].taskId, taskId); assert.equal(snapshot.entries[0].title, task.goal);
  assert.match(snapshot.entries[0].command, /--revision 4/);
  task.operations = [{ state: 'running' }];
  assert.equal(project([run()], [], { tasks: [task] }).entries[0].capabilities[0].enabled, false);
});

test('evidence separates linked activity, verifier reports, publication and absent review/runtime', () => {
  const task = { taskId: randomUUID(), host: 'codex', goal: 'Same title', acceptance: [], phase: 'verified',
    revision: 1, links: { runs: [id], issues: [], sessions: [] }, operations: [], metrics: {},
    evidence: [{ role: 'code-reviewer', verdict: 'PASS', verified: true, secret: 'HIDDEN' }],
    publication: { state: 'pr-linked', head: 'a'.repeat(40) } };
  const activity = { state: 'recorded', gap: true, events: [
    { session: id, kind: 'agent-stop', ok: true, host: 'codex' },
    { session: 'foreign', kind: 'tool', agent: 'FOREIGN' },
  ] };
  const entry = project([run({ release: { status: 'done', verifiedAt: '2026-10-11T10:00:00Z' } })], [], { tasks: [task], activity }).entries[0];
  const sections = Object.fromEntries(entry.evidenceSections.map(s => [s.id, s]));
  assert.equal(sections.execution.state, 'recorded');
  assert.match(sections.execution.detail, /1 linked.*incomplete/);
  assert.equal(sections.checks.state, 'recorded');
  assert.match(sections.checks.detail, /1 verifier-success reports.*bindings are not available/);
  assert.equal(sections.review.state, 'unknown');
  assert.equal(sections.publication.state, 'recorded');
  assert.match(sections.publication.detail, /does not establish merge/);
  assert.equal(sections.runtime.state, 'unknown');
  assert.doesNotMatch(JSON.stringify(entry), /HIDDEN|FOREIGN/);
});

test('completed roles and a same-title foreign session never become successful checks', () => {
  const entry = project([run({ rolesCompleted: ['qa-engineer'], status: 'done' })], [], {
    activity: { state: 'recorded', events: [{ session: 'foreign', kind: 'agent-stop', ok: true, agent: 'qa-engineer' }] },
  }).entries[0];
  assert.equal(entry.evidenceSections.length, 5);
  assert.equal(entry.evidenceSections.every(s => s.state === 'unknown'), true);
  assert.equal(entry.evidenceSections.find(s => s.id === 'checks').detail.includes('do not establish verification'), true);
});

test('task verdict projection is bounded and rejects truthy non-boolean verification claims', () => {
  const task = { taskId: randomUUID(), host: 'claude-code', goal: 'Task', acceptance: [], phase: 'waiting',
    revision: 1, links: { runs: [], issues: [], sessions: [] }, operations: [], metrics: {},
    evidence: Array.from({ length: 201 }, () => ({ role: 'qa-engineer', verdict: 'PASS', verified: 'true' })) };
  const entry = project([], [], { tasks: [task] }).entries[0];
  assert.equal(entry.evidence.length, 200);
  assert.equal(entry.evidence[0].verifierReported, null);
  assert.match(entry.evidenceSections.find(s => s.id === 'checks').detail, /bounded view: 200 role verdict records; 0 verifier-success reports/);
  assert.equal(entry.evidenceSections.find(s => s.id === 'review').state, 'unknown');
});

test('execution retains distinct attempt IDs, bounds nodes and never exposes private attempt fields', () => {
  const attempts = Array.from({ length: 202 }, (_, i) => ({ id: `attempt-${i}`, role: 'senior-dev', host: i % 2 ? 'codex' : 'claude-code',
    number: i + 1, phase: 'verifying', status: i ? 'verified' : 'rework', startedAt: '2026-10-21T10:00:00Z', finishedAt: 'bad-date',
    invocationId: 'PRIVATE_INVOCATION', context: { text: 'PRIVATE_CONTEXT' }, prompt: 'PRIVATE_PROMPT', results: 'PRIVATE_RESULT', dispatchEvidence: 'PRIVATE_DISPATCH' }));
  const entry = project([run({ attempts })]).entries[0], execution = entry.execution;
  assert.equal(execution.nodes.length, 200); assert.equal(execution.truncated, true); assert.equal(execution.partial, true);
  assert.equal(execution.topology, 'unknown'); assert.equal(execution.nodes[0].attemptId, 'attempt-2');
  assert.equal(new Set(execution.nodes.map(n => n.attemptId)).size, 200);
  assert.equal(execution.nodes[0].runId, id); assert.equal(execution.nodes[0].number, 3);
  assert.equal(execution.nodes[0].finishedAt, null);
  assert.equal(entry.evidenceSections.find(s => s.id === 'execution').state, 'recorded');
  assert.deepEqual(Object.keys(execution.nodes[0]).sort(), ['runId', 'attemptId', 'role', 'host', 'number', 'phase', 'status', 'startedAt', 'finishedAt'].sort());
  assert.doesNotMatch(JSON.stringify(execution), /PRIVATE_|context|invocation|dispatchEvidence|results/);
});

test('execution propagates only through explicit single-run task links; native Claude stays unknown', () => {
  const task = { taskId: randomUUID(), host: 'codex', goal: 'Task', acceptance: [], phase: 'accepted', revision: 1,
    links: { runs: [id], issues: [], sessions: [] }, operations: [], evidence: [], metrics: {} };
  const entry = project([run({ attempts: [{ id: 'first', role: 'senior-dev', host: 'codex', number: 1 }, { id: 'second', role: 'senior-dev', host: 'codex', number: 2 }] })], [], { tasks: [task] }).entries[0];
  assert.equal(entry.kind, 'task'); assert.equal(entry.execution.state, 'recorded');
  assert.deepEqual(entry.execution.nodes.map(n => n.attemptId), ['first', 'second']);
  task.host = 'claude-code'; task.links.runs = [];
  const native = project([], [], { tasks: [task] }).entries[0];
  assert.equal(native.execution.state, 'unknown'); assert.equal(native.execution.partial, true); assert.equal(native.execution.nodes.length, 0);
  assert.match(native.execution.reason, /attempt.*unavailable/i);
});

test('invalid attempt identities stay unknown and cannot be truncated into colliding node IDs', () => {
  const entry = project([run({ attempts: [{ id: 'x'.repeat(200), role: 'qa-engineer' }, null, { id: 'valid', role: 'qa-engineer', host: 'unexpected', number: -1, context: 'PRIVATE' }] })]).entries[0];
  assert.equal(entry.execution.partial, true); assert.equal(entry.execution.nodes.length, 1);
  assert.equal(entry.execution.nodes[0].attemptId, 'valid'); assert.equal(entry.execution.nodes[0].host, null); assert.equal(entry.execution.nodes[0].number, null);
});
