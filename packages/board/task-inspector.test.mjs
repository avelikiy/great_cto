import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskInspector } from './lib/task-inspector.mjs';
import { projectWork } from './lib/work.mjs';

test('inspector scopes by explicit identity, drops raw content and bounds recent events', () => {
  const activity = { state: 'live', events: Array.from({ length: 30 }, (_, i) => ({
    session: 'own', ts: String(i), kind: 'tool', agent: 'qa', tool: 'Read', prompt: 'SECRET', paths: ['/secret'], output: 'SECRET', ok: true,
  })).concat({ session: 'other', agent: 'qa', kind: 'agent-stop', verdict: 'PASS' }) };
  const inspector = taskInspector(['own'], activity);
  assert.equal(inspector.state, 'recorded'); assert.equal(inspector.events.length, 20);
  assert.equal(inspector.lastEventAt, '29');
  assert.doesNotMatch(JSON.stringify(inspector), /SECRET|\/secret|PASS/);
  assert.equal(taskInspector([], activity).state, 'unlinked');
  assert.equal(taskInspector(['absent'], activity).state, 'none');
});
test('unreadable and incomplete activity remain distinct from no events', () => {
  assert.equal(taskInspector(['own'], { state: 'unreadable', events: [] }).state, 'unreadable');
  assert.equal(taskInspector(['own'], { state: 'live', events: [], bad: 1 }).partial, true);
});
test('run and shared task inherit only explicitly linked activity; events never grant approval', () => {
  const run = { id: 'own', status: 'blocked', reason: 'provider timeout', rolesCompleted: [] };
  const task = { taskId: 'task', links: { runs: ['own'], sessions: [], issues: [] }, host: 'codex',
    goal: 'Ship feature', phase: 'blocked', operations: [], evidence: [], revision: 1, acceptance: [] };
  const args = { projectId: 'p', codex: { runs: [run] }, tasks: [task], activity: { state: 'live', events: [
    { session: 'own', kind: 'agent-stop', ok: true }, { session: 'other', kind: 'tool' },
  ] } };
  const entry = projectWork(args).entries[0];
  assert.equal(entry.inspector.events.length, 1); assert.equal(entry.phase, 'blocked');
  assert.equal(entry.capabilities.some(c => c.enabled), false); assert.deepEqual(entry.evidence, []);
  assert.notEqual(projectWork(args).revision, projectWork({ ...args, activity: { state: 'none', events: [] } }).revision);
});
