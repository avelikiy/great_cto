import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { runChecks, validateCheckPolicy } from '../../scripts/lib/codex-checks.mjs';
import { safePath, newRun, runStage } from '../../scripts/lib/codex-pipeline.mjs';
const image = `node@sha256:${'a'.repeat(64)}`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-check-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/app.mjs'), 'export const x = 2;\n');
  return { root, allowed: ['src'], checkPolicy: { image, inputs: ['src'], commands: [['node', '--check', 'src/app.mjs']], timeoutMs: 10000 } };
}
test('policy requires pinned image, argv and bounded time', () => {
  for (const policy of [{}, { image: 'node:latest' }, { image, inputs: ['src'], commands: 'sh', timeoutMs: 10000 },
    { image, inputs: ['src'], commands: [['node']], timeoutMs: 0 }]) assert.throws(() => validateCheckPolicy(policy));
});

test('checks mount only a filtered readonly snapshot, isolate writes and retain evidence', async t => {
  const s = fixture(t); const calls = []; let mounted;
  const result = await runChecks(s, { safePath, invokeDocker: async (args, timeout) => {
    calls.push(args);
    if (args[0] === 'rm') return { code: 0 };
    assert.equal(timeout, 10000);
    for (const flag of ['--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534', '--pull=never']) assert.ok(args.includes(flag));
    const mount = args[args.indexOf('--mount') + 1];
    mounted = mount.match(/source=([^,]+)/)[1]; assert.notEqual(mounted, s.root);
    assert.equal(readFileSync(join(mounted, 'src/app.mjs'), 'utf8'), 'export const x = 2;\n');
    assert.match(mount, /readonly$/); assert.equal(args.filter(a => a === '--mount').length, 1);
    return { code: 0, stdout: 'passed', stderr: '' };
  } });
  assert.equal(result.state, 'passed'); assert.equal(result.code, 0); assert.match(result.files['src/app.mjs'], /^[a-f0-9]{64}$/);
  assert.equal(existsSync(mounted), false); assert.deepEqual(calls[1].slice(0, 2), ['rm', '-f']);
  assert.equal(calls[1][2], calls[0][calls[0].indexOf('--name') + 1]);
});

test('unsafe inputs and secrets are rejected before container execution', async t => {
  for (const path of ['../outside', 'src/.env', 'src/link', 'src/secret']) {
    const s = fixture(t);
    symlinkSync(tmpdir(), join(s.root, 'src/link'));
    writeFileSync(join(s.root, 'src/secret'), 'AKIA' + 'A'.repeat(16));
    s.checkPolicy.inputs = [path];
    await assert.rejects(runChecks(s, { safePath, invokeDocker: async args => { assert.equal(args[0], 'rm'); return { code: 0 }; } }));
  }
});

test('timeout and nonzero exit cannot be reported as passed', async t => {
  for (const failure of [{ code: 1 }, { code: null, killed: true }, { code: 0, killed: true }]) {
    const s = fixture(t);
    const result = await runChecks(s, { safePath, invokeDocker: async args => args[0] === 'rm' ? { code: 0 } : failure });
    assert.notEqual(result.state, 'passed');
    if (failure.killed) assert.equal(result.state, 'unverifiable');
  }
});

