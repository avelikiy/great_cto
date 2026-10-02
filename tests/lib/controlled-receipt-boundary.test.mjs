import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { newRun, runStage, advance, approve, runParallelWave } from '../../scripts/lib/codex-pipeline.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';

function fixture(t, { git = true, research = false, wave = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'controlled-receipt-')), root = join(dir, 'project'), pluginRoot = join(dir, 'plugin');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(root); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  const entry = research ? 'project-auditor' : wave ? 'qa' : 'writer';
  const graph = wave
    ? '[transitions.qa]\non=["DONE"]\njoin=["security"]\ngate="gate:ship"\nnext=[]\n[transitions.security]\non=["DONE"]\njoin=["qa"]\ngate="gate:ship"\nnext=[]'
    : `[transitions.${entry}]\non=["DONE"]\n${research ? '' : 'gate="gate:ship"\n'}next=[]`;
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), graph);
  if (git) commitFixture(root);
  const state = newRun({ root, pluginRoot, prompt: 'fixture', entry, intent: research ? 'research' : 'delivery', allowed: ['docs'],
    hostRoutes: wave ? { qa: 'claude-code', security: 'codex' } : {} });
  if (wave) state.queue.push('security');
  let damaged = false;
  const damageGit = () => { if (!damaged) { execFileSync('git', ['config', 'core.repositoryFormatVersion', '999'], { cwd: root }); damaged = true; } };
  const many = () => { mkdirSync(join(root, 'bulk')); for (let i = 0; i < 201; i++) writeFileSync(join(root, 'bulk', `${i}.txt`), 'untracked'); };
  return { root, state, damageGit, many };
}
const response = { state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'DONE', summary: 'fixture', meta: {},
  files: [{ path: 'docs/result.md', before: null, content: 'inspected report' }] }) };
const verify = async () => ({ state: 'verified', findings: [], checks: ['actual fixture bytes'] });

for (const kind of ['missing', 'unreadable', 'truncated']) test(`${kind} delivery input refuses worker and verifier before attempts`, async t => {
  const f = fixture(t, { git: kind !== 'missing' });
  if (kind === 'unreadable') f.damageGit(); if (kind === 'truncated') f.many();
  let calls = 0;
  await assert.rejects(runStage(f.state, { execute: async () => { calls++; return response; }, verify: async () => { calls++; return verify(); } }), /stage input.*complete Git receipt/);
  assert.equal(calls, 0); assert.equal(f.state.attempts.length, 0); assert.equal(f.state.pending, null);
  assert.equal(f.state.approvals.length, 0); assert.equal(existsSync(join(f.root, 'docs/result.md')), false);
});

for (const kind of ['unreadable', 'truncated']) test(`${kind} worker tree refuses proposal writes and verification`, async t => {
  const f = fixture(t); let verifiers = 0;
  await runStage(f.state, { execute: async () => { if (kind === 'unreadable') f.damageGit(); else f.many(); return response; },
    verify: async () => { verifiers++; return verify(); } });
  assert.equal(f.state.status, 'blocked'); assert.match(f.state.reason, /worker output.*complete Git receipt/);
  assert.equal(verifiers, 0); assert.equal(f.state.pending, null); assert.equal(f.state.results.writer, undefined);
  assert.equal(existsSync(join(f.root, 'docs/result.md')), false);
});

test('complete but mutated worker tree also refuses proposal application', async t => {
  const f = fixture(t);
  await runStage(f.state, { execute: async () => { writeFileSync(join(f.root, 'side-effect'), 'changed'); return response; }, verify });
  assert.equal(f.state.status, 'blocked'); assert.match(f.state.reason, /changed during worker dispatch/);
  assert.equal(existsSync(join(f.root, 'docs/result.md')), false);
});

for (const kind of ['before verifier', 'after verifier']) test(`receipt loss ${kind} cannot become a verified result`, async t => {
  const f = fixture(t); let verifiers = 0;
  await runStage(f.state, { execute: async () => response, verify: async () => { verifiers++; f.damageGit(); return verify(); },
    save: state => { if (kind === 'before verifier' && state.attempts.at(-1)?.phase === 'verifying') f.damageGit(); } });
  assert.equal(verifiers, kind === 'before verifier' ? 0 : 1);
  assert.equal(f.state.status, 'blocked'); assert.equal(f.state.pending, null); assert.equal(f.state.results.writer, undefined);
  assert.equal(f.state.approvals.length, 0);
});

