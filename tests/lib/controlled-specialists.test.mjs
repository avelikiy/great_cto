import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { newRun, runStage, runParallelWave, approve, advance } from '../../scripts/lib/codex-pipeline.mjs';
import { assertSpecialistEpoch } from '../../scripts/lib/controlled-specialists.mjs';
import { codexRoleProfile } from '../../scripts/lib/codex-role-profiles.mjs';
import { REVIEWERS_BY_ARCHETYPE, PACK_REVIEWERS, COMPLIANCE_REVIEWERS } from '../../scripts/lib/required-reviewers.mjs';
import { assertBenchmarkReviewDispatches } from '../../scripts/lib/benchmark-review-dispatch.mjs';

function fixture(t, archetype = 'fintech', policy = true) {
  const root = mkdtempSync(join(tmpdir(), 'controlled-specialists-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  put('.great_cto/PROJECT.md', `archetype: ${archetype}\n`); put('src/ui.ts', 'v1');
  const pluginRoot = join(root, 'plugin'); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), readFileSync(new URL('../../shared/pipeline.toml', import.meta.url)));
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  put('src/ui.ts', 'v2');
  const args = { root, pluginRoot, prompt: 'Review existing change', entry: 'senior-dev', allowed: ['src', 'docs'],
    specialistPolicy: policy ? { mode: 'adaptive', workflow: 'existing-change', base } : null };
  return { root, put, args, state: newRun(args) };
}
const verify = async () => ({ state: 'verified', findings: [], checks: ['read actual bytes'] });

test('static UI contract refuses existing-change and stays before implementation in phased workflow', async t => {
  const f = fixture(t, 'web-service', false); f.put('src/board.html', '<button>Decision</button>');
  const policy = { mode: 'adaptive', workflow: 'existing-change', base: f.args.specialistPolicy?.base || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim() };
  assert.throws(() => newRun({ ...f.args, specialistPolicy: policy }), /design-advisor requires a separate contract/);
  const state = newRun({ ...f.args, specialistPolicy: { ...policy, workflow: 'phased-change' } });
  assert.ok(state.specialistPreparation.selected.includes('design-advisor'));
  assert.ok(state.queue.includes('design-advisor-prebuild')); assert.ok(!state.queue.includes('senior-dev'));
  assert.equal(state.specialistStages['design-advisor-prebuild'].phase, 'contract');
  await runStage(state, { execute: async () => reply('design-advisor', [{ path: 'docs/specialist-contracts/DESIGN-ui.md', before: null, content: 'Keyboard/reflow contract' }]), verify });
  assert.equal(state.status, 'awaiting-gate', state.reason); assert.ok(state.specialistPreparation.hardGates.includes('gate:plan'));
  assert.equal(state.attempts[0].role, 'design-advisor-prebuild'); assert.equal(state.approvals.length, 0);
  assert.equal(state.results['senior-dev'], undefined); assertSpecialistEpoch(state);
});
function reply(role, files = []) {
  return { state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'Inspected', files,
    meta: ['senior-dev', 'code-reviewer'].includes(role) ? {} : { report: files[0]?.path } }) };
}
async function implement(state) { return runStage(state, { execute: async () => reply('senior-dev'), verify }); }
test('resumed adaptive controller blocks mutated verdict exits before any dispatch or approval', t => {
  const f = fixture(t);
  f.state.graph['qa-engineer.DONE'] = { on: ['DONE'], next: ['devops'] };
  advance(f.state);
  assert.equal(f.state.status, 'blocked');
  assert.match(f.state.reason, /review floor: verdict override/);
  assert.equal(f.state.attempts.length, 0);
  assert.equal(f.state.approvals.length, 0);
});
test('pending approval cannot release a review boundary altered after the gate was raised', async t => {
  const f = fixture(t); await implement(f.state);
  assert.equal(f.state.status, 'awaiting-gate');
  const token = f.state.pending.token;
  f.state.graph['qa-engineer'].next.push('l3-support');
  assert.throws(() => approve(f.state, token), /review floor: unsafe exit/);
  assert.equal(f.state.pending.token, token);
  assert.equal(f.state.approvals.length, 0);
  assert.equal(f.state.results.devops, undefined);
});
async function review(state) {
  const role = state.queue[0]; const path = `docs/specialist-reviews/${role}.md`;
  return runStage(state, { execute: async () => reply(role, [{ path, before: null, content: `${role}: actual findings` }]), verify });
}

