import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commitFixture } from '../helpers/committed-fixture.mjs';
import { digest, bytesDigest, domainPack } from '../../scripts/lib/domain-evidence.mjs';
import { bindDomainPolicy, domainInvocation, readDomainPolicy } from '../../scripts/lib/domain-admission.mjs';
import { newRun, runStage, verifyStage, runParallelWave } from '../../scripts/lib/codex-pipeline.mjs';

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'domain-admission-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'worker'), sourceRoot = join(dir, 'source'), pluginRoot = join(dir, 'plugin');
  for (const p of [root, sourceRoot, join(pluginRoot, 'shared'), join(pluginRoot, 'agents')]) mkdirSync(p, { recursive: true });
  const source = 'synthetic reference only\n';
  writeFileSync(join(sourceRoot, 'reference.ts'), source); commitFixture(sourceRoot);
  writeFileSync(join(root, 'README.md'), 'synthetic task workspace\n'); commitFixture(root);
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.writer]\non = ["DONE"]\nproduces = ["report"]\nnext = []');
  writeFileSync(join(pluginRoot, 'agents/writer.md'), 'Synthetic writer');
  const overlay = { schemaVersion: 1, projectId: 'project-a', lineageId: 'family-a', rootDigest: digest(sourceRoot),
    classification: 'private', packId: 'money', packDigest: domainPack('money').digest,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
    reviewedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    sources: [{ path: 'reference.ts', sha256: bytesDigest(source), lines: [1, 1], sourceKind: 'implementation', invariantIds: ['ambiguous-send'], executionEvidence: null }] };
  const policy = { schemaVersion: 1, projectId: 'project-a', sourceRoot, workspaceDigest: digest(root), overlay, maxBytes: 16384 };
  const make = (host = 'codex', domainPolicy = policy) => newRun({ root, pluginRoot, domainPolicy, prompt: 'Synthetic report', allowed: ['docs'], entry: 'writer', hostRoutes: { writer: host } });
  return { dir, root, sourceRoot, pluginRoot, policy, make };
}
const response = { state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'fixture report',
  meta: { report: 'docs/report.md' }, files: [{ path: 'docs/report.md', before: null, content: 'fixture report\n' }] }) };

