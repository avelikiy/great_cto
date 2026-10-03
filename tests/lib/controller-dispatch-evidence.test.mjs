import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeControllerCall, dispatchEvidenceSummary } from '../../scripts/lib/controller-dispatch-evidence.mjs';

const fresh = () => ({ dispatchEvidence: { version: 1, completeHistory: true, records: [] } });
const identity = (id = 'test') => ({ id, host: 'codex', role: 'qa', kind: 'worker' });
// Synthetic intervals only test union arithmetic, not live performance.
const interval = (id, start, end, kind = 'worker') => ({ ...identity(id), kind,
  startedAt: new Date(start).toISOString(), finishedAt: new Date(end).toISOString(), outcome: 'returned' });

test('missing legacy history is unknown; an observed fresh empty history has no calls', () => {
  assert.equal(dispatchEvidenceSummary({}).workerCalls, null);
  assert.equal(dispatchEvidenceSummary({}).activeMs, null);
  assert.equal(dispatchEvidenceSummary(fresh()).workerCalls, 0);
  assert.equal(dispatchEvidenceSummary(fresh()).activeMs, 0);
  assert.equal(dispatchEvidenceSummary(fresh()).actualCostUsd, null);
});

test('parallel intervals form a union, with disjoint work added once', () => {
  const state = fresh();
  state.dispatchEvidence.records = [interval('a', 0, 100), interval('b', 50, 150),
    interval('c', 150, 200, 'verifier'), interval('d', 300, 350, 'verifier')];
  const summary = dispatchEvidenceSummary(state);
  assert.equal(summary.activeMs, 250);
  assert.equal(summary.workerCalls, 2); assert.equal(summary.verifierCalls, 2);
});

test('intent is persisted before execution; response and incidental secrets are not captured', async () => {
  const state = fresh(), snapshots = [];
  const result = await observeControllerCall(state, { ...identity(), incidentalField: 'not-recorded' }, async () => {
    assert.equal(snapshots[0].dispatchEvidence.records[0].outcome, 'intent');
    assert.equal(dispatchEvidenceSummary(state).workerCalls, null);
    return { payload: 'private-result' };
  }, s => snapshots.push(structuredClone(s)));
  assert.deepEqual(result, { payload: 'private-result' });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].dispatchEvidence.records[0].outcome, 'returned');
  assert.ok(!JSON.stringify(state).includes('private-result'));
  assert.ok(!JSON.stringify(state).includes('not-recorded'));
  assert.equal(dispatchEvidenceSummary(state).workerCalls, 1);
});

test('failed launches count as invocation attempts, not successful model requests', async () => {
  const state = fresh();
  await assert.rejects(observeControllerCall(state, identity(), async () => { throw Error('private-launch-error'); }), /private-launch-error/);
  assert.equal(state.dispatchEvidence.records[0].outcome, 'threw');
  assert.equal(dispatchEvidenceSummary(state).workerCalls, 1);
  assert.equal(dispatchEvidenceSummary(state).actualCostUsd, null);
  assert.ok(!JSON.stringify(state).includes('private-launch-error'));
});

test('save failure prevents launch and leaves unfinished intent unknown', async () => {
  const state = fresh(); let calls = 0;
  await assert.rejects(observeControllerCall(state, identity(), async () => { calls++; }, () => { throw Error('disk'); }), /disk/);
  assert.equal(calls, 0); assert.equal(dispatchEvidenceSummary(state).workerCalls, null);
});

test('completion save failure propagates instead of silently accepting evidence', async () => {
  const state = fresh(); let saves = 0;
  await assert.rejects(observeControllerCall(state, identity(), async () => 'ok', () => {
    if (++saves === 2) throw Error('completion disk');
  }), /completion disk/);
  assert.equal(saves, 2);
});

test('duplicate identity refuses replay before a runner is called', async () => {
  const state = fresh(); await observeControllerCall(state, identity(), async () => 'ok');
  await assert.rejects(observeControllerCall(state, identity(), async () => assert.fail('replayed')), /replayed/);
  assert.equal(state.dispatchEvidence.records.length, 1);
});

test('old state remains incomplete after new calls, never infers missing past work', async () => {
  const state = {}; await observeControllerCall(state, identity(), async () => 'ok');
  assert.equal(state.dispatchEvidence.completeHistory, false);
  assert.equal(dispatchEvidenceSummary(state).workerCalls, null);
});

test('concurrent callbacks are not serialized by telemetry and remain individually recorded', async () => {
  const state = fresh(); let release, started = 0;
  const barrier = new Promise(resolve => { release = resolve; });
  const run = async () => { started++; await barrier; };
  const a = observeControllerCall(state, identity('a'), run);
  const b = observeControllerCall(state, { ...identity('b'), host: 'claude-code' }, run);
  assert.equal(started, 2); assert.equal(dispatchEvidenceSummary(state).activeMs, null);
  release(); await Promise.all([a, b]);
  assert.equal(dispatchEvidenceSummary(state).workerCalls, 2);
});

test('corrupt, partial, reversed or duplicate records never become zero measurements', () => {
  for (const records of [[null], [42], [{ ...interval('a', 0, 10), finishedAt: null }],
    [interval('a', 10, 0)], [interval('a', 0, 10), interval('a', 10, 20)],
    [{ ...interval('a', 0, 10), role: '' }], [{ ...interval('a', 0, 10), id: 1 }],
    [{ ...interval('a', 0, 10), outcome: 'intent' }]]) {
    const state = fresh(); state.dispatchEvidence.records = records;
    assert.equal(dispatchEvidenceSummary(state).workerCalls, null);
    assert.equal(dispatchEvidenceSummary(state).activeMs, null);
  }
});

test('bounded records reject further launches rather than dropping history', async () => {
  const state = fresh(); state.dispatchEvidence.records = Array.from({ length: 1024 }, (_, i) => interval(String(i), 0, 1));
  await assert.rejects(observeControllerCall(state, identity('overflow'), async () => assert.fail('overflow')), /invalid/);
});
