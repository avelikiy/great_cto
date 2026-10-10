import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runChecks, validateCheckPolicy, shellQuote } from '../../scripts/lib/codex-checks.mjs';
import { safePath, newRun, runStage } from '../../scripts/lib/codex-pipeline.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
const image = `node@sha256:${'a'.repeat(64)}`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-check-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/app.mjs'), 'export const x = 2;\n');
  commitFixture(root);
  return { root, allowed: ['src'], checkPolicy: { image, inputs: ['src'], commands: [['node', '--check', 'src/app.mjs']], timeoutMs: 10000 } };
}
test('policy requires pinned image, argv and bounded time', () => {
  for (const policy of [{}, { image: 'node:latest' }, { image, inputs: ['src'], commands: 'sh', timeoutMs: 10000 },
    { image, inputs: ['src'], commands: [['node']], timeoutMs: 0 }]) assert.throws(() => validateCheckPolicy(policy));
});

function localFixture(t) {
  const s = fixture(t);
  delete s.checkPolicy.image;
  Object.assign(s.checkPolicy, { backend: 'local', trusted: true });
  return s;
}

test('local policy is explicit trusted opt-in; Docker default never falls back', async t => {
  const s = localFixture(t);
  for (const mutate of [p => delete p.trusted, p => p.trusted = 'true', p => p.backend = 'auto', p => p.backend = null,
    p => p.image = image, p => p.commands = [['npm', 'test']]]) {
    const p = structuredClone(s.checkPolicy); mutate(p); assert.throws(() => validateCheckPolicy(p));
  }
  const docker = fixture(t);
  const result = await runChecks(docker, { safePath, invokeDocker: async () => ({ code: null, stderr: 'daemon absent' }) });
  assert.equal(result.state, 'unverifiable'); assert.equal(result.backend, 'docker');
});

test('real local checks export snapshot-built bytes and disclose no isolation', async t => {
  const s = localFixture(t);
  s.checkPolicy.commands.push(['node', '-e', "require('fs').mkdirSync('dist');require('fs').copyFileSync('src/app.mjs','dist/app.mjs');console.log('built')"]);
  s.checkPolicy.outputs = ['dist/app.mjs'];
  const result = await runChecks(s, { safePath, invokeDocker: () => assert.fail('must not call Docker') });
  assert.equal(result.state, 'passed'); assert.equal(result.isolation, 'none'); assert.equal(result.backend, 'local');
  assert.equal(result.image, null); assert.equal(result.trusted, true); assert.equal(result.runtime.node, process.version);
  assert.match(result.runtime.executables[process.execPath], /^[a-f0-9]{64}$/);
  assert.equal(result.artifacts[0].sha256, result.files['src/app.mjs']); assert.match(result.stdout, /built/);
  assert.equal(existsSync(join(s.root, 'dist')), false);
});

test('local argv is literal and parent credential environment is not inherited', async t => {
  const s = localFixture(t), hostile = "literal ; $(uname) ' quoted";
  process.env.GREAT_CTO_TEST_CREDENTIAL = 'must-not-inherit';
  t.after(() => delete process.env.GREAT_CTO_TEST_CREDENTIAL);
  s.checkPolicy.commands = [['node', '-e', "require('node:assert/strict').equal(process.env.GREAT_CTO_TEST_CREDENTIAL,undefined);console.log(process.argv[1]);console.log(process.cwd())", hostile]];
  const result = await runChecks(s, { safePath });
  assert.equal(result.state, 'passed'); assert.ok(result.stdout.includes(hostile)); assert.ok(!result.stdout.includes(s.root));
});

test('local failure, missing executable, signal and timeout are never passing', async t => {
  for (const [command, expected] of [
    // A tiny real executable isolates nonzero classification from hashing and
    // starting a large Node binary under load. Node execution is tested above.
    [['/usr/bin/false'], 'failed'],
    [['/great-cto-does-not-exist'], 'unverifiable'],
    [['node', '-e', "process.kill(process.pid,'SIGTERM')"], 'unverifiable'],
    [['node', '-e', 'setInterval(()=>{},1000)'], 'unverifiable'],
  ]) {
    const s = localFixture(t); s.checkPolicy.commands = [command]; s.checkPolicy.timeoutMs = 1000;
    const result = await runChecks(s, { safePath }); assert.equal(result.state, expected,
      JSON.stringify({ command, code: result.code, killed: result.killed, stderr: result.stderr }));
  }
});

test('local export refuses symlinks, secrets and missing output', async t => {
  for (const code of ["require('fs').symlinkSync('src/app.mjs','out')",
    "require('fs').writeFileSync('out','AKIA'+'A'.repeat(16))", '']) {
    const s = localFixture(t); s.checkPolicy.commands = [['node', '-e', code]]; s.checkPolicy.outputs = ['out'];
    await assert.rejects(runChecks(s, { safePath }));
  }
});

test('local excessive output is bounded and unverifiable', async t => {
  const s = localFixture(t);
  s.checkPolicy.commands = [['node', '-e', "setInterval(()=>process.stdout.write('x'.repeat(1024*1024)),1)"]];
  const result = await runChecks(s, { safePath });
  assert.equal(result.state, 'unverifiable'); assert.equal(result.killed, true);
  assert.ok(result.stdout.length + result.stderr.length <= 16 * 1024 * 1024);
});

test('real local controller failure then repair reaches gate without weakening checks', async t => {
  const s = localFixture(t), pluginRoot = join(s.root, 'plugin');
  s.checkPolicy.commands = [['node', '--input-type=module', '-e', "import {x} from './src/app.mjs';if(x!==2)process.exit(1)"]];
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.senior-dev]\non=["DONE"]\ngate="gate:code"\nnext=[]');
  writeFileSync(join(pluginRoot, 'agents/senior-dev.md'), 'Implement');
  const state = newRun({ ...s, pluginRoot, prompt: 'test' , entry: 'senior-dev' });
  let calls = 0, verified = 0;
  const execute = async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'fixture proposal',
    files: [{ path: 'src/app.mjs', before: createHash('sha256').update(readFileSync(join(s.root, 'src/app.mjs'))).digest('hex'), content: `export const x = ${++calls};\n` }] }) });
  const verify = async () => { verified++; return { state: 'verified', findings: [], checks: ['mock verifier, not live model'] }; };
  await runStage(state, { execute, verify });
  assert.equal(state.attempts[0].checks.state, 'failed'); assert.equal(verified, 0); assert.equal(state.pending, null);
  await runStage(state, { execute, verify });
  assert.equal(state.attempts[1].checks.state, 'passed'); assert.equal(verified, 1); assert.equal(state.status, 'awaiting-gate');
});

test('shell quoting preserves hostile arguments as one literal value', () => {
  const hostile = `space ' quote ; echo injected $(uname) \\ newline\nend`;
  const actual = execFileSync('/bin/sh', ['-c', `printf %s ${shellQuote(hostile)}`], { encoding: 'utf8' });
  assert.equal(actual, hostile);
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