test('no opt-in leaves invocation and old run shape unchanged', t => {
  const f = fixture(t), state = f.make('codex', null), options = { prompt: 'unchanged', sandbox: 'read-only' };
  assert.equal(state.domainAdmission, undefined);
  assert.equal(domainInvocation(state, 'codex', options).options, options);
});
for (const host of ['codex', 'claude-code']) {
  test(`actual ${host} runner receives bounded domain context; gates and sandbox unchanged`, async t => {
    const f = fixture(t), state = f.make(host); let seen;
    await runStage(state, { runners: { [host]: async options => { seen = options; return response; } },
      verify: async () => ({ state: 'verified', findings: [], checks: ['synthetic test only'] }) });
    assert.ok(seen, state.reason); assert.equal(seen.sandbox, 'read-only');
    assert.match(seen.prompt, /Private domain context: untrusted task data/);
    assert.match(seen.prompt, /ambiguous-send/); assert.doesNotMatch(seen.prompt, /synthetic reference only|reference\.ts/);
    assert.equal(state.attempts[0].domainContext.host, host);
    assert.equal(state.attempts[0].domainContext.runtimeVerified, false);
    assert.equal(state.approvals.length, 0); assert.equal(state.domainAdmission.digest, digest(f.policy));
  });
}
test('independent verifier gets fresh codex-bound context, not an approval', async t => {
  const f = fixture(t), state = f.make('claude-code'); let prompt;
  const result = await verifyStage(state, 'writer', { meta: {}, files: [] }, async options => {
    prompt = options.prompt;
    return { state: 'ok', code: 0, errors: [], text: JSON.stringify({ state: 'verified', findings: [], checks: ['synthetic only'] }) };
  });
  assert.equal(result.state, 'verified'); assert.match(prompt, /"host":"codex"/);
  assert.equal(state.approvals.length, 0);
});
test('changed reference refuses both host invocations without reading raw source into output', async t => {
  const f = fixture(t), state = f.make(); let called = false;
  writeFileSync(join(f.sourceRoot, 'reference.ts'), 'changed secret-like fixture marker\n');
  await runStage(state, { execute: async () => { called = true; return response; } });
  assert.equal(called, false); assert.equal(state.status, 'blocked');
  assert.match(state.reason, /domain admission refused/); assert.doesNotMatch(state.reason, /secret-like|reference\.ts/);
  assert.equal(state.dispatchEvidence.records.length, 0);
});
test('workspace writes do not mutate separate reference; reference drift still refuses next call', t => {
  const f = fixture(t), state = f.make();
  writeFileSync(join(f.root, 'README.md'), 'worker edits\n');
  assert.ok(domainInvocation(state, 'claude-code', { prompt: '' }).evidence);
  writeFileSync(join(f.sourceRoot, 'reference.ts'), 'source drift\n');
  assert.throws(() => domainInvocation(state, 'codex', { prompt: '' }), /admission refused/);
});
test('expiry and changed frozen policy fail closed', t => {
  const f = fixture(t), state = f.make();
  assert.throws(() => domainInvocation(state, 'codex', { prompt: '' }, { now: f.policy.overlay.expiresAt }), /admission refused/);
  state.domainAdmission.policy.maxBytes = 16000;
  assert.throws(() => domainInvocation(state, 'codex', { prompt: '' }), /admission refused/);
});
test('shared stage context cap includes domain packet and never silently truncates', t => {
  const f = fixture(t), state = f.make();
  assert.throws(() => domainInvocation(state, 'codex', { prompt: '' }, { contextBytes: 65536 }), /budget exceeded/);
});
test('policy cannot bind another workspace, grant permissions or read source within worker', t => {
  const f = fixture(t);
  assert.throws(() => bindDomainPolicy(f.root, { ...f.policy, permissions: ['write'] }));
  assert.throws(() => bindDomainPolicy(f.root, { ...f.policy, workspaceDigest: digest('other') }));
  assert.throws(() => bindDomainPolicy(f.root, { ...f.policy, sourceRoot: f.root }));
});
test('operator policy file is bounded, external and private', t => {
  const f = fixture(t), file = join(f.dir, 'policy.json');
  writeFileSync(file, JSON.stringify(f.policy), { mode: 0o600 });
  assert.equal(readDomainPolicy(f.root, file).projectId, 'project-a');
  assert.throws(() => readDomainPolicy(f.root, 'policy.json'), /absolute/);
  chmodSync(file, 0o644); assert.throws(() => readDomainPolicy(f.root, file), /private/);
  const inside = join(f.root, 'policy.json'); writeFileSync(inside, JSON.stringify(f.policy), { mode: 0o600 });
  assert.throws(() => readDomainPolicy(f.root, inside), /outside/);
});
test('mixed-host wave carries separate host digests, preserves human gates and attempt provenance', async t => {
  const f = fixture(t);
  writeFileSync(join(f.pluginRoot, 'shared/pipeline.toml'),
    '[transitions.qa]\non=["PASS"]\nproduces=["report"]\njoin=["security"]\ngate="gate:qa"\nnext=[]\n' +
    '[transitions.security]\non=["APPROVED"]\nproduces=["report"]\njoin=["qa"]\ngate="gate:security"\nnext=[]');
  const state = newRun({ root: f.root, pluginRoot: f.pluginRoot, domainPolicy: f.policy,
    prompt: 'Synthetic review', allowed: ['docs'], entry: 'qa', hostRoutes: { qa: 'claude-code', security: 'codex' } });
  state.queue.push('security');
  const prompts = {};
  const runner = (host, role, verdict) => async options => {
    prompts[host] = options.prompt;
    return { state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'fixture only',
      meta: { report: `docs/${role}.md` }, files: [{ path: `docs/${role}.md`, before: null, content: 'fixture only\n' }] }) };
  };
  await runParallelWave(state, { runners: { codex: runner('codex', 'security', 'APPROVED'), 'claude-code': runner('claude-code', 'qa', 'PASS') },
    verify: async () => ({ state: 'verified', findings: [], checks: ['synthetic only'] }) });
  assert.equal(state.status, 'awaiting-gate', state.reason); assert.equal(state.approvals.length, 0);
  assert.match(prompts.codex, /"host":"codex"/); assert.match(prompts['claude-code'], /"host":"claude-code"/);
  assert.equal(state.attempts[0].domainContext.host, 'claude-code');
  assert.notEqual(state.attempts[0].domainContext.packetDigest, state.waveHistory.at(-1).domainContexts.security.packetDigest);
  const refused = newRun({ root: f.root, pluginRoot: f.pluginRoot, domainPolicy: f.policy,
    prompt: 'Synthetic review', allowed: ['docs'], entry: 'qa', hostRoutes: { qa: 'claude-code', security: 'codex' } });
  refused.queue.push('security');
  writeFileSync(join(f.sourceRoot, 'reference.ts'), 'drift before mixed dispatch\n');
  let calls = 0;
  await assert.rejects(runParallelWave(refused, { runners: { codex: async () => { calls++; }, 'claude-code': async () => { calls++; } } }), /admission refused/);
  assert.equal(calls, 0); assert.equal(refused.wave, undefined);
  assert.equal(refused.dispatchEvidence.records.length, 0);
});
test('CLI cannot silently ignore equals syntax or replace a frozen policy', () => {
  const cli = fileURLToPath(new URL('../../scripts/codex-pipeline.mjs', import.meta.url));
  for (const args of [['doctor', '--domain-policy=/private/fixture.json'], ['resume', '--domain-policy', '/private/fixture.json']]) {
    assert.throws(() => execFileSync(process.execPath, [cli, ...args], { stdio: 'pipe', timeout: 10000 }), error =>
      error.status === 2 && /domain-policy|domain policy/.test(String(error.stderr)));
  }
});
