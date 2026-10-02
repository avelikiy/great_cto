/** Matched experiment contract and descriptive supplied-data checks, not a runner. */
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const arms = ['legacy', 'adaptive'];
const metrics = ['activeMs', 'workerCalls', 'verifierCalls', 'humanPauses', 'actionableFindings', 'escapedDefects', 'actualCostUsd'];
export const scenarios = [
  { id: 'docs-low-risk', cluster: 'content', tier: 'T0', task: 'Repair broken internal documentation links without code/config changes', checks: ['all target links resolve', 'no source/config drift'] },
  { id: 'tenant-auth', cluster: 'identity', tier: 'T2', task: 'Fix cross-tenant object access and preserve valid tenant access', checks: ['cross-tenant deny', 'owner allow', 'unauthenticated deny', 'audit without secrets'] },
  { id: 'billing-webhook', cluster: 'commerce', tier: 'T2', task: 'Make signed billing webhooks idempotent under duplicate and out-of-order delivery', checks: ['signature refusal', 'duplicate no-op', 'out-of-order reconciliation', 'no double charge'] },
  { id: 'bounded-import', cluster: 'data', tier: 'T2', task: 'Implement dry-run import with validation, bounded history and rollback', checks: ['invalid data refused', 'dry run no mutation', 'bounded replacement', 'repeat import idempotent'] },
  { id: 'prompt-injection', cluster: 'ai', tier: 'T2', task: 'Preserve citations and prevent retrieved text from changing tool authority', checks: ['injection rejected', 'supported citations', 'uncertainty retained', 'cross-user isolation'] },
  { id: 'api-compatibility', cluster: 'platform', tier: 'T1', task: 'Add an optional API field while preserving older clients and explicit errors', checks: ['old client preserved', 'schema validation', 'no silent default on missing source'] },
  { id: 'migration-safety', cluster: 'storage', tier: 'T2', task: 'Plan a backward-compatible schema change with concurrent readers and rollback', checks: ['rollback path', 'reader compatibility', 'bounded locks', 'least privilege'] },
  { id: 'board-accessibility', cluster: 'ui', tier: 'T1', task: 'Repair keyboard navigation and narrow-screen layout without losing decision controls', checks: ['keyboard destinations', 'no horizontal overflow', 'decision target preserved', 'no console error'] },
];

/** Both exact policies/artifacts and corpus must be pinned before observations. */
export function preregisterBenchmark({ artifacts, policies, repetitions = 3, hostModelPolicy }) {
  if (!Number.isInteger(repetitions) || repetitions < 3 || repetitions > 10) throw Error('repetitions must be 3..10');
  if (typeof hostModelPolicy !== 'string' || !hostModelPolicy.trim()) throw Error('explicit matched host/model policy required');
  for (const arm of arms) {
    if (!/^[a-f0-9]{40}$/.test(artifacts?.[arm]?.commit || '') || !/^[a-f0-9]{64}$/.test(artifacts?.[arm]?.artifactSha256 || '')) throw Error('exact artifact pins required for both arms');
    if (!policies?.[arm] || typeof policies[arm] !== 'object' || Array.isArray(policies[arm])) throw Error('both full execution policies required');
  }
  if (JSON.stringify(artifacts.legacy) === JSON.stringify(artifacts.adaptive) && JSON.stringify(policies.legacy) === JSON.stringify(policies.adaptive)) throw Error('identical arms are not an adaptive comparison');
  const blocks = scenarios.flatMap((scenario, index) => Array.from({ length: repetitions }, (_, repetition) => ({
    task: scenario.id, cluster: scenario.cluster, repetition, order: (index + repetition) % 2 ? ['adaptive', 'legacy'] : ['legacy', 'adaptive'],
    specificationDigest: hash(scenario), acceptanceDigest: hash(scenario.checks),
  })));
  const contract = { version: 1, kind: 'matched full-workflow preregistration', artifacts, policies, hostModelPolicy,
    scenarios, repetitions, blocks, metrics, unitOfAnalysis: 'task cluster, not individual assertion or agent call',
    gates: 'actual operator approvals required; never infer approval from exit zero or test fixture',
    safety: 'same mandatory domain/security/compliance floors in both arms; no production targets',
    stopping: 'record launch failures, incomplete runs and gates; no silent replacement of unsuccessful trials',
    hiddenChecks: 'outside workers; fixed before first call; never fed back into repair prompts',
    status: 'preregistered-not-run-ready', remaining: 'representative fixtures, independent scorer and attested controller observation collector' };
  return { ...contract, digest: hash(contract) };
}

/** Validate observations without pretending supplied numbers are runtime attestation. */
export function describeMatchedObservations(protocol, observations) {
  const { digest, ...contract } = protocol || {};
  if (!digest || hash(contract) !== digest) throw Error('preregistration changed');
  if (!Array.isArray(observations)) throw Error('observations must be an array');
  const groups = new Map();
  for (const row of observations) {
    const block = protocol.blocks.find(b => b.task === row.task && b.repetition === row.repetition);
    if (!block || !arms.includes(row.arm) || row.protocolDigest !== digest
      || row.specificationDigest !== block.specificationDigest || row.acceptanceDigest !== block.acceptanceDigest
      || row.artifactSha256 !== protocol.artifacts[row.arm].artifactSha256) throw Error('unmatched observation identity');
    const key = `${row.task}:${row.repetition}`;
    const group = groups.get(key) || {};
    if (group[row.arm]) throw Error('duplicate arm observation');
    if (!['completed', 'blocked', 'failed', 'unassessed'].includes(row.status)) throw Error('invalid observation status');
    if (row.status === 'completed' ? typeof row.accepted !== 'boolean' : row.accepted !== null) throw Error('unassessed acceptance must be null');
    for (const metric of metrics) {
      if (row[metric] !== null && (!Number.isFinite(row[metric]) || row[metric] < 0)) throw Error('unavailable metric must be null, never fabricated zero');
      if (row[metric] !== null && metric !== 'activeMs' && metric !== 'actualCostUsd' && !Number.isInteger(row[metric])) throw Error('count metric must be integral');
    }
    group[row.arm] = row; groups.set(key, group);
  }
  const paired = [...groups.values()].filter(g => arms.every(a => g[a]?.status === 'completed'));
  const differences = Object.fromEntries(metrics.map(metric => {
    const measured = paired.filter(g => arms.every(a => g[a][metric] !== null));
    return [metric, { pairedMeasured: measured.length, meanAdaptiveMinusLegacy: measured.length
      ? measured.reduce((sum, g) => sum + g.adaptive[metric] - g.legacy[metric], 0) / measured.length : null }];
  }));
  return { evidenceLevel: 'supplied-observations-not-runtime-attested', plannedBlocks: protocol.blocks.length,
    observedRows: observations.length, completedPairs: paired.length,
    incompleteBlocks: protocol.blocks.length - paired.length,
    pairedAcceptance: Object.fromEntries(arms.map(a => [a, paired.length ? paired.filter(g => g[a].accepted).length / paired.length : null])),
    differences, qualityUpliftPercent: null, defaultEnablementAllowed: false,
    inference: 'descriptive only; no significance or product-quality conclusion without independent evidence and task-cluster uncertainty' };
}
