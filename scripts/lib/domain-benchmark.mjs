/** Supplied-data protocol, not a native runner, independent scorer or attestation. */
import { digest, exact, domainPack } from './domain-evidence.mjs';

const hash = /^[a-f0-9]{64}$/;
const id = /^[a-z][a-z0-9-]{0,63}$/;
const arms = ['core', 'core-plus-pack'];
const hosts = ['codex', 'claude-code'];
const counts = ['seriousRegressions', 'reworkRounds', 'humanCorrections'];
const metrics = [...counts, 'costUsd', 'activeMs', 'totalTokens', 'contextTokens'];
/** Anonymous design only: no frozen inputs, preregistration, dispatch or scores. */
export function planDomainPilot() {
  const tasks = [
    { projectId: 'project-a', taskId: 'money-send-reconcile', packId: 'money' },
    { projectId: 'project-b', taskId: 'workflow-exact-export', packId: 'telemedicine-workflow' },
    { projectId: 'project-c', taskId: 'venture-source-admission', packId: 'venture-evidence' },
  ];
  return {
    schemaVersion: 1, state: 'design-not-preregistered', evidenceLevel: 'not-executed',
    authority: 'no model launch, default activation, merge, release or installation',
    tasks: tasks.map(task => ({ ...task, packDigest: domainPack(task.packId).digest,
      sourceDigest: null, taskDigest: null, acceptanceDigest: null, overlayDigest: null })),
    hostPolicies: Object.fromEntries(hosts.map(host => [host, { model: null, policyDigest: null }])),
    budget: { totalTokens: null, contextTokens: null, activeMs: null, costUsd: null },
    coreDigest: null, scorerDigest: null,
    repetitions: 3,
    trials: tasks.flatMap((task, index) => hosts.flatMap(host => Array.from({ length: 3 }, (_, repetition) =>
      ((index + repetition) % 2 ? [...arms].reverse() : [...arms]).map((arm, order) => ({
        taskId: task.taskId, projectId: task.projectId, host, repetition, arm, order,
        status: 'not-executed',
      }))).flat())),
    observations: [],
    requiredBeforeLaunch: ['representative executable hidden holdouts', 'independent frozen scorer',
      'reviewed private source and overlay pins', 'pinned models and policy',
      'measured per-trial and aggregate spend limits', 'verified isolated workspaces and receipts',
      'explicit native-host launch approval'],
    qualityUplift: null,
  };
}
function pin(value) { if (typeof value !== 'string' || !hash.test(value)) throw Error('exact digest required'); }
function identifier(value) { if (typeof value !== 'string' || !id.test(value)) throw Error('bounded identifier required'); }
function number(value, integer = false) {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw Error('nonnegative measured metric required; unavailable is null');
}

