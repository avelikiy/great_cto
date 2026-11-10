import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, chmodSync, lstatSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { appendHostGraphEvent, readHostGraph, HOST_GRAPH_LIMITS } from '../../scripts/lib/host-graph-journal.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-host-journal-')));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = join(home, 'project'); mkdirSync(root, { mode: 0o700 });
  const binding = { root, projectId: 'project:' + sha(root), runId: randomUUID(), sessionId: randomUUID() };
  return { root, home, binding, store: join(home, 'journal') };
}
function event(binding, extra = {}) {
  return { schemaVersion: 1, id: sha('event-' + JSON.stringify(extra)), sourceEventId: sha('source-' + JSON.stringify(extra)),
    sequence: null, host: 'codex', mode: 'native', kind: 'session', phase: 'started', outcome: 'unknown',
    sessionId: binding.sessionId, attemptId: null, parentIds: [], occurredAt: null,
    observedAt: '2026-10-25T12:00:00.000Z', toolClass: null, ...extra };
}
function journal(store) { return join(store, readdirSync(store).find(n => n.endsWith('.jsonl'))); }

test('missing journal is unavailable and read-only', t => {
  const f = fixture(t), got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.health, 'absent'); assert.deepEqual(got.events, []);
  assert.equal(got.coverage.lifecycle.state, 'unavailable');
  assert.throws(() => readdirSync(f.store), { code: 'ENOENT' });
});
test('private journal deduplicates replay and strips untrusted raw fields before storage', t => {
  const f = fixture(t), canary = randomUUID(), e = event(f.binding, { prompt: canary, raw: '/private/path', tool_input: { token: canary } });
  assert.equal(appendHostGraphEvent(f.binding, e, { store: f.store }).state, 'recorded');
  assert.equal(appendHostGraphEvent(f.binding, { ...e, observedAt: '2026-10-25T13:00:00.000Z' }, { store: f.store }).state, 'duplicate');
  const got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.events.length, 1); assert.equal(got.health, 'ok');
  assert(!readFileSync(journal(f.store), 'utf8').includes(canary));
  assert(!readFileSync(journal(f.store), 'utf8').includes('/private/path'));
  assert.equal(lstatSync(f.store).mode & 0o777, 0o700);
  assert.equal(lstatSync(journal(f.store)).mode & 0o777, 0o600);
  assert.equal(got.coverage.gates.supported, false);
  assert.equal(got.coverage.lifecycle.state, 'partial');
});
test('exact project, run and session bindings isolate reads and reject event injection', t => {
  const f = fixture(t); appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  assert.equal(readHostGraph({ ...f.binding, runId: randomUUID() }, { store: f.store }).events.length, 0);
  assert.equal(readHostGraph({ ...f.binding, sessionId: randomUUID() }, { store: f.store }).events.length, 0);
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { sessionId: randomUUID() }), { store: f.store }).state, 'degraded');
  assert.equal(readHostGraph({ ...f.binding, projectId: 'project:' + sha('other') }, { store: f.store }).health, 'degraded');
});
test('unsafe permissions, symlink store ancestors and project-local stores fail closed', t => {
  const f = fixture(t); mkdirSync(f.store, { mode: 0o755 }); chmodSync(f.store, 0o755);
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding), { store: f.store }).state, 'degraded');
  chmodSync(f.store, 0o700);
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding), { store: join(f.root, 'journal') }).state, 'degraded');
  const alias = join(f.home, 'alias'); symlinkSync(f.store, alias);
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding), { store: join(alias, 'nested') }).state, 'degraded');
  appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  chmodSync(journal(f.store), 0o644);
  assert.equal(readHostGraph(f.binding, { store: f.store }).health, 'degraded');
});
test('truncated final record is retained as incomplete and later valid events can recover', t => {
  const f = fixture(t); appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  const file = journal(f.store), initial = readFileSync(file, 'utf8');
  writeFileSync(file, initial + '{"id":"cut', { mode: 0o600 });
  const before = readHostGraph(f.binding, { store: f.store });
  assert.equal(before.health, 'degraded'); assert.equal(before.events.length, 1);
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { phase: 'completed', outcome: 'succeeded' }), { store: f.store }).state, 'recorded');
  const after = readHostGraph(f.binding, { store: f.store });
  assert.equal(after.events.length, 2); assert.equal(after.health, 'degraded');
  assert(readFileSync(file, 'utf8').includes('{"id":"cut'));
  assert.notEqual(after.coverage.lifecycle.state, 'complete');
});
test('duplicate id with different content and malformed event never overwrite history', t => {
  const f = fixture(t), first = event(f.binding);
  appendHostGraphEvent(f.binding, first, { store: f.store });
  assert.equal(appendHostGraphEvent(f.binding, { ...first, phase: 'failed' }, { store: f.store }).state, 'degraded');
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { host: 'unknown', phase: 'success' }), { store: f.store }).state, 'degraded');
  assert.equal(readHostGraph(f.binding, { store: f.store }).events.length, 1);
});
test('pagination is bounded and malformed cursor is rejected', t => {
  const f = fixture(t);
  for (let sequence = 1; sequence <= 4; sequence++) appendHostGraphEvent(f.binding, event(f.binding, { sequence }), { store: f.store });
  const one = readHostGraph(f.binding, { store: f.store, limit: 2 });
  assert.equal(one.events.length, 2); assert(one.cursor);
  const two = readHostGraph(f.binding, { store: f.store, limit: 2, cursor: one.cursor });
  assert.equal(two.events.length, 2); assert.notEqual(one.events[0].id, two.events[0].id);
  assert.equal(readHostGraph(f.binding, { store: f.store, cursor: '../bad' }).health, 'degraded');
});
test('byte quota and writer contention return degraded without unsafe lock takeover', t => {
  const f = fixture(t); appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  const file = journal(f.store), lock = file + '.lock'; mkdirSync(lock, { mode: 0o700 });
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { sequence: 1 }), { store: f.store }).state, 'degraded');
  assert(lstatSync(lock).isDirectory()); rmSync(lock, { recursive: true });
  writeFileSync(file, ' '.repeat(HOST_GRAPH_LIMITS.bytes + 1), { mode: 0o600 });
  assert.equal(readHostGraph(f.binding, { store: f.store }).health, 'degraded');
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { sequence: 2 }), { store: f.store }).state, 'degraded');
});
test('event relationships and source sequence gaps prevent completeness claims', t => {
  const f = fixture(t);
  appendHostGraphEvent(f.binding, event(f.binding, { sequence: 1 }), { store: f.store });
  appendHostGraphEvent(f.binding, event(f.binding, { sequence: 3, phase: 'completed', parentIds: [sha('missing')] }), { store: f.store });
  const got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.health, 'degraded');
  assert.equal(got.coverage.parentChild.state, 'partial'); assert.equal(got.coverage.lifecycle.state, 'partial');
});