async function scopedPrior(t) {
  const f = fixture(t);
  const policy = { ...f.args.specialistPolicy, reviewReuse: { scopes: { 'pci-reviewer': ['src/ui.ts'] } } };
  f.state = newRun({ ...f.args, specialistPolicy: policy });
  await implement(f.state); approve(f.state, f.state.pending.token);
  while (f.state.queue[0] !== 'pci-reviewer') await review(f.state);
  const role = 'pci-reviewer', path = 'docs/specialist-reviews/pci-original.md';
  await runStage(f.state, { execute: async () => reply(role, [{ path, before: null, content: 'PCI boundary findings for current source' }]),
    verify: async state => ({ state: 'verified', findings: [], checks: ['inspected actual source/report'],
      dependencyAttestation: { state: 'complete', inputDigest: state.attempts.at(-1).scopedInput.digest,
        checks: ['inspected imports/config/project inventory for PCI scope'] } }) });
  assert.ok(f.state.results[role].scopedReview);
  const outside = mkdtempSync(join(tmpdir(), 'scoped-controller-state-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const source = join(outside, 'prior.json'), raw = JSON.stringify(f.state); writeFileSync(source, raw);
  const args = { ...f.args, specialistPolicy: { ...policy, reviewReuse: { ...policy.reviewReuse,
    sources: { [role]: { path: source, sha256: createHash('sha256').update(raw).digest('hex') } } } } };
  const next = newRun(args);
  await implement(next); approve(next, next.pending.token);
  while (next.queue[0] !== role) {
    const current = next.queue[0], report = `docs/specialist-reviews/${current}-next.md`;
    await runStage(next, { execute: async () => reply(current, [{ path: report, before: null, content: 'Fresh mandatory review' }]), verify });
    assert.equal(next.status, 'ready', next.reason);
    assert.equal(next.results[next.attempts.at(-1).role].reuse, undefined, 'mandatory quorum is freshly executed');
  }
  return { ...f, next, args, role };
}

test('operator-pinned scoped report skips only domain worker; fresh verifier and current gate quorum remain', async t => {
  const f = await scopedPrior(t); let workers = 0, verifiers = 0;
  const before = f.next.dispatchEvidence.records.length;
  await runStage(f.next, { execute: async () => { workers++; throw Error('domain worker must not launch'); },
    verify: async state => { verifiers++; return { state: 'verified', findings: [], checks: ['read current source and copied actual report'],
      dependencyAttestation: { state: 'complete', inputDigest: state.attempts.at(-1).scopedInput.digest,
        checks: ['fresh dependency closure and current task inspection'] } }; } });
  assert.equal(workers, 0); assert.equal(verifiers, 1);
  assert.deepEqual(f.next.dispatchEvidence.records.slice(before).map(r => r.kind), ['verifier']);
  assert.equal(f.next.results[f.role].reuse.runId, f.state.id);
  assert.equal(f.next.results[f.role].scopedReview, undefined, 'reused result cannot mint recursive reuse');
  assert.notEqual(f.next.results[f.role].digest, f.state.results[f.role].digest);
  assert.equal(assertBenchmarkReviewDispatches(f.next, [f.role]).providerExecutionVerified, false);
  const corrupt = structuredClone(f.next);
  delete corrupt.attempts.at(-1).verification.dependencyAttestation;
  corrupt.results[f.role].verification = corrupt.attempts.at(-1).verification;
  assert.throws(() => assertBenchmarkReviewDispatches(corrupt, [f.role]), /reuse lacks fresh scoped attestation/);
  assert.equal(f.next.pending, null, 'unrun regulated reviewer still blocks gate');
  await review(f.next);
  assert.equal(f.next.status, 'awaiting-gate'); assert.ok(f.next.pending.gates.includes('gate:ship'));
  assert.ok(!f.next.approvals.some(a => a.gate === 'gate:ship'));
});

test('plain verified on reused report cannot approve; rework invalidates implementation quorum', async t => {
  const f = await scopedPrior(t);
  await runStage(f.next, { execute: async () => { throw Error('worker should not launch'); }, verify });
  assert.equal(f.next.queue[0], 'senior-dev'); assert.equal(f.next.status, 'ready');
  assert.equal(f.next.results[f.role], undefined); assert.equal(f.next.pending, null);
  assert.equal(f.next.approvals.length, 0); assert.match(f.next.rework.findings[0], /lacks fresh complete/);
});

test('edited operator pin falls back to a full fresh domain worker with audit reason', async t => {
  const f = await scopedPrior(t);
  writeFileSync(f.args.specialistPolicy.reviewReuse.sources[f.role].path, '{}');
  let workers = 0;
  await runStage(f.next, { execute: async () => { workers++; return reply(f.role,
    [{ path: 'docs/specialist-reviews/pci-fallback.md', before: null, content: 'fresh complete domain review' }]); }, verify });
  assert.equal(workers, 1); assert.equal(f.next.results[f.role].reuse, undefined);
  assert.match(f.next.attempts.at(-1).reuseRefusal, /pin changed/);
});

test('default graph unchanged; policy requires existing-change entry, scope and supported roles', t => {
  const f = fixture(t, 'web-service', false); assert.equal(f.state.specialistPolicy, undefined);
  assert.throws(() => newRun({ ...f.args, specialistPolicy: { mode: 'adaptive', workflow: 'existing-change', base: 'HEAD' }, entry: 'product-owner' }), /senior-dev/);
  assert.throws(() => fixture(t, 'ai-system'), /phase unsupported/);
  assert.doesNotThrow(() => fixture(t, 'game'));
});

test('fintech schedules PCI and regulated roles and cannot raise ship before complete quorum', async t => {
  const { state } = fixture(t); await implement(state); assert.equal(state.status, 'awaiting-gate');
  approve(state, state.pending.token);
  assert.deepEqual(state.queue, ['code-reviewer', 'qa-engineer', 'security-officer', 'pci-reviewer', 'regulated-reviewer']);
  for (let i = 0; i < 4; i++) { await review(state); assert.equal(state.pending, null); assert.equal(state.status, 'ready'); }
  await review(state); assert.equal(state.status, 'awaiting-gate'); assert.ok(state.pending.gates.includes('gate:ship'));
  assert.equal(state.specialistReview.reusablePass, false);
  for (const role of state.specialistReview.roles) assert.equal(state.results[role].verification.state, 'verified');
});

test('changed dependency invalidates epoch before gate approval and before any next worker', async t => {
  const f = fixture(t); await implement(f.state);
  f.put('src/dependency.ts', 'changed after epoch');
  assert.throws(() => approve(f.state, f.state.pending.token), /invalidated/);
  advance(f.state); assert.equal(f.state.status, 'blocked'); assert.match(f.state.reason, /invalidated/);
  assert.equal(f.state.approvals.length, 0);
});

test('newly sensitive implementation expands selection before reviews are launched', async t => {
  const f = fixture(t, 'web-service');
  await runStage(f.state, { execute: async () => reply('senior-dev', [{ path: 'src/payments.ts', before: null, content: 'implementation' }]), verify });
  assert.ok(f.state.specialistReview.roles.includes('pci-reviewer'));
});

test('project declaration cannot downgrade frozen domain floor', async t => {
  const f = fixture(t); f.put('.great_cto/PROJECT.md', 'archetype: web-service');
  let launched = false;
  await assert.rejects(runStage(f.state, { execute: async () => { launched = true; return reply('senior-dev'); }, verify }), /domain policy changed/);
  assert.equal(launched, false);
});

test('reviewer may not change implementation; no fabricated PASS or gate on refusal', async t => {
  const f = fixture(t); await implement(f.state); approve(f.state, f.state.pending.token);
  await runStage(f.state, { execute: async () => reply('code-reviewer', [{ path: 'src/attack.ts', before: null, content: 'bad' }]), verify });
  assert.equal(f.state.status, 'blocked'); assert.match(f.state.reason, /only create new markdown reports/);
  assert.equal(f.state.results['code-reviewer'], undefined);
});

test('negative specialist verdict rewinds implementation and discards epoch, approvals and reviews', async t => {
  const f = fixture(t); await implement(f.state); approve(f.state, f.state.pending.token);
  while (f.state.queue[0] !== 'pci-reviewer') await review(f.state);
  await runStage(f.state, { execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'REJECTED', summary: 'reachable flaw', files: [], meta: {} }) }), verify });
  assert.equal(f.state.queue[0], 'senior-dev'); assert.equal(f.state.specialistReview, undefined);
  assert.deepEqual(Object.keys(f.state.results), []); assert.equal(f.state.approvals.length, 0);
});

