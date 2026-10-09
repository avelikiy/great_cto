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
