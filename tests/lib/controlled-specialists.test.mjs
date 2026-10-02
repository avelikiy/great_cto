import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { newRun, runStage, runParallelWave, approve, advance } from '../../scripts/lib/codex-pipeline.mjs';
import { assertSpecialistEpoch } from '../../scripts/lib/controlled-specialists.mjs';

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
function reply(role, files = []) {
  return { state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'Inspected', files,
    meta: ['senior-dev', 'code-reviewer'].includes(role) ? {} : { report: files[0]?.path } }) };
}
async function implement(state) { return runStage(state, { execute: async () => reply('senior-dev'), verify }); }
async function review(state) {
  const role = state.queue[0]; const path = `docs/specialist-reviews/${role}.md`;
  return runStage(state, { execute: async () => reply(role, [{ path, before: null, content: `${role}: actual findings` }]), verify });
}

test('default graph unchanged; policy requires existing-change entry, scope and supported roles', t => {
  const f = fixture(t, 'web-service', false); assert.equal(f.state.specialistPolicy, undefined);
  assert.throws(() => newRun({ ...f.args, specialistPolicy: { mode: 'adaptive', workflow: 'existing-change', base: 'HEAD' }, entry: 'product-owner' }), /senior-dev/);
  assert.throws(() => fixture(t, 'ai-system'), /phase unsupported/);
  assert.throws(() => fixture(t, 'game'), /no controlled Codex profile/);
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