test('verified generated reports do not invalidate code scope', async t => {
  const f = fixture(t); await implement(f.state); approve(f.state, f.state.pending.token); await review(f.state);
  assert.doesNotThrow(() => assertSpecialistEpoch(f.state));
  f.put('docs/unrelated-input.md', 'new dependency evidence'); assert.throws(() => assertSpecialistEpoch(f.state), /invalidated/);
});

test('mixed-host review wave preserves domain quorum and input fencing', async t => {
  const f = fixture(t); const state = newRun({ ...f.args, hostRoutes: { 'code-reviewer': 'claude-code', 'pci-reviewer': 'claude-code' } });
  await implement(state); approve(state, state.pending.token);
  const received = [];
  const runner = host => async ({ prompt }) => {
    const role = prompt.match(/You are the ([\w-]+) specialist/)[1]; received.push([role, host]);
    return reply(role, [{ path: `docs/specialist-reviews/${role}.md`, before: null, content: 'actual review report' }]);
  };
  await runParallelWave(state, { runners: { codex: runner('codex'), 'claude-code': runner('claude-code') }, verify });
  assert.equal(state.pending, null); assert.ok(state.queue.includes('pci-reviewer'));
  assert.deepEqual(new Set(received.map(x => x[1])), new Set(['codex', 'claude-code']));
  assert.doesNotThrow(() => assertSpecialistEpoch(state));
  f.put('src/dependency.ts', 'stale');
  await assert.rejects(runParallelWave(state, { runners: { codex: runner('codex'), 'claude-code': runner('claude-code') }, verify }), /invalidated/);
  assert.equal(received.length, 2);
});