export function preregisterDomainPilot(input) {
  exact(input, ['coreDigest', 'taskSet', 'hostPolicies', 'budget', 'repetitions', 'scorerDigest']);
  pin(input.coreDigest); pin(input.scorerDigest);
  exact(input.budget, ['totalTokens', 'contextTokens', 'activeMs', 'costUsd']);
  for (const [key, value] of Object.entries(input.budget)) {
    number(value, key !== 'costUsd');
    if (value <= 0) throw Error('positive shared budget required');
  }
  if (input.budget.contextTokens > input.budget.totalTokens) throw Error('context exceeds total budget');
  if (!Number.isSafeInteger(input.repetitions) || input.repetitions < 3 || input.repetitions > 10) throw Error('repetitions must be 3..10');
  exact(input.hostPolicies, hosts);
  for (const host of hosts) {
    exact(input.hostPolicies[host], ['model', 'policyDigest']);
    if (typeof input.hostPolicies[host].model !== 'string' || !input.hostPolicies[host].model.trim() || input.hostPolicies[host].model.length > 128) throw Error('pinned host model required');
    pin(input.hostPolicies[host].policyDigest);
  }
  if (!Array.isArray(input.taskSet) || input.taskSet.length < 1 || input.taskSet.length > 100) throw Error('bounded frozen tasks required');
  const seen = new Set();
  for (const task of input.taskSet) {
    exact(task, ['taskId', 'projectId', 'lineageId', 'packId', 'packDigest', 'sourceDigest', 'taskDigest', 'acceptanceDigest', 'overlayDigest']);
    for (const key of ['taskId', 'projectId', 'lineageId']) identifier(task[key]);
    for (const key of ['packDigest', 'sourceDigest', 'taskDigest', 'acceptanceDigest', 'overlayDigest']) pin(task[key]);
    if (seen.has(task.taskId) || domainPack(task.packId).digest !== task.packDigest) throw Error('duplicate task or changed pack');
    seen.add(task.taskId);
  }
  const blocks = input.taskSet.flatMap((task, index) => hosts.flatMap(host => Array.from({ length: input.repetitions }, (_, repetition) => ({
    taskId: task.taskId, host, repetition, order: (index + repetition) % 2 ? [...arms].reverse() : [...arms],
  }))));
  const protocol = { schemaVersion: 1, ...structuredClone(input), blocks,
    evidenceLevel: 'preregistered-not-executed', unitOfAnalysis: 'task clusters with shared source lineage; repetitions are not independent projects',
    authority: 'no launch, promotion, activation, merge or release approval',
    safety: 'same mandatory reviewers, permissions and gate floors; isolated workspaces; no production targets',
    scoring: 'independent scorer and hidden acceptance checks frozen before first trial; never repair using holdout answers',
    stopping: 'preserve every planned arm including launch failures, refusals and incomplete trials; no replacement sampling' };
  return { ...protocol, digest: digest(protocol) };
}

