import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bindNativeGraph, unbindNativeGraph, observeNativeGraphHook, nativeGraphObservations } from '../../scripts/lib/host-graph-bindings.mjs';
import { graphBinding, observeHostGraph, projectHostObservations } from '../../scripts/lib/host-graph-observer.mjs';
import { projectWork } from '../../packages/board/lib/work.mjs';
function fixture(t) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-host-observe-'))), root = join(tmp, 'project'); mkdirSync(root);
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  return { tmp, root, store: join(tmp, 'bindings'), journalStore: join(tmp, 'journals') };
}
test('native observation is opt-in and enrollment is immutable, private and revocable', t => {
  const f = fixture(t), sessionId = randomUUID(), event = { hook_event_name: 'PreToolUse', session_id: sessionId, tool_use_id: 'tool-1', tool_name: 'Read', tool_input: { file_path: '/private/secret' } };
  assert.equal(observeNativeGraphHook({ root: f.root, host: 'claude-code', event }, f).state, 'not-enrolled');
  assert.equal(bindNativeGraph({ root: f.root, host: 'claude-code', sessionId, sourceVersion: '2.1.292' }, f).state, 'enrolled');
  assert.throws(() => bindNativeGraph({ root: f.root, host: 'claude-code', sessionId }, f));
  observeNativeGraphHook({ root: f.root, host: 'claude-code', event }, f);
  observeNativeGraphHook({ root: f.root, host: 'claude-code', event: { ...event, hook_event_name: 'PostToolUse' } }, f);
  const [row] = nativeGraphObservations(f.root, f);
  assert.equal(row.graph.edges.filter(e => e.kind === 'same-call').length, 1);
  assert.equal(row.graph.complete, false);
  assert(!JSON.stringify(row).includes('/private/secret'));
  const view = projectWork({ projectId: graphBinding({ root: f.root, runId: sessionId, sessionId }).projectId, nativeGraphs: [row] });
  assert.equal(view.entries[0].kind, 'native'); assert.equal(view.entries[0].decisions.length, 0);
  assert.equal(view.entries[0].phase, 'unknown');
  assert.equal(unbindNativeGraph({ root: f.root, host: 'claude-code', sessionId }, f).state, 'unenrolled');
  assert.equal(observeNativeGraphHook({ root: f.root, host: 'claude-code', event }, f).state, 'not-enrolled');
});
test('call ids reused across attempts cannot create cross-attempt edges', t => {
  const f = fixture(t), runId = randomUUID(), sessionId = randomUUID();
  for (const [attemptId, type] of [['attempt-a','item.completed'],['attempt-b','item.started']]) {
    observeHostGraph({ binding: graphBinding({ root: f.root, runId, sessionId, attemptId }), host: 'codex', mode: 'controlled', sourceVersion: '0.164.0',
      event: { type, item: { id: 'item_0', type: 'command_execution', status: 'completed' } }, store: f.journalStore });
  }
  const graph = projectHostObservations(graphBinding({ root: f.root, runId, sessionId }), { store: f.journalStore });
  assert.equal(graph.edges.length, 0);
});
test('normalizer diagnostic survives process-independent journal read', t => {
  const f = fixture(t), binding = graphBinding({ root: f.root, runId: randomUUID(), sessionId: randomUUID() });
  const result = observeHostGraph({ binding, host: 'codex', mode: 'native', sourceVersion: null, event: { type: 'future_event', prompt: 'SECRET-DO-NOT-STORE' }, store: f.journalStore });
  assert.equal(result.state, 'degraded');
  const graph = projectHostObservations(binding, { store: f.journalStore });
  assert.equal(graph.health, 'degraded'); assert.equal(graph.complete, false);
  assert(graph.diagnostics.includes('unsupported-event-shape'));
  assert(Number.isFinite(Date.parse(graph.observedInterval.from)));
  assert(Number.isFinite(Date.parse(graph.observedInterval.to)));
  assert(!readdirSync(f.journalStore).filter(n => n.endsWith('.jsonl')).some(n => readFileSync(join(f.journalStore, n),'utf8').includes('SECRET-DO-NOT-STORE')));
});
test('enrollment refuses symlinks and projects remain isolated', t => {
  const f = fixture(t), sessionId = randomUUID();
  bindNativeGraph({ root: f.root, host: 'codex', sessionId }, f);
  const other = join(f.tmp, 'other'); mkdirSync(other);
  assert.equal(nativeGraphObservations(other, f).length, 0);
  const link = join(f.tmp, 'linked'); symlinkSync(f.store, link);
  assert.throws(() => nativeGraphObservations(f.root, { store: link, journalStore: f.journalStore }));
});