test('verified reviewer rework starts a fresh epoch with a new report identity', async t => {
  const f = fixture(t); await implement(f.state); approve(f.state, f.state.pending.token);
  await runStage(f.state, { execute: async () => reply('code-reviewer'), verify: async () => ({ state: 'rework', findings: ['fix code'], checks: ['actual code defect'] }) });
  assert.equal(f.state.queue[0], 'senior-dev'); assert.equal(f.state.specialistReview, undefined);
  await implement(f.state); assert.equal(f.state.status, 'awaiting-gate');
  assert.equal(f.state.specialistReview.roles.length, 5); assert.equal(f.state.specialistReview.reusablePass, false);
});

test('low-risk web-service schedules exactly mandatory reviewers, not the domain catalog', async t => {
  const f = fixture(t, 'web-service'); await implement(f.state); approve(f.state, f.state.pending.token);
  assert.deepEqual(f.state.queue, ['code-reviewer', 'qa-engineer', 'security-officer']);
  assert.equal(f.state.specialistReview.roles.length, 3);
});

test('last domain reviewer needs independent verification before any ship gate', async t => {
  const f = fixture(t); await implement(f.state); approve(f.state, f.state.pending.token);
  while (f.state.queue[0] !== 'regulated-reviewer') await review(f.state);
  const path = 'docs/specialist-reviews/regulated-reviewer.md';
  await runStage(f.state, { execute: async () => reply('regulated-reviewer', [{ path, before: null, content: 'claimed PASS' }]),
    verify: async () => ({ state: 'unverifiable', findings: ['missing evidence'], checks: ['unable to inspect'] }) });
  assert.equal(f.state.status, 'blocked'); assert.equal(f.state.pending, null);
  assert.equal(f.state.results['regulated-reviewer'], undefined);
});