export function describeDomainPilot(protocol, observations) {
  const { digest: protocolDigest, ...body } = protocol || {};
  if (digest(body) !== protocolDigest) throw Error('protocol changed after preregistration');
  // Revalidate its schema and generated blocks, rather than trusting a supplied self-hash.
  const input = Object.fromEntries(['coreDigest', 'taskSet', 'hostPolicies', 'budget', 'repetitions', 'scorerDigest'].map(k => [k, body[k]]));
  if (preregisterDomainPilot(input).digest !== protocolDigest) throw Error('noncanonical protocol');
  if (!Array.isArray(observations) || observations.length > protocol.blocks.length * 2) throw Error('bounded observations required');
  const groups = new Map(), runIds = new Set(), workspaceIds = new Set();
  for (const row of observations) {
    exact(row, ['protocolDigest', 'taskId', 'host', 'repetition', 'arm', 'coreDigest', 'packDigest', 'overlayDigest', 'sourceDigest', 'taskDigest', 'acceptanceDigest', 'policyDigest', 'scorerDigest', 'budgetDigest', 'runId', 'workspaceId', 'receiptDigest', 'status', 'accepted', ...metrics]);
    const block = protocol.blocks.find(b => b.taskId === row.taskId && b.host === row.host && b.repetition === row.repetition);
    const task = protocol.taskSet.find(t => t.taskId === row.taskId);
    if (!block || !arms.includes(row.arm) || row.protocolDigest !== protocolDigest || row.coreDigest !== protocol.coreDigest
      || row.policyDigest !== protocol.hostPolicies[row.host].policyDigest || row.scorerDigest !== protocol.scorerDigest
      || row.budgetDigest !== digest(protocol.budget) || ['sourceDigest', 'taskDigest', 'acceptanceDigest'].some(k => row[k] !== task[k])
      || row.packDigest !== (row.arm === 'core' ? null : task.packDigest)
      || row.overlayDigest !== (row.arm === 'core' ? null : task.overlayDigest)) throw Error('unmatched trial binding');
    identifier(row.runId); identifier(row.workspaceId); pin(row.receiptDigest);
    if (runIds.has(row.runId) || workspaceIds.has(row.workspaceId)) throw Error('trial run and workspace must be isolated and unique');
    runIds.add(row.runId); workspaceIds.add(row.workspaceId);
    if (!['completed', 'failed', 'blocked', 'unassessed'].includes(row.status)
      || (row.status === 'completed' ? typeof row.accepted !== 'boolean' : row.accepted !== null)) throw Error('unknown acceptance must be null');
    for (const key of metrics) if (row[key] !== null) number(row[key], key !== 'costUsd');
    if (row.contextTokens !== null && row.totalTokens !== null && row.contextTokens > row.totalTokens) throw Error('context tokens exceed total measured tokens');
    if (row.accepted === true && row.seriousRegressions !== 0) throw Error('accepted task requires measured zero serious regressions');
    if (['activeMs', 'costUsd', 'totalTokens', 'contextTokens'].some(k => row[k] !== null && row[k] > protocol.budget[k])) {
      if (row.accepted === true) throw Error('over-budget task cannot be accepted');
    }
    const key = `${row.taskId}:${row.host}:${row.repetition}`, group = groups.get(key) || {};
    if (group[row.arm]) throw Error('duplicate arm');
    group[row.arm] = row; groups.set(key, group);
  }
  const byHost = Object.fromEntries(hosts.map(host => {
    const planned = protocol.blocks.filter(b => b.host === host);
    const paired = planned.map(b => groups.get(`${b.taskId}:${host}:${b.repetition}`))
      .filter(g => arms.every(arm => g?.[arm]?.status === 'completed'));
    const perArm = Object.fromEntries(arms.map(arm => {
      const rows = observations.filter(r => r.host === host && r.arm === arm);
      const accepted = rows.filter(r => r.accepted === true).length;
      const budgetKeys = ['activeMs', 'costUsd', 'totalTokens', 'contextTokens'];
      const compliance = r => budgetKeys.some(k => r[k] !== null && r[k] > protocol.budget[k]) ? 'exceeded'
        : budgetKeys.every(k => r[k] !== null) ? 'within-measured-caps' : 'unknown';
      const budgetMeasured = rows.length === planned.length && rows.every(r => compliance(r) !== 'unknown');
      const allMeasuredCost = rows.length === planned.length && rows.every(r => r.costUsd !== null);
      return [arm, { planned: planned.length, observed: rows.length, accepted,
        acceptanceSemantics: 'raw supplied outcome; not independently attested or automatically budget-qualified',
        budgetCompliance: Object.fromEntries(['within-measured-caps', 'exceeded', 'unknown'].map(s => [s, rows.filter(r => compliance(r) === s).length])),
        budgetQualifiedAcceptanceSuccess: budgetMeasured && rows.every(r => r.accepted !== null)
          ? rows.filter(r => r.accepted === true && compliance(r) === 'within-measured-caps').length / planned.length : null,
        acceptanceSuccess: rows.length === planned.length && rows.every(r => r.accepted !== null) ? accepted / planned.length : null,
        knownAcceptedFractionOfPlanned: accepted / planned.length,
        statusCounts: Object.fromEntries(['completed', 'failed', 'blocked', 'unassessed'].map(s => [s, rows.filter(r => r.status === s).length])),
        costPerAcceptedTask: allMeasuredCost && accepted ? rows.reduce((sum, r) => sum + r.costUsd, 0) / accepted : null,
        totals: Object.fromEntries(metrics.map(m => [m, { measured: rows.filter(r => r[m] !== null).length,
          total: rows.length === planned.length && rows.every(r => r[m] !== null) ? rows.reduce((sum, r) => sum + r[m], 0) : null }])) }];
    }));
    return [host, { perArm, completedPairs: paired.length, incompletePairs: planned.length - paired.length,
      pairedAcceptanceDifference: paired.length ? paired.reduce((sum, g) => sum + Number(g['core-plus-pack'].accepted) - Number(g.core.accepted), 0) / paired.length : null }];
  }));
  return { evidenceLevel: 'supplied-receipts-not-runtime-attested', byHost,
    taskClusters: protocol.taskSet.length, declaredSourceLineages: new Set(protocol.taskSet.map(t => t.lineageId)).size,
    qualityUpliftPercent: null, defaultEnablementAllowed: false, clinicalClaimsAllowed: false,
    inference: 'descriptive supplied-data only; receipt hashes are not independent scorer attestations; no causal quality or significance claim' };
}