const invalidReceipts = [null, undefined, { head: 'a'.repeat(40) }, 'not-a-receipt'];
for (const [index, invalid] of invalidReceipts.entries()) test(`saved invalid pending receipt ${index} cannot approve`, async t => {
  const f = fixture(t); await runStage(f.state, { execute: async () => response, verify });
  f.state.pending.receipt = invalid;
  assert.throws(() => approve(f.state, f.state.pending.token), /without a complete receipt/);
  assert.equal(f.state.approvals.length, 0);
});

test('truncated pending/result or unavailable current receipt cannot approve an existing token', async t => {
  for (const kind of ['pending', 'result', 'current', 'stale digest']) {
    const f = fixture(t); await runStage(f.state, { execute: async () => response, verify });
    assert.equal(f.state.status, 'awaiting-gate');
    if (kind === 'pending') f.state.pending.receipt.truncated = true;
    if (kind === 'result') f.state.results.writer.receipt = null;
    if (kind === 'current') f.damageGit();
    if (kind === 'stale digest') f.state.results.writer.digest = 'different';
    assert.throws(() => approve(f.state, f.state.pending.token), /receipt|stale result/);
    assert.equal(f.state.approvals.length, 0); assert.equal(f.state.released.length, 0);
  }
});

test('gate raising refuses a legacy null-result receipt rather than retrobinding it to current tree', t => {
  const f = fixture(t); f.state.results.writer = { verdict: 'DONE', digest: 'legacy', receipt: null }; f.state.queue = [];
  advance(f.state);
  assert.equal(f.state.status, 'blocked'); assert.match(f.state.reason, /verified-result Git receipts/);
  assert.equal(f.state.pending, null); assert.equal(f.state.approvals.length, 0);
});
test('legacy null result cannot reach done through a gate-free delivery rule', t => {
  const f = fixture(t); delete f.state.graph.writer.gate;
  f.state.results.writer = { verdict: 'DONE', digest: 'legacy', receipt: null }; f.state.queue = [];
  advance(f.state);
  assert.equal(f.state.status, 'blocked'); assert.equal(f.state.released.length, 0); assert.equal(f.state.pending, null);
});

test('research outside Git remains explicit report-artifacts-only, never tree-attested', async t => {
  const f = fixture(t, { research: true, git: false });
  await runStage(f.state, { execute: async () => response, verify });
  assert.equal(f.state.status, 'done'); assert.equal(f.state.results['project-auditor'].receipt, null);
  assert.equal(f.state.results['project-auditor'].receiptEvidence, 'report-artifacts-only');
  assert.equal(f.state.approvals.length, 0);
});

test('non-Git research cannot create a human gate by changing its graph', async t => {
  const f = fixture(t, { research: true, git: false }); f.state.graph['project-auditor'].gate = ['gate:ship'];
  await runStage(f.state, { execute: async () => response, verify });
  assert.equal(f.state.status, 'blocked'); assert.equal(f.state.pending, null); assert.equal(f.state.approvals.length, 0);
});

test('prepared output cannot replace missing original input with the current valid receipt', async t => {
  const f = fixture(t);
  await assert.rejects(runStage(f.state, { prepared: { response, receipt: null }, verify }), /stage input.*complete Git receipt/);
  assert.equal(f.state.attempts.length, 0); assert.equal(f.state.pending, null);
});

test('mixed-host wave refuses truncated input before either runner dispatch', async t => {
  const f = fixture(t, { wave: true }); f.many(); let calls = 0;
  const runner = async () => { calls++; return response; };
  await assert.rejects(runParallelWave(f.state, { runners: { codex: runner, 'claude-code': runner }, verify }), /complete Git receipt/);
  assert.equal(calls, 0); assert.equal(f.state.wave, undefined); assert.equal(f.state.approvals.length, 0);
});

test('serialized fetched wave with null input cannot apply reports or approve', async t => {
  const f = fixture(t, { wave: true });
  f.state.wave = { id: 'legacy-wave', roles: ['qa', 'security'], status: 'fetched', receipt: null,
    responses: { qa: response, security: response } };
  await assert.rejects(runParallelWave(f.state, { verify }), /wave has no complete input receipt/);
  assert.equal(f.state.attempts.length, 0); assert.equal(existsSync(join(f.root, 'docs/result.md')), false);
  assert.equal(f.state.approvals.length, 0);
});
