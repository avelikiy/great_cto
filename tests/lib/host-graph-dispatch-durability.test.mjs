import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { newRun, runStage } from '../../scripts/lib/codex-pipeline.mjs';
import { projectCodexState } from '../../scripts/lib/codex-host-state.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';

test('verifier binding is durable before first external event, including crash-time projection', async t => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-graph-dispatch-'))), root = join(tmp, 'project'), pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared', 'pipeline.toml'), '[transitions.writer]\non=["DONE"]\ngate="gate:code"\nnext=[]');
  commitFixture(root);
  const previous = process.env.GREAT_CTO_HOST_GRAPHS_DIR; process.env.GREAT_CTO_HOST_GRAPHS_DIR = join(tmp, 'journal');
  t.after(() => { if (previous === undefined) delete process.env.GREAT_CTO_HOST_GRAPHS_DIR; else process.env.GREAT_CTO_HOST_GRAPHS_DIR = previous; rmSync(tmp, { recursive: true, force: true }); });
  const state = newRun({ root, pluginRoot, prompt: 'Synthetic durability fixture', allowed: ['src', 'docs'], entry: 'writer' }); state.observeHostGraph = true;
  let durable = null, verifierReached = false;
  await runStage(state, { save: current => { durable = structuredClone(current); }, execute: async options => {
    if (!options.prompt.startsWith('You are an independent verifier')) return { state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'DONE', summary: 'offline fixture', meta: {}, files: [] }) };
    verifierReached = true;
    assert.equal(durable.attempts[0].verifierInvocationId, options.invocationId, 'binding must be persisted before execution starts');
    assert(durable.dispatchEvidence.records.some(r => r.kind === 'verifier' && r.outcome === 'intent'));
    options.onEvent({ type: 'item.started', item: { id: 'tool-1', type: 'command_execution', status: 'in_progress' } });
    const crashView = projectCodexState(durable);
    const observed = crashView.hostObservations.find(g => g.binding?.sessionId === options.invocationId);
    assert(observed?.nodes.some(n => n.kind === 'tool'), 'persisted crash-time state still reaches the live journal');
    return { state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ state: 'verified', findings: [], checks: ['synthetic fixture, no model calls'] }) };
  } });
  assert(verifierReached); assert.equal(state.status, 'awaiting-gate');
});

test('opt-in version checks refresh exact configured host executables and persist provenance', async () => {
  const { refreshHostObservationSources } = await import('../../scripts/lib/codex-pipeline.mjs');
  const state = { observeHostGraph: true }; let calls = 0, saved;
  const audit = options => { calls++; assert.equal(options.binaries.codex, process.env.GREAT_CTO_CODEX_BIN || 'codex');
    assert.equal(options.binaries['claude-code'], process.env.GREAT_CTO_CLAUDE_BIN || 'claude');
    return [{ host: 'codex', sourceVersion: calls === 1 ? '0.164.0' : '0.165.0', state: 'available', controlled: { streamEvents: true }, native: { hookEvents: null }, liveAcceptance: 'not-checked' }]; };
  refreshHostObservationSources(state, { audit, save: s => { saved = structuredClone(s); } });
  assert.equal(saved.hostObservationSources[0].sourceVersion, '0.164.0');
  refreshHostObservationSources(state, { audit, save: s => { saved = structuredClone(s); } });
  assert.equal(saved.hostObservationSources[0].sourceVersion, '0.165.0');
  refreshHostObservationSources({ observeHostGraph: false }, { audit }); assert.equal(calls, 2);
});