test('regulated specialist floors cannot be waived by auto gate policy on low-risk source', async t => {
  const f = fixture(t);
  const state = newRun({ ...f.args, gatePolicy: { mode: 'adaptive', base: f.args.specialistPolicy.base, level: 'auto', archetype: 'web-service' } });
  await implement(state); assert.equal(state.status, 'ready');
  while (state.status === 'ready') await review(state);
  // Existing graph raises per-role gate tokens; ship on code-reviewer/QA does
  // not replace the subsequent security-officer's regulatory approval.
  while (state.pending?.role !== 'security-officer') { assert.equal(state.status, 'awaiting-gate'); approve(state, state.pending.token); }
  assert.equal(state.status, 'awaiting-gate'); assert.ok(state.pending.gates.includes('gate:security')); assert.ok(state.pending.gates.includes('gate:compliance'));
});

function phased(t, archetype = 'fintech', extra = {}) {
  const f = fixture(t, archetype);
  f.state = newRun({ ...f.args, ...extra, specialistPolicy: { ...f.args.specialistPolicy, workflow: 'phased-change', ...extra.specialistPolicy } });
  return f;
}
test('preparation cannot drop its regulatory hard gates from mutable epoch metadata', t => {
  const f = phased(t);
  f.state.specialistPreparation.hardGates = ['gate:plan'];
  advance(f.state);
  assert.equal(f.state.status, 'blocked');
  assert.match(f.state.reason, /hard gates changed/);
  assert.equal(f.state.approvals.length, 0);
});
test('post-build domain selection is re-derived from project and actual changed artifacts', async t => {
  const f = fixture(t); await implement(f.state);
  f.state.specialistReview.roles = f.state.specialistReview.roles.filter(role => role !== 'pci-reviewer');
  // Tamper with all graph records too: a self-consistent smaller operator list is not evidence.
  f.state.graph['senior-dev'].next = f.state.specialistReview.roles;
  for (const role of f.state.specialistReview.roles) f.state.graph[role].join = f.state.specialistReview.roles.filter(peer => peer !== role);
  f.state.pending = null;
  advance(f.state);
  assert.equal(f.state.status, 'blocked');
  assert.match(f.state.reason, /selected domain quorum/);
  assert.equal(f.state.approvals.length, 0);
});
async function preReview(state) {
  const role = state.queue[0], path = `docs/specialist-contracts/${role}-${state.steps}.md`;
  return runStage(state, { execute: async () => reply(role, [{ path, before: null, content: `${role}: threat boundaries, controls, acceptance criteria` }]), verify });
}
async function finishPreparation(state) {
  while (state.queue[0] !== 'senior-dev' || state.status === 'awaiting-gate') {
    if (state.pending) approve(state, state.pending.token);
    else { assert.equal(state.status, 'ready', state.reason); await preReview(state); }
  }
}

test('every shipped agent and every selected domain has an explicit controlled capability profile', () => {
  const roles = readdirSync(new URL('../../agents/', import.meta.url)).filter(p => p.endsWith('.md')).map(p => p.slice(0, -3));
  for (const role of [...roles, ...Object.values(REVIEWERS_BY_ARCHETYPE).flat(), ...Object.values(PACK_REVIEWERS).flat(), ...COMPLIANCE_REVIEWERS.map(r => r.reviewer)]) {
    assert.ok(codexRoleProfile(role).length > 50, role);
    assert.doesNotMatch(codexRoleProfile(role), /subagent_type|bd update|git push|spawn_agent/);
  }
  assert.throws(() => codexRoleProfile('unregistered-reviewer'), /no controlled Codex profile/);
});

test('clean full-cycle preparation selects declared floors without inventing low-risk diff evidence', t => {
  const f = fixture(t); f.put('src/ui.ts', 'v1');
  assert.throws(() => newRun(f.args), /empty change has no risk evidence/);
  const state = newRun({ ...f.args, entry: 'product-owner', specialistPolicy: { ...f.args.specialistPolicy, workflow: 'full-cycle' } });
  assert.deepEqual(state.queue, ['product-owner']); assert.equal(state.specialistReview, undefined);
  const phasedState = newRun({ ...f.args, specialistPolicy: { ...f.args.specialistPolicy, workflow: 'phased-change' } });
  assert.equal(phasedState.specialistPreparation.plan.planningOnly, true);
  assert.equal(phasedState.specialistPreparation.plan.assessment.known, false);
  assert.equal(phasedState.specialistPreparation.plan.assessment.tier, 'T2');
  assert.deepEqual(phasedState.queue, ['pci-reviewer-prebuild', 'regulated-reviewer-prebuild']);
});

