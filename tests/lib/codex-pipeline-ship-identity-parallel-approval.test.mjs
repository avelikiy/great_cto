import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approve} from '../../scripts/lib/codex-pipeline.mjs';
import {createRun, reassess, reviewAll, gate} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {parallelGraph, stored, calls} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

function approveCurrentShip(f) {
  const pending = structuredClone(f.state.pending), revision = f.state.shipEvidence.revision;
  const saved = stored(f, f.state.id);
  assert.ok(pending.gates.includes('gate:ship'));
  let error; try {approve(f.state, pending.token, {shipBoundary: f.boundary});} catch (caught) {error = caught;}
  assert.equal(pending.shipEvidenceRevision, revision, `fresh ship pending must pin current revision; actual approve returned ${error?.code || 'success'}`);
  assert.equal(saved.pending.shipEvidenceRevision, revision);
  assert.equal(pending.shipEvidenceContextDigest, saved.shipEvidence.contextDigest);
  assert.ifError(error);
  f.boundary.save(f.state);
  const before = JSON.stringify(f.state);
  assert.throws(() => approve(f.state, pending.token, {shipBoundary: f.boundary}), 'consumed token cannot approve replacement decision');
  assert.equal(JSON.stringify(f.state), before);
  return pending;
}

test('P06 parallel completed-wave housekeeping preserves fresh ship approval and successive ship decision pins', async t => {
  const f = createRun(t, {graph: parallelGraph, hostRoutes: {'qa-engineer': 'codex', 'security-officer': 'claude-code'}});
  reassess(f); await reviewAll(f, {parallel: true});
  assert.equal(gate(f).state, 'PASS'); assert.equal(f.state.wave, null);
  assert.equal(f.state.waveHistory.at(-1).status, 'verified');
  assert.equal(calls(f).filter(row => row.kind === 'worker').length, 2);
  assert.equal(calls(f).filter(row => row.kind === 'verifier' && row.host === 'codex').length, 2);
  const first = approveCurrentShip(f);
  assert.ok(f.state.pending); assert.notEqual(f.state.pending.token, first.token);
  const second = approveCurrentShip(f); assert.notEqual(second.role, first.role);
  assert.equal(f.state.pending, null); assert.equal(f.state.status, 'done');
  assert.equal(stored(f, f.state.id).approvals.filter(row => row.gate === 'gate:ship').length, 2);
});

test('P06 approval creates a new qa-to-ship pending token with its own current source revision pin', async t => {
  const graph = parallelGraph.replace('gate = "gate:ship"', 'gate = "gate:qa"');
  const f = createRun(t, {graph, hostRoutes: {'qa-engineer': 'codex', 'security-officer': 'claude-code'}});
  reassess(f); await reviewAll(f, {parallel: true}); assert.equal(gate(f).state, 'PASS');
  const first = structuredClone(f.state.pending); assert.deepEqual(first.gates, ['gate:qa']);
  approve(f.state, first.token, {shipBoundary: f.boundary}); f.boundary.save(f.state);
  assert.ok(f.state.pending); assert.notEqual(f.state.pending.token, first.token);
  assert.deepEqual(f.state.pending.gates, ['gate:ship']);
  const before = JSON.stringify(f.state);
  assert.throws(() => approve(f.state, first.token, {shipBoundary: f.boundary})); assert.equal(JSON.stringify(f.state), before);
  approveCurrentShip(f);
  assert.equal(f.state.status, 'done'); assert.equal(f.state.pending, null);
  assert.deepEqual(stored(f, f.state.id).approvals.map(row => row.gate), ['gate:qa', 'gate:ship']);
});
