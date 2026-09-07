import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { newRun, runStage, approve, recover, cancel } from '../../scripts/lib/codex-pipeline.mjs';

const graph = `
[transitions.pm]
on=["DONE"]
gate="gate:plan"
next=["senior-dev"]
[transitions.senior-dev]
on=["DONE"]
gate="gate:code"
next=["code-reviewer"]
[transitions.senior-dev.SPEC-OBJECTION]
on=["SPEC-OBJECTION"]
gate="gate:plan"
next=["pm"]
[transitions.code-reviewer]
on=["DONE"]
next=["qa-engineer","security-officer"]
[transitions.qa-engineer]
on=["DONE"]
join=["security-officer"]
gate="gate:ship"
next=[]
[transitions.security-officer]
on=["DONE"]
join=["qa-engineer"]
next=[]
`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-recovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), graph);
  for (const role of ['pm', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer']) writeFileSync(join(pluginRoot, 'agents', `${role}.md`), role);
  return newRun({ root, pluginRoot, prompt: 'fixture', allowed: ['src'], entry: 'pm' });
}
const verified = async () => ({ state: 'verified', findings: [], checks: ['fixture inspected'] });
const output = verdict => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'fix implementation', files: [], meta: {} }) });
const stage = (s, verdict = 'DONE', extra = {}) => runStage(s, { execute: async () => output(verdict), verify: verified, ...extra });
async function toQA(s) {
  await stage(s); approve(s, s.pending.token);
  await stage(s); approve(s, s.pending.token);
  await stage(s);
}

test('QA failure invalidates implementation, reviews and code approval; fresh join required', async t => {
  const s = fixture(t); await toQA(s);
  const old = s.results['senior-dev'].digest;
  await stage(s, 'FAIL');
  assert.deepEqual(s.queue, ['senior-dev']);
  assert.deepEqual(Object.keys(s.results), ['pm']);
  assert.deepEqual(s.approvals.map(a => a.role), ['pm']);
  assert.equal(s.invalidations.length, 1);
  assert.equal(s.invalidations[0].results['senior-dev'].digest, old);
  await stage(s); assert.notEqual(s.results['senior-dev'].digest, old);
  approve(s, s.pending.token); await stage(s); await stage(s);
  assert.equal(s.pending, null); assert.deepEqual(s.queue, ['security-officer']);
  await stage(s); assert.equal(s.status, 'awaiting-gate');
  approve(s, s.pending.token); assert.equal(s.status, 'done');
});

test('security verifier rework invalidates an already successful QA partner', async t => {
  const s = fixture(t); await toQA(s); await stage(s);
  assert.ok(s.results['qa-engineer']);
  await stage(s, 'DONE', { verify: async () => ({ state: 'rework', findings: ['auth bug'], checks: ['inspected auth'] }) });
  assert.deepEqual(s.queue, ['senior-dev']); assert.equal(s.results['qa-engineer'], undefined);
  assert.equal(s.pending, null); assert.deepEqual(s.rework.findings, ['auth bug']);
});

test('SPEC-OBJECTION back-edge waits for its gate and invalidates plan approval', async t => {
  const s = fixture(t); await stage(s); const old = s.pending.token; approve(s, old);
  await stage(s, 'SPEC-OBJECTION');
  assert.equal(s.status, 'awaiting-gate'); approve(s, s.pending.token);
  assert.deepEqual(s.queue, ['pm']); assert.deepEqual(s.approvals, []);
  await stage(s); assert.equal(s.status, 'awaiting-gate');
  assert.throws(() => approve(s, old), /token/);
});

test('repair cannot exceed the implementation attempt budget', async t => {
  const s = fixture(t); s.maxAttempts = 1; await toQA(s); await stage(s, 'FAIL');
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /repair attempt limit/);
  assert.equal(s.pending, null);
});

function gitBase(s) {
  execFileSync('git', ['init', '-q'], { cwd: s.root });
  execFileSync('git', ['add', 'plugin'], { cwd: s.root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base'], { cwd: s.root });
}
test('explicit recovery of unchanged pre-write Git stage survives serialization', async t => {
  let s = fixture(t); gitBase(s);
  await stage(s, 'DONE', { execute: async () => { throw Error('transport gone'); } });
  assert.equal(s.status, 'blocked'); s = JSON.parse(JSON.stringify(s));
  recover(s); assert.equal(s.status, 'ready'); assert.equal(s.attempts[0].status, 'recovered');
  await stage(s); assert.equal(s.status, 'awaiting-gate');
});

test('recovery refuses drift, non-Git roots and partially applied uncertainty', async t => {
  const s = fixture(t); gitBase(s);
  await stage(s, 'DONE', { execute: async () => { throw Error('transport gone'); } });
  writeFileSync(join(s.root, 'new-file'), 'external change');
  assert.throws(() => recover(s), /working tree changed/);
  const other = fixture(t);
  await stage(other, 'DONE', { execute: async () => { throw Error('transport gone'); } });
  assert.throws(() => recover(other), /only unchanged pre-write/);
  const applied = fixture(t); gitBase(applied);
  await stage(applied, 'DONE', { verify: async () => { throw Error('verifier crashed'); } });
  assert.equal(applied.attempts[0].phase, 'verifying');
  applied.attempts[0].phase = 'applying';
  assert.throws(() => recover(applied), /only unchanged pre-write/);
});

test('recovery can retry verification failure on an unchanged fully applied candidate', async t => {
  const s = fixture(t); gitBase(s);
  await stage(s, 'DONE', { verify: async () => { throw Error('transport failure'); } });
  recover(s); assert.equal(s.status, 'ready');
  await stage(s); assert.equal(s.status, 'awaiting-gate');
  assert.equal(s.attempts.length, 2);
});

test('cancel invalidates a pending gate without treating cancellation as rollback', async t => {
  const s = fixture(t); await stage(s); const token = s.pending.token;
  cancel(s); assert.equal(s.status, 'cancelled'); assert.equal(s.pending, null);
  assert.throws(() => approve(s, token), /token/);
  await stage(s, 'DONE', { execute: async () => assert.fail('cancelled run dispatched') });
  assert.equal(s.status, 'cancelled'); assert.ok(s.results.pm);
});