test('phased fintech contracts must be independently verified and explicitly approved before implementation', async t => {
  const { state } = phased(t);
  assert.deepEqual(state.queue, ['pci-reviewer-prebuild', 'regulated-reviewer-prebuild']);
  await preReview(state); assert.equal(state.pending, null); assert.equal(state.queue[0], 'regulated-reviewer-prebuild');
  await preReview(state); assert.equal(state.status, 'awaiting-gate'); assert.ok(state.pending.gates.includes('gate:compliance'));
  assert.equal(state.results['senior-dev'], undefined);
  await finishPreparation(state); assert.equal(state.specialistPreparation.status, 'complete');
  await implement(state); assert.equal(state.specialistReview.roles.length, 5);
  assert.ok(state.results['pci-reviewer-prebuild']); assert.ok(state.results['regulated-reviewer-prebuild']);
});

test('pre-build refusal and unverified output never schedule implementation', async t => {
  for (const verifierFailure of [false, true]) {
    const { state } = phased(t);
    const path = 'docs/specialist-contracts/refused.md';
    await runStage(state, { execute: async () => verifierFailure ? reply(state.queue[0], [{ path, before: null, content: 'unsupported claim' }])
      : { state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'REJECTED', summary: 'unsafe architecture', files: [], meta: {} }) },
      verify: verifierFailure ? async () => ({ state: 'unverifiable', findings: ['missing contract evidence'], checks: ['actual contract inspected'] }) : verify });
    assert.equal(state.status, 'blocked'); assert.equal(state.results['senior-dev'], undefined); assert.equal(state.pending, null);
  }
});

test('pre-build cannot claim an existing source file as its contract report', async t => {
  const { state } = phased(t);
  await runStage(state, { execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'claimed contract', files: [], meta: { report: 'src/ui.ts' } }) }), verify });
  assert.equal(state.status, 'blocked'); assert.match(state.reason, /newly proposed phase artifact/);
  assert.equal(state.results['pci-reviewer-prebuild'], undefined); assert.equal(state.pending, null);
});

test('pre-build source mutation invalidates preparation before next worker or approval', async t => {
  const f = phased(t); await preReview(f.state); f.put('src/ui.ts', 'mutated input');
  let called = false;
  await assert.rejects(runStage(f.state, { execute: async () => { called = true; return reply(f.state.queue[0]); }, verify }), /pre-build epoch invalidated/);
  assert.equal(called, false); assert.equal(f.state.results['senior-dev'], undefined);
});

test('phased reviewer cannot write implementation, and new implemented domain requires a new assessment', async t => {
  const f = phased(t);
  await runStage(f.state, { execute: async () => reply(f.state.queue[0], [{ path: 'src/forbidden.ts', before: null, content: 'implementation' }]), verify });
  assert.equal(f.state.status, 'blocked'); assert.match(f.state.reason, /specialist-contracts/);
  const g = phased(t, 'web-service'); assert.equal(g.state.queue[0], 'senior-dev');
  await runStage(g.state, { execute: async () => reply('senior-dev', [{ path: 'src/payments.ts', before: null, content: 'new payment surface' }]), verify });
  assert.equal(g.state.status, 'blocked'); assert.match(g.state.reason, /new domain\/contract assessment/);
  assert.equal(g.state.specialistReview, undefined);
});

test('AI contract runs before implementation, eval runs only in post-build quorum', async t => {
  const f = fixture(t, 'web-service'); f.put('.great_cto/PROJECT.md', 'archetype: ai-system\n');
  const state = newRun({ ...f.args, specialistPolicy: { ...f.args.specialistPolicy, workflow: 'phased-change' } });
  assert.deepEqual(state.queue, ['ai-prompt-architect-prebuild', 'ai-security-reviewer-prebuild']);
  await finishPreparation(state); await implement(state); approve(state, state.pending.token);
  assert.ok(state.queue.includes('ai-eval-engineer')); assert.ok(state.queue.includes('ai-security-reviewer'));
  assert.ok(!state.queue.includes('ai-prompt-architect')); assert.equal(state.results['ai-eval-engineer'], undefined);
  while (state.queue.length && state.status === 'ready') await review(state);
  assert.equal(state.status, 'awaiting-gate'); assert.equal(state.results['ai-eval-engineer'].verification.state, 'verified');
});

