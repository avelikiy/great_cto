import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { runStep, preflight } from '../../scripts/lib/verification-lane.mjs';
const entry = new URL('../../scripts/verify.mjs', import.meta.url);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'verify-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['scripts/verify.mjs', 'scripts/lib/verification-lane.mjs', 'scripts/lib/affected-tests.mjs', 'scripts/lib/count-skips.mjs']) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), readFileSync(new URL(`../../${name}`, import.meta.url)));
  }
  writeFileSync(join(root, 'package.json'), '{"private":true}');
  writeFileSync(join(root, 'README.md'), 'base'); writeFileSync(join(root, 'scripts/ci-local.sh'), 'exit 97\n');
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'base']);
  return root;
}
test('CLI rejects unknown, duplicate and missing options without launching a gate', () => {
  for (const args of [[], ['--mode', 'final'], ['--mode', 'feedback', '--base', 'HEAD', '--oops'], ['--mode', 'final', '--mode', 'feedback', '--base', 'HEAD']]) {
    const r = spawnSync(process.execPath, [entry.pathname, ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 2); assert.match(r.stderr, /--mode feedback\|final/);
  }
});
test('plan is read-only and final admission refuses dirty source before a browser or gate', t => {
  const root = fixture(t); writeFileSync(join(root, 'README.md'), 'dirty');
  const run = args => spawnSync(process.execPath, [join(root, 'scripts/verify.mjs'), ...args], { cwd: root,
    env: { PATH: '/usr/bin:/bin:/usr/local/bin', LANG: 'C', TZ: 'UTC' }, encoding: 'utf8', timeout: 5000 });
  const plan = run(['--mode', 'final', '--base', 'HEAD', '--plan']); assert.equal(plan.status, 0);
  assert.equal(JSON.parse(plan.stdout).route, 'docs');
  const final = run(['--mode', 'final', '--base', 'HEAD']); assert.equal(final.status, 1);
  const receipt = JSON.parse(final.stdout); assert.equal(receipt.result, 'blocked'); assert.equal(receipt.reason, 'unclean-candidate');
  assert.deepEqual(receipt.steps, []); assert.equal(receipt.mergeEligible, false);
});
test('preflight requires a real browser rather than treating missing runtime as green', async t => {
  const root = fixture(t);
  assert.equal((await preflight({ cwd: root, browserRequired: false })).state, 'ready');
  const p = await preflight({ cwd: root, browserRequired: true });
  assert.equal(p.state, 'blocked'); assert.equal(p.reason, 'browser-runtime-unavailable');
});
test('runner records actual exit and stage timings, and refuses a log failure', async t => {
  const root = fixture(t);
  const r = await runStep({ name: 'fixture', command: process.execPath,
    args: ['-e', 'console.log("── fixture step");process.exitCode=7'] }, { cwd: root, logFile: join(root, 'run.log') });
  assert.equal(r.code, 7); assert.equal(r.timings[0].name, 'fixture step'); assert.ok(r.elapsedMs >= 0);
  const bad = await runStep({ name: 'fixture', command: process.execPath, args: ['-e', 'setTimeout(()=>{},1000)'] },
    { cwd: root, logFile: join(root, 'missing', 'run.log') });
  assert.equal(bad.code, null); assert.equal(bad.error, 'log-unavailable');
});
test('runner preserves timeout and unavailable-executable causes', async t => {
  const root = fixture(t);
  const timed = await runStep({ name: 'fixture', command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
    { cwd: root, logFile: join(root, 'timed.log'), timeoutMs: 100 });
  assert.equal(timed.code, null); assert.equal(timed.error, 'timeout'); assert.equal(timed.signal, 'SIGKILL');
  const missing = await runStep({ name: 'fixture', command: join(root, 'absent'), args: [] },
    { cwd: root, logFile: join(root, 'missing.log') });
  assert.equal(missing.error, 'spawn-unavailable'); assert.equal(missing.code, null);
});
