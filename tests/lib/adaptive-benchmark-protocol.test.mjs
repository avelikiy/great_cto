import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preregisterBenchmark, describeMatchedObservations, scenarios } from '../../scripts/lib/adaptive-benchmark-protocol.mjs';

function plan() {
  return preregisterBenchmark({ artifacts: {
    legacy: { commit: 'a'.repeat(40), artifactSha256: 'a'.repeat(64) },
    adaptive: { commit: 'b'.repeat(40), artifactSha256: 'b'.repeat(64) } },
    policies: { legacy: { gates: 'strict' }, adaptive: { gates: 'adaptive' } }, hostModelPolicy: 'same pinned role/model assignments' });
}
function observation(p, arm, extra = {}) {
  const block = p.blocks[0];
  return { task: block.task, repetition: block.repetition, arm, protocolDigest: p.digest,
    specificationDigest: block.specificationDigest, acceptanceDigest: block.acceptanceDigest,
    artifactSha256: p.artifacts[arm].artifactSha256, status: 'completed', accepted: true,
    activeMs: 100, workerCalls: 4, verifierCalls: 4, humanPauses: 2, actionableFindings: 1,
    escapedDefects: 0, actualCostUsd: null, ...extra };
}

test('protocol covers eight distinct task clusters and counterbalances matched arm order', () => {
  const p = plan(); assert.equal(scenarios.length, 8); assert.equal(new Set(scenarios.map(s => s.cluster)).size, 8);
  assert.equal(p.blocks.length, 24); assert.deepEqual(p.blocks[0].order, ['legacy', 'adaptive']);
  assert.deepEqual(p.blocks[1].order, ['adaptive', 'legacy']);
  assert.equal(p.status, 'preregistered-not-run-ready'); assert.match(p.gates, /actual operator approvals/);
});
test('no observations gives null quality and cost, never zero or readiness', () => {
  const s = describeMatchedObservations(plan(), []);
  assert.equal(s.completedPairs, 0); assert.equal(s.incompleteBlocks, 24);
  assert.deepEqual(s.pairedAcceptance, { legacy: null, adaptive: null });
  assert.equal(s.differences.actualCostUsd.meanAdaptiveMinusLegacy, null);
  assert.equal(s.qualityUpliftPercent, null); assert.equal(s.defaultEnablementAllowed, false);
});
test('matched completed pair has descriptive differences, not attested quality uplift', () => {
  const p = plan(), s = describeMatchedObservations(p, [observation(p, 'legacy'), observation(p, 'adaptive', { workerCalls: 2, accepted: false })]);
  assert.equal(s.completedPairs, 1); assert.equal(s.differences.workerCalls.meanAdaptiveMinusLegacy, -2);
  assert.deepEqual(s.pairedAcceptance, { legacy: 1, adaptive: 0 });
  assert.equal(s.differences.actualCostUsd.pairedMeasured, 0);
  assert.equal(s.qualityUpliftPercent, null); assert.match(s.evidenceLevel, /not-runtime-attested/);
});
for (const status of ['blocked', 'failed', 'unassessed']) {
  test(`${status} arm does not become a completed failure or zero score`, () => {
    const p = plan(), s = describeMatchedObservations(p, [observation(p, 'legacy'), observation(p, 'adaptive', { status, accepted: null })]);
    assert.equal(s.completedPairs, 0); assert.equal(s.pairedAcceptance.adaptive, null); assert.equal(s.incompleteBlocks, 24);
    assert.throws(() => describeMatchedObservations(p, [observation(p, 'adaptive', { status, accepted: false })]), /acceptance must be null/);
  });
}
for (const field of ['protocolDigest', 'specificationDigest', 'acceptanceDigest', 'artifactSha256', 'task', 'repetition']) {
  test(`changed ${field} refuses cross-protocol pairing`, () => {
    const p = plan(); assert.throws(() => describeMatchedObservations(p, [observation(p, 'legacy', { [field]: 'different' })]), /identity/);
  });
}
test('duplicate observations and post-hoc corpus edits are refused', () => {
  const p = plan(), r = observation(p, 'legacy');
  assert.throws(() => describeMatchedObservations(p, [r, r]), /duplicate/);
  p.blocks[0].acceptanceDigest = 'changed';
  assert.throws(() => describeMatchedObservations(p, []), /preregistration changed/);
});
test('missing/negative/NaN metrics cannot masquerade as unavailable or measured', () => {
  const p = plan();
  for (const workerCalls of [undefined, -1, NaN, 1.5]) assert.throws(() => describeMatchedObservations(p, [observation(p, 'legacy', { workerCalls })]));
  const s = describeMatchedObservations(p, [observation(p, 'legacy'), observation(p, 'adaptive', { workerCalls: null })]);
  assert.equal(s.differences.workerCalls.pairedMeasured, 0);
});
test('unconfigured artifact/model policy and undersized repetitions are refused', () => {
  assert.throws(() => preregisterBenchmark({}), /host\/model/);
  assert.throws(() => preregisterBenchmark({ hostModelPolicy: 'matched' }), /artifact pins/);
  assert.throws(() => preregisterBenchmark({ repetitions: 1 }), /repetitions/);
});