test('explicit contracts are operator-selected; unknown or side-effecting roles are refused', async t => {
  const f = phased(t, 'web-service', { specialistPolicy: { contracts: ['auth-engineer', 'design-advisor'] } });
  assert.deepEqual(f.state.queue, ['auth-engineer-prebuild', 'design-advisor-prebuild']);
  await finishPreparation(f.state); await implement(f.state);
  assert.equal(f.state.specialistReview.roles.length, 3);
  assert.throws(() => phased(t, 'web-service', { specialistPolicy: { contracts: ['infra-provisioner'] } }), /unsupported specialist contract/);
  assert.throws(() => phased(t, 'web-service', { specialistPolicy: { contracts: 'auth-engineer' } }), /unsupported specialist contract/);
});

test('full-cycle preserves product architecture plan gates before domain preparation', async t => {
  const f = fixture(t);
  const state = newRun({ ...f.args, entry: 'product-owner', specialistPolicy: { ...f.args.specialistPolicy, workflow: 'full-cycle' } });
  for (const [role, key] of [['product-owner', 'brief'], ['architect', 'arch'], ['pm', 'plan']]) {
    assert.equal(state.queue[0], role);
    const path = `docs/${role}.md`, files = [{ path, before: null, content: 'explicit approved design and acceptance criteria' }];
    const meta = { [key]: path };
    if (role === 'pm') { files.push({ path: 'docs/briefs/task.md', before: null, content: 'bounded implementation task' }); meta.briefs = 'docs/briefs/'; }
    await runStage(state, { execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'assessed', files, meta }) }), verify });
    assert.equal(state.status, 'awaiting-gate'); assert.ok(state.pending.gates.includes(`gate:${role === 'product-owner' ? 'product' : role === 'architect' ? 'arch' : 'plan'}`));
    approve(state, state.pending.token);
  }
  assert.equal(state.queue[0], 'pci-reviewer-prebuild'); assert.equal(state.results['senior-dev'], undefined);
  await finishPreparation(state); await implement(state); assert.equal(state.specialistReview.roles.length, 5);
});

test('mixed-host pre-build wave uses underlying or explicit staged host routes', async t => {
  const f = phased(t, 'fintech', { hostRoutes: { 'pci-reviewer': 'claude-code', 'regulated-reviewer-prebuild': 'codex' } });
  const calls = [];
  const runner = host => async ({ prompt }) => {
    assert.match(prompt, /PRE-BUILD THREAT-REVIEW CONTRACT/);
    const role = prompt.match(/You are the ([\w-]+) specialist/)[1]; calls.push([role, host]);
    return reply(role, [{ path: `docs/specialist-contracts/${role}.md`, before: null, content: 'bounded independent threat model' }]);
  };
  await runParallelWave(f.state, { runners: { codex: runner('codex'), 'claude-code': runner('claude-code') }, verify });
  assert.equal(f.state.status, 'awaiting-gate'); assert.equal(f.state.results['senior-dev'], undefined);
  assert.deepEqual(new Set(calls.map(c => c[1])), new Set(['codex', 'claude-code']));
});

test('domain repair retains verified pre-build contracts but invalidates post-build quorum', async t => {
  const { state } = phased(t); await finishPreparation(state); await implement(state); approve(state, state.pending.token);
  while (state.queue[0] !== 'pci-reviewer') await review(state);
  await runStage(state, { execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'REJECTED', summary: 'implementation violates contract', files: [], meta: {} }) }), verify });
  assert.equal(state.queue[0], 'senior-dev'); assert.equal(state.specialistReview, undefined);
  assert.equal(state.specialistPreparation.status, 'complete'); assert.ok(state.results['pci-reviewer-prebuild']);
  await implement(state); assert.equal(state.status, 'awaiting-gate'); assert.equal(state.specialistReview.roles.length, 5);
});