test('retry attempts remain readable in one explicitly bound session', t => {
  const f = fixture(t), first = randomUUID(), second = randomUUID();
  assert.equal(appendHostGraphEvent({ ...f.binding, attemptId: first }, event(f.binding, { attemptId: first }), { store: f.store }).state, 'recorded');
  assert.equal(appendHostGraphEvent({ ...f.binding, attemptId: second }, event(f.binding, { attemptId: second, sequence: 1 }), { store: f.store }).state, 'recorded');
  const got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.health, 'ok'); assert.equal(got.events.length, 2);
});
test('event quota is visible to readers and appenders without dropping earlier events', t => {
  const f = fixture(t); appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  const file = journal(f.store);
  writeFileSync(file, Array.from({ length: HOST_GRAPH_LIMITS.events }, (_, sequence) => JSON.stringify(event(f.binding, { sequence }))).join('\n') + '\n', { mode: 0o600 });
  const got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.total, HOST_GRAPH_LIMITS.events); assert.equal(got.health, 'degraded');
  assert(got.diagnostics.includes('event-quota'));
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { sequence: HOST_GRAPH_LIMITS.events + 1 }), { store: f.store }).state, 'degraded');
});
test('missing roots and hostile errors never expose local paths in reasons', t => {
  const f = fixture(t), missing = { ...f.binding, root: join(f.home, 'SECRET-MISSING') };
  const got = readHostGraph(missing, { store: f.store });
  assert.equal(got.health, 'degraded'); assert(!got.reason.includes('SECRET-MISSING')); assert(!got.reason.includes(f.home));
});


test('source identity can be unavailable without inventing one, and capabilities stay unknown', t => {
  const f = fixture(t), e = event(f.binding, { sourceEventId: null, sourceVersion: '1.2', callId: sha('call') });
  assert.equal(appendHostGraphEvent(f.binding, e, { store: f.store }).state, 'recorded');
  const got = readHostGraph(f.binding, { store: f.store, capabilities: { lifecycle: 'unknown', tools: 'unsupported' } });
  assert.equal(got.events[0].sourceEventId, null); assert.equal(got.events[0].callId, sha('call'));
  assert.equal(got.coverage.lifecycle.supported, null); assert.equal(got.coverage.tools.supported, false);
});