test('export separates artifact bytes from logs and validates exact policy output set', async t => {
  const s = fixture(t); s.checkPolicy.outputs = ['dist/app.mjs'];
  const invokeDocker = async args => args[0] === 'rm' ? { code: 0 } : {
    code: 0, stdout: JSON.stringify([{ path: 'dist/app.mjs', base64: Buffer.from('built').toString('base64') }]), stderr: 'build log',
  };
  const result = await runChecks(s, { safePath, invokeDocker });
  assert.equal(result.state, 'passed'); assert.equal(result.stderr, 'build log');
  assert.equal(result.artifacts[0].base64, 'YnVpbHQ='); assert.match(result.artifactDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(result.stdout, /YnVpbHQ=/);
  s.checkPolicy.outputs = ['different.mjs'];
  await assert.rejects(runChecks(s, { safePath, invokeDocker }), /differs from policy/);
});

test('mandatory failing checks cannot be overridden by semantic verifier', async t => {
  const s = fixture(t); const pluginRoot = join(s.root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.senior-dev]\non=["DONE"]\ngate="gate:code"\nnext=[]');
  writeFileSync(join(pluginRoot, 'agents/senior-dev.md'), 'Implement');
  const state = newRun({ ...s, pluginRoot, prompt: 'test', entry: 'senior-dev', maxAttempts: 1 });
  await runStage(state, { execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'done', files: [] }) }),
    checks: async () => ({ state: 'failed', code: 1, stdout: 'assertion failed' }), verify: async () => assert.fail('verifier must not override tests') });
  assert.equal(state.status, 'blocked'); assert.equal(state.pending, null);
  assert.equal(state.attempts[0].checks.code, 1);
});

test('live offline Docker: real test/build writes, host writes and network denied', { skip: !process.env.GREAT_CTO_LIVE_DOCKER_IMAGE }, async t => {
  const s = fixture(t); s.checkPolicy.image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE;
  s.checkPolicy.timeoutMs = 60000;
  writeFileSync(join(s.root, 'src/check.mjs'), `
import assert from 'node:assert/strict';
import {writeFileSync, mkdirSync, readFileSync, existsSync} from 'node:fs';
import {x} from './app.mjs';
assert.equal(x, 2);
mkdirSync('dist'); writeFileSync('dist/result.txt', String(x));
assert.equal(readFileSync('dist/result.txt', 'utf8'), '2');
assert.throws(() => writeFileSync('/input/src/app.mjs', 'tampered'));
assert.throws(() => writeFileSync('/etc/forbidden', 'tampered'));
assert.equal(existsSync('/var/run/docker.sock'), false);
await assert.rejects(fetch('https://example.com', {signal: AbortSignal.timeout(3000)}));
console.log('REAL_CHECKS_PASSED');
`);
  s.checkPolicy.commands = [['node', 'src/check.mjs']];
  const result = await runChecks(s, { safePath });
  assert.equal(result.state, 'passed', JSON.stringify(result));
  assert.match(result.stdout, /REAL_CHECKS_PASSED/);
  assert.equal(existsSync(join(s.root, 'dist')), false);
  assert.equal(readFileSync(join(s.root, 'src/app.mjs'), 'utf8'), 'export const x = 2;\n');
});

test('live controller: real failed assertion -> repair -> real passing assertion -> gate', { skip: !process.env.GREAT_CTO_LIVE_DOCKER_IMAGE }, async t => {
  const s = fixture(t); s.checkPolicy.image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE; s.checkPolicy.timeoutMs = 60000;
  s.checkPolicy.commands = [['node', '--input-type=module', '-e', "import assert from 'node:assert/strict'; import {x} from './src/app.mjs'; assert.equal(x, 2)"]];
  const pluginRoot = join(s.root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.senior-dev]\non=["DONE"]\ngate="gate:code"\nnext=[]');
  writeFileSync(join(pluginRoot, 'agents/senior-dev.md'), 'Implement');
  const state = newRun({ ...s, pluginRoot, prompt: 'x must equal 2', entry: 'senior-dev' });
  let calls = 0, verifications = 0;
  const execute = async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'fixture worker',
    files: [{ path: 'src/app.mjs', before: createHash('sha256').update(readFileSync(join(s.root, 'src/app.mjs'))).digest('hex'),
      content: `export const x = ${++calls};\n` }] }) });
  const verify = async () => { verifications++; return { state: 'verified', findings: [], checks: ['fixture semantic verifier'] }; };
  await runStage(state, { execute, verify });
  assert.equal(state.status, 'ready', state.reason); assert.equal(state.pending, null);
  assert.equal(state.attempts[0].checks.state, 'failed'); assert.equal(verifications, 0);
  await runStage(state, { execute, verify });
  assert.equal(state.status, 'awaiting-gate', state.reason);
  assert.equal(state.attempts[1].checks.state, 'passed'); assert.equal(verifications, 1);
});