test('project opt-in observes true SessionStart and explicit child containment for both hosts', async t => {
  const { enableNativeGraph, disableNativeGraph } = await import('../../scripts/lib/host-graph-bindings.mjs');
  const f = fixture(t);
  for (const host of ['codex', 'claude-code']) {
    const sessionId = randomUUID();
    enableNativeGraph({ root: f.root, host, sourceVersion: host === 'codex' ? '0.164.0' : '2.1.292' }, f);
    for (const event of [
      { hook_event_name: 'SessionStart' },
      { hook_event_name: 'SubagentStart', agent_id: 'child-1' },
      { hook_event_name: 'SubagentStop', agent_id: 'child-1' },
      { hook_event_name: 'UserPromptSubmit' }, { hook_event_name: 'Stop' },
      { hook_event_name: 'UserPromptSubmit' }, { hook_event_name: 'Stop' },
    ]) observeNativeGraphHook({ root: f.root, host, event: { ...event, session_id: sessionId } }, f);
    const row = nativeGraphObservations(f.root, f).find(r => r.host === host);
    assert.equal(row.graph.nodes.filter(n => n.kind === 'turn').length, 4, 'distinct deliveries remain distinct despite absent host identity');
    assert.equal(row.graph.edges.filter(e => e.kind === 'observed-parent').length, 2);
    assert.equal(row.graph.health, 'degraded', 'missing replay-safe turn identity remains visible');
    disableNativeGraph({ root: f.root, host }, { store: f.store });
    assert.equal(observeNativeGraphHook({ root: f.root, host, event: { hook_event_name: 'SessionStart', session_id: randomUUID() } }, f).state, 'not-enrolled');
  }
});

test('native resume deliveries remain visible and oversized source versions are refused before write', async t => {
  const { enableNativeGraph } = await import('../../scripts/lib/host-graph-bindings.mjs');
  const f = fixture(t), sessionId = randomUUID();
  assert.throws(() => bindNativeGraph({ root: f.root, host: 'codex', sessionId, sourceVersion: '1'.repeat(5000) + '.2.3' }, f));
  assert.throws(() => enableNativeGraph({ root: f.root, host: 'codex', sourceVersion: '1.2.3-' + 'a'.repeat(5000) }, f));
  enableNativeGraph({ root: f.root, host: 'codex', sourceVersion: '0.164.0' }, f);
  for (const source of ['startup', 'resume', 'resume']) observeNativeGraphHook({ root: f.root, host: 'codex', event: { hook_event_name: 'SessionStart', source, session_id: sessionId } }, f);
  const row = nativeGraphObservations(f.root, f)[0];
  assert.equal(row.graph.nodes.filter(n => n.kind === 'session').length, 3);
  assert.equal(row.graph.health, 'degraded');
});

test('verifier observations stay bound to their attempt and are exposed separately from worker', async t => {
  const { verifyStage } = await import('../../scripts/lib/codex-pipeline.mjs');
  const { projectCodexState } = await import('../../scripts/lib/codex-host-state.mjs');
  const f = fixture(t), previous = process.env.GREAT_CTO_HOST_GRAPHS_DIR;
  process.env.GREAT_CTO_HOST_GRAPHS_DIR = f.journalStore;
  t.after(() => { if (previous === undefined) delete process.env.GREAT_CTO_HOST_GRAPHS_DIR; else process.env.GREAT_CTO_HOST_GRAPHS_DIR = previous; });
  const attempt = { id: 'attempt-a', role: 'writer', host: 'claude-code', invocationId: 'worker-a' };
  const state = { root: f.root, id: randomUUID(), observeHostGraph: true, attempts: [attempt], graph: { writer: {} }, results: {}, queue: [], prompt: 'Synthetic graph observation' };
  const result = await verifyStage(state, 'writer', { meta: {}, files: [] }, async options => {
    options.onEvent({ type: 'item.started', item: { type: 'command_execution', id: 'tool-a', status: 'in_progress' } });
    options.onEvent({ type: 'item.completed', item: { type: 'command_execution', id: 'tool-a', status: 'completed', exit_code: 0 } });
    return { state: 'ok', code: 0, errors: [], observationHealth: 'degraded', finalText: JSON.stringify({ state: 'verified', findings: [], checks: ['offline fixture only'] }) };
  });
  assert.equal(result.state, 'verified');
  assert(attempt.verifierInvocationId);
  const publicState = projectCodexState(state), graph = publicState.hostObservations.find(g => g.binding?.sessionId === attempt.verifierInvocationId);
  assert(graph); assert(graph.nodes.length >= 3);
  assert(graph.nodes.every(n => n.host === 'codex' && n.attemptId === attempt.id));
  assert.equal(graph.edges.filter(e => e.kind === 'same-call').length, 1);
  assert.equal(graph.health, 'degraded');
  assert.equal(publicState.attempts[0].verifierInvocationId, attempt.verifierInvocationId);
});

test('Codex adapter observes original malformed patch once without gaining deny authority', async t => {
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const f = fixture(t), sessionId = randomUUID();
  bindNativeGraph({ root: f.root, host: 'codex', sessionId, sourceVersion: '0.164.0' }, f);
  const result = spawnSync(process.execPath, [resolve('scripts/hooks/codex-adapter.mjs'), 'host-graph-observer'], {
    input: JSON.stringify({ session_id: sessionId, cwd: f.root, hook_event_name: 'PreToolUse', tool_use_id: 'patch-1', tool_name: 'apply_patch', tool_input: { command: 'not a patch' } }),
    encoding: 'utf8', timeout: 10000, env: { ...process.env, GREAT_CTO_GRAPH_BINDINGS_DIR: f.store, GREAT_CTO_HOST_GRAPHS_DIR: f.journalStore },
  });
  assert.equal(result.status, 0); assert.equal(result.stdout, '');
  const row = nativeGraphObservations(f.root, f)[0];
  assert.equal(row.graph.nodes.filter(n => n.kind === 'tool').length, 1);
  assert.equal(row.graph.nodes.find(n => n.kind === 'tool').role, 'write');
});