test('allowlisted gap records survive reload and keep capability support unknown', t => {
  const f = fixture(t), gap = event(f.binding, { kind: 'error', phase: 'failed', diagnosticCodes: ['missing-source-event-identity', 'source-version-unverified'] });
  assert.equal(appendHostGraphEvent(f.binding, gap, { store: f.store }).state, 'recorded');
  const got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.health, 'degraded');
  assert(got.diagnostics.includes('missing-source-event-identity'));
  assert.deepEqual(got.events[0].diagnosticCodes, ['missing-source-event-identity', 'source-version-unverified']);
  assert.equal(got.coverage.lifecycle.supported, null); assert.equal(got.coverage.tools.supported, null); assert.equal(got.coverage.parentChild.supported, null);
});
test('diagnostic text and codes cannot smuggle private fields into journal', t => {
  const f = fixture(t);
  const leaked = event(f.binding, { kind: 'error', diagnosticCodes: ['SECRET-PATH:/private/file'] });
  assert.equal(appendHostGraphEvent(f.binding, leaked, { store: f.store }).state, 'degraded');
  const gap = event(f.binding, { kind: 'error', diagnosticCodes: ['observer-transport-failure'], message: 'SECRET-CREDENTIAL', diagnosticText: '/private/file' });
  assert.equal(appendHostGraphEvent(f.binding, gap, { store: f.store }).state, 'recorded');
  const raw = readFileSync(journal(f.store), 'utf8'); assert(!raw.includes('SECRET')); assert(!raw.includes('/private/file'));
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { kind: 'tool', diagnosticCodes: ['observer-transport-failure'] }), { store: f.store }).state, 'degraded');
});

test('host-bound journals isolate identical project run and session identities', t => {
  const f = fixture(t), codex = { ...f.binding, host: 'codex' }, claude = { ...f.binding, host: 'claude-code' };
  assert.equal(appendHostGraphEvent(codex, event(codex), { store: f.store }).state, 'recorded');
  assert.equal(appendHostGraphEvent(claude, event(claude, { host: 'claude-code' }), { store: f.store }).state, 'recorded');
  assert.equal(readHostGraph(codex, { store: f.store }).events.length, 1);
  assert.equal(readHostGraph(claude, { store: f.store }).events.length, 1);
  assert.equal(readHostGraph(codex, { store: f.store }).events[0].host, 'codex');
  assert.equal(appendHostGraphEvent(codex, event(codex, { host: 'claude-code' }), { store: f.store }).state, 'degraded');
});
test('lost event under writer contention leaves durable incomplete marker after reload', t => {
  const f = fixture(t); appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  const file = journal(f.store), lock = file + '.lock'; mkdirSync(lock, { mode: 0o700 });
  assert.equal(appendHostGraphEvent(f.binding, event(f.binding, { sequence: 1 }), { store: f.store }).state, 'degraded');
  rmSync(lock, { recursive: true });
  const got = readHostGraph(f.binding, { store: f.store });
  assert.equal(got.health, 'degraded'); assert(got.diagnostics.includes('writer-contention'));
  assert.equal(got.events.length, 1); assert.equal(lstatSync(file + '.incomplete').mode & 0o777, 0o600);
});
test('loss marker refuses symlink target and remains bounded across repeated failures', t => {
  const f = fixture(t); appendHostGraphEvent(f.binding, event(f.binding), { store: f.store });
  const file = journal(f.store), target = join(f.home, 'untouched'); writeFileSync(target, 'PRIVATE', { mode: 0o600 });
  symlinkSync(target, file + '.incomplete'); mkdirSync(file + '.lock', { mode: 0o700 });
  appendHostGraphEvent(f.binding, event(f.binding, { sequence: 1 }), { store: f.store });
  assert.equal(readFileSync(target, 'utf8'), 'PRIVATE');
  assert.equal(readHostGraph(f.binding, { store: f.store }).health, 'degraded');
  rmSync(file + '.incomplete');
  for (let sequence = 2; sequence < 8; sequence++) appendHostGraphEvent(f.binding, event(f.binding, { sequence }), { store: f.store });
  assert(lstatSync(file + '.incomplete').size < 512);
  assert(!readFileSync(file + '.incomplete', 'utf8').includes('PRIVATE'));
});
