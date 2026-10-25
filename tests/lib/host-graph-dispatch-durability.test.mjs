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