test('parallel observations retain durable wave attempt identity before prepared attempts exist', async t => {
  const { runParallelWave } = await import('../../scripts/lib/codex-pipeline.mjs');
  const { graphBinding, projectHostObservations } = await import('../../scripts/lib/host-graph-observer.mjs');
  const { invocationIdentity } = await import('../../scripts/lib/invocation-identity.mjs');
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-wave-observe-'))), root = join(tmp, 'project'), pluginRoot = join(tmp, 'policy');
  mkdirSync(root); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared', 'pipeline.toml'), '[transitions.writer]\non=["DONE"]\nnext=["qa","security"]\n[transitions.qa]\non=["PASS"]\njoin=["security"]\ngate="gate:review"\nnext=[]\n[transitions.security]\non=["PASS"]\njoin=["qa"]\ngate="gate:review"\nnext=[]');
  commitFixture(root);
  const previous = process.env.GREAT_CTO_HOST_GRAPHS_DIR, previousRuns = process.env.GREAT_CTO_CODEX_RUNS_DIR, store = join(tmp, 'journal'), runs = join(tmp, 'runs');
  mkdirSync(runs, { mode: 0o700 });
  process.env.GREAT_CTO_HOST_GRAPHS_DIR = store; process.env.GREAT_CTO_CODEX_RUNS_DIR = runs;
  t.after(() => { if (previous === undefined) delete process.env.GREAT_CTO_HOST_GRAPHS_DIR; else process.env.GREAT_CTO_HOST_GRAPHS_DIR = previous; if (previousRuns === undefined) delete process.env.GREAT_CTO_CODEX_RUNS_DIR; else process.env.GREAT_CTO_CODEX_RUNS_DIR = previousRuns; rmSync(tmp, { recursive: true, force: true }); });
  const state = newRun({ root, pluginRoot, prompt: 'Synthetic parallel observation binding only', allowed: ['docs'], entry: 'writer', hostRoutes: { qa: 'codex', security: 'claude-code' } });
  state.observeHostGraph = true;
  const verify = async () => ({ state: 'verified', findings: [], checks: ['synthetic binding fixture; no provider calls'] });
  await runStage(state, { verify, execute: async () => ({ state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'DONE', summary: 'fixture', meta: {}, files: [] }) }) });
  const { getHostGraphPage } = await import('../../packages/board/lib/work.mjs');
  let durable; const calls = [];
  const runner = (role, host) => async options => {
    const attemptId = durable.wave.attemptIds[role];
    assert(!durable.attempts.some(a => a.id === attemptId), 'prepared attempt has not been applied');
    assert.equal(options.invocationId, invocationIdentity({ session_id: state.id, agent_id: attemptId }));
    options.onEvent(host === 'codex' ? { type: 'turn.started' } : { type: 'result', is_error: false });
    if (host === 'codex') {
      options.onEvent({ type: 'item.started', item: { id: 'shared-call', type: 'command_execution', status: 'in_progress' } });
      options.onEvent({ type: 'item.completed', item: { id: 'shared-call', type: 'command_execution', status: 'completed' } });
    } else {
      options.onEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'shared-call', name: 'Read' }] } });
      options.onEvent({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'shared-call', is_error: false }] } });
    }
    const graph = projectHostObservations(graphBinding({ root, runId: state.id, sessionId: options.invocationId, host }), { store });
    const crashView = projectCodexState(durable);
    let page, pageError; try { page = getHostGraphPage(root, { host, sessionId: options.invocationId, runId: state.id }); } catch (error) { pageError = error.message; }
    assert.throws(() => getHostGraphPage(root, { host: host === 'codex' ? 'claude-code' : 'codex', sessionId: options.invocationId, runId: state.id }), /does not belong/);
    calls.push({ role, attemptId, invocationId: options.invocationId, graph, crashView, page, pageError });
    return { state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'PASS', summary: 'fixture', meta: {}, files: [] }) };
  };
  await runParallelWave(state, { verify, save: value => { durable = structuredClone(value); writeFileSync(join(runs, `${value.id}.json`), JSON.stringify(durable), { mode: 0o600 }); }, runners: { codex: runner('qa', 'codex'), 'claude-code': runner('security', 'claude-code') } });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert(call.graph.nodes.some(n => n.kind === 'turn' && n.attemptId === call.attemptId), `${call.role} retains the known wave attempt`);
    assert(!call.graph.diagnostics.includes('missing-source-event-identity'));
    assert(call.graph.nodes.every(n => n.attemptId === call.attemptId));
    assert.equal(call.graph.edges.length, 1, 'reused call IDs remain isolated across sibling hosts');
    const visible = call.crashView.hostObservations.find(g => g.binding?.sessionId === call.invocationId);
    assert(visible?.nodes.some(n => n.kind === 'turn' && n.attemptId === call.attemptId), 'in-flight wave is visible from durable crash-time state');
    assert.equal(call.pageError, undefined); assert(call.page.nodes.some(n => n.kind === 'turn' && n.attemptId === call.attemptId));
    assert.equal(projectCodexState(state).hostObservationBindings.filter(b => b.sessionId === call.invocationId).length, 1, 'materializing the attempt does not duplicate membership');
  }
  assert.equal(state.status, 'awaiting-gate'); assert.equal(state.approvals.length, 0);
});
