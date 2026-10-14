import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest, domainPack } from '../../scripts/lib/domain-evidence.mjs';
import { preregisterDomainPilot, describeDomainPilot } from '../../scripts/lib/domain-benchmark.mjs';
import { domainBenchmark } from '../../scripts/domain-benchmark.mjs';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const h = 'a'.repeat(64);
test('inconsistent known context and total tokens are refused', () => {
  const p = preregisterDomainPilot(input());
  assert.throws(() => describeDomainPilot(p, [row(p, 'core', 0, { contextTokens: 1500, totalTokens: 1000 })]), /context tokens exceed/);
  assert.doesNotThrow(() => describeDomainPilot(p, [row(p, 'core', 0, { contextTokens: null, totalTokens: 1000 })]));
});
test('raw acceptance with missing metrics is never budget-qualified', () => {
  const p = preregisterDomainPilot(input());
  const rows = [0, 1, 2].map(i => row(p, 'core', i, { totalTokens: null }));
  const result = describeDomainPilot(p, rows).byHost.codex.perArm.core;
  assert.equal(result.acceptanceSuccess, 1);
  assert.equal(result.budgetQualifiedAcceptanceSuccess, null);
  assert.equal(result.budgetCompliance.unknown, 3);
  assert.equal(describeDomainPilot(p, [0, 1, 2].map(i => row(p, 'core', i))).byHost.codex.perArm.core.budgetQualifiedAcceptanceSuccess, 1);
});
function input() {
  return { coreDigest: h, scorerDigest: h, repetitions: 3, budget: { totalTokens: 10000, contextTokens: 2000, activeMs: 60000, costUsd: 5 },
    hostPolicies: { codex: { model: 'fixed-codex', policyDigest: h }, 'claude-code': { model: 'fixed-claude', policyDigest: h } },
    taskSet: [{ taskId: 'task-a', projectId: 'project-a', lineageId: 'family-a', packId: 'money', packDigest: domainPack('money').digest,
      sourceDigest: h, taskDigest: h, acceptanceDigest: h, overlayDigest: h }] };
}
function row(p, arm, repetition = 0, extra = {}) {
  const t = p.taskSet[0];
  return { protocolDigest: p.digest, taskId: t.taskId, host: 'codex', repetition, arm, coreDigest: h,
    packDigest: arm === 'core' ? null : t.packDigest, overlayDigest: arm === 'core' ? null : t.overlayDigest,
    sourceDigest: h, taskDigest: h, acceptanceDigest: h, policyDigest: h, scorerDigest: h, budgetDigest: digest(p.budget),
    runId: `run-${arm}-${repetition}`, workspaceId: `space-${arm}-${repetition}`, receiptDigest: h,
    status: 'completed', accepted: true, seriousRegressions: 0, reworkRounds: 0, humanCorrections: 0, costUsd: 1, activeMs: 100,
    totalTokens: 1000, contextTokens: 100, ...extra };
}
test('two host policies and counterbalanced order, no claim of execution', () => {
  const p = preregisterDomainPilot(input()); assert.equal(p.blocks.length, 6);
  assert.deepEqual(p.blocks[0].order, ['core', 'core-plus-pack']);
  assert.deepEqual(p.blocks[1].order, ['core-plus-pack', 'core']);
  assert.equal(p.evidenceLevel, 'preregistered-not-executed');
});
test('empty observations retain null costs, acceptance and quality', () => {
  const s = describeDomainPilot(preregisterDomainPilot(input()), []);
  assert.equal(s.byHost.codex.incompletePairs, 3); assert.equal(s.byHost.codex.perArm.core.acceptanceSuccess, null);
  assert.equal(s.byHost.codex.perArm.core.costPerAcceptedTask, null); assert.equal(s.qualityUpliftPercent, null);
});
test('partial pair differences stay descriptive, missing rows not zero successes', () => {
  const p = preregisterDomainPilot(input());
  const s = describeDomainPilot(p, [row(p, 'core'), row(p, 'core-plus-pack', 0, { accepted: false, seriousRegressions: 1 })]);
  assert.equal(s.byHost.codex.completedPairs, 1); assert.equal(s.byHost.codex.pairedAcceptanceDifference, -1);
  assert.equal(s.byHost.codex.perArm.core.acceptanceSuccess, null); assert.equal(s.defaultEnablementAllowed, false);
});
test('cost per accepted task includes rejected trial costs, not successful-trial cost alone', () => {
  const p = preregisterDomainPilot(input());
  const rows = [0, 1, 2].map(i => row(p, 'core', i, { accepted: i === 0, costUsd: i + 1 }));
  const s = describeDomainPilot(p, rows).byHost.codex.perArm.core;
  assert.equal(s.costPerAcceptedTask, 6); assert.equal(s.acceptanceSuccess, 1 / 3);
});
for (const status of ['failed', 'blocked', 'unassessed']) {
  test(`preserve ${status}, unknown acceptance and missing cost`, () => {
    const p = preregisterDomainPilot(input()), r = row(p, 'core', 0, { status, accepted: null, costUsd: null });
    const s = describeDomainPilot(p, [r]).byHost.codex;
    assert.equal(s.perArm.core.statusCounts[status], 1); assert.equal(s.perArm.core.acceptanceSuccess, null);
    assert.equal(s.perArm.core.costPerAcceptedTask, null);
    assert.throws(() => describeDomainPilot(p, [{ ...r, accepted: false }]));
  });
}
for (const key of ['protocolDigest', 'taskDigest', 'sourceDigest', 'acceptanceDigest', 'coreDigest', 'packDigest', 'overlayDigest', 'policyDigest', 'scorerDigest', 'budgetDigest']) {
  test(`reject unmatched ${key}`, () => {
    const p = preregisterDomainPilot(input());
    assert.throws(() => describeDomainPilot(p, [row(p, 'core-plus-pack', 0, { [key]: 'b'.repeat(64) })]));
  });
}
test('duplicate arm, shared workspace or run, and post-hoc policy edits rejected', () => {
  const p = preregisterDomainPilot(input()), a = row(p, 'core'), b = row(p, 'core-plus-pack');
  assert.throws(() => describeDomainPilot(p, [a, a]));
  assert.throws(() => describeDomainPilot(p, [a, { ...b, workspaceId: a.workspaceId }]));
  assert.throws(() => describeDomainPilot(p, [a, { ...b, runId: a.runId }]));
  p.budget.costUsd = 10; assert.throws(() => describeDomainPilot(p, []));
});
test('serious regressions and unmeasured safety cannot be accepted', () => {
  const p = preregisterDomainPilot(input());
  for (const seriousRegressions of [1, null, undefined, NaN, -1, 1.5]) assert.throws(() => describeDomainPilot(p, [row(p, 'core', 0, { seriousRegressions })]));
});
test('over-budget success rejected for time, spend and tokens', () => {
  const p = preregisterDomainPilot(input());
  for (const key of ['activeMs', 'costUsd', 'totalTokens', 'contextTokens']) assert.throws(() => describeDomainPilot(p, [row(p, 'core', 0, { [key]: p.budget[key] + 1 })]));
  assert.throws(() => describeDomainPilot(p, [row(p, 'core', 0, { costUsd: undefined })]));
});
test('lineage is not counted as independent project confirmations', () => {
  const i = input(); i.taskSet.push({ ...i.taskSet[0], taskId: 'task-b', projectId: 'project-fork' });
  const s = describeDomainPilot(preregisterDomainPilot(i), []);
  assert.equal(s.taskClusters, 2); assert.equal(s.declaredSourceLineages, 1);
});
test('developer benchmark CLI round trips explicit files without launching hosts', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'domain-benchmark-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'input.json'), protocol = join(dir, 'protocol.json'), observations = join(dir, 'observations.json');
  writeFileSync(source, JSON.stringify(input()));
  const p = domainBenchmark(['preregister', source]);
  writeFileSync(protocol, JSON.stringify(p)); writeFileSync(observations, '[]');
  assert.equal(domainBenchmark(['describe', protocol, observations]).qualityUpliftPercent, null);
  assert.throws(() => domainBenchmark(['run', source]), /usage/);
});
test('preregistration refuses undersized repetitions, changed packs and undefined authority fields', () => {
  for (const change of [i => { i.repetitions = 1; }, i => { i.budget.contextTokens = 20000; }, i => { i.permissions = ['Bash']; },
    i => { i.taskSet[0].packDigest = h; }, i => { i.hostPolicies.codex.model = ''; }, i => { i.budget.costUsd = null; }]) {
    const i = input(); change(i); assert.throws(() => preregisterDomainPilot(i));
  }
});
