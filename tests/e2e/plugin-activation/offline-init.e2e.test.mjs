// Isolated-HOME E2E, part 5: `great-cto init` with the network taken away.
//
// network-guard.mjs is preloaded into the init process (`node --import`). It makes fetch, TCP sockets and
// DNS fail like an unplugged cable, refuses the programs that exist to fetch and git's remote commands,
// and records every attempt. It classifies a spawn with the SAME functions the manifest check uses
// (plugin-runtime-boundary.mjs), so the two cannot disagree about what fetches: directly, through a
// shell (`shell: true`, `sh -c`, `bash -lc`, `exec`), or through a wrapper (`env`, `timeout`...).
// What it does NOT see: the network use of a child process it let through. A child that is allowed to
// run (node, a shell script) is not itself guarded. The first test proves the guard catches each way
// listed above, and lets the local variants of each through; the second shows `init` completing
// without making one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FETCHING_PROGRAMS } from '../../../packages/cli/src/plugin-runtime-boundary.mjs';
import { newMachine, buildPackage, runInit, cleanEnv, readHost, ranFiles, SUCCESSFUL_INIT_RUNS, NETWORK_GUARD, PLUGIN_KEY, REPO, tail } from './harness.mjs';

const GUARD = ['--import', pathToFileURL(NETWORK_GUARD).href];
const BOUNDARY = pathToFileURL(path.join(REPO, 'packages', 'cli', 'src', 'plugin-runtime-boundary.mjs')).href;
const attempts = log => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];

test('the network guard records the network a process uses and every fetching program it spawns: directly, through a shell, through a wrapper (known-bad sample)', t => {
  const machine = newMachine(t), sample = path.join(machine.root, 'sample.mjs'), log = path.join(machine.root, 'net.log');
  fs.writeFileSync(sample, [
    "import net from 'node:net';",
    "import dns from 'node:dns';",
    "import { spawnSync, execFileSync, execSync } from 'node:child_process';",
    `import { FETCHING_PROGRAMS } from ${JSON.stringify(BOUNDARY)};`,
    'const seen = {};',
    "const attempt = async (name, fn) => { try { await fn(); seen[name] = 'ALLOWED'; } catch (e) { seen[name] = /E2E guard/.test(e.message) ? 'blocked' : 'other: ' + e.message; } };",
    "await attempt('fetch', () => fetch('http://example.invalid/'));",
    "await attempt('socket', () => { net.connect(9, '127.0.0.1').on('error', () => {}); });",
    "await attempt('dns', () => new Promise((resolve, reject) => dns.lookup('example.invalid', e => e ? reject(e) : resolve())));",
    "await attempt('curl', () => execFileSync('curl', ['http://example.invalid/']));",
    "await attempt('gitClone', () => spawnSync('git', ['clone', 'https://example.invalid/x.git', 'x']));",
    "await attempt('npm', () => spawnSync('npm', ['view', 'x']));",
    "await attempt('localGit', () => spawnSync('git', ['--version']));",
    // Every way a fetching program can be started that is not a plain argv0. Each is harmless if it were
    // ever allowed to run (--version), so a guard that failed would be seen without anything being fetched.
    "await attempt('shellTrue', () => spawnSync('curl --version', { shell: true }));",
    "await attempt('shCurl', () => spawnSync('sh', ['-c', 'curl --version']));",
    "await attempt('bashLcClone', () => execFileSync('bash', ['-lc', 'git clone --version']));",
    "await attempt('execLine', () => execSync('echo before && npm --version'));",
    "await attempt('upperCase', () => spawnSync('CURL', ['--version']));",
    "await attempt('envWrapped', () => spawnSync('env', ['FOO=1', 'wget', '--version']));",
    "await attempt('pythonPip', () => spawnSync('python3', ['-m', 'pip', '--version']));",
    "await attempt('dockerRun', () => spawnSync('docker', ['run', '--version']));",
    // ...and the same shapes with nothing to fetch in them go through.
    "await attempt('shellLocal', () => spawnSync('echo hello', { shell: true }));",
    "await attempt('shLocal', () => spawnSync('sh', ['-c', 'echo hello']));",
    "await attempt('nodeLocal', () => spawnSync(process.execPath, ['--version']));",
    "await attempt('lineLocalGit', () => execSync('git --version'));",
    // The list the manifest check uses, one by one: nothing on it is missing from the guard.
    "for (const name of FETCHING_PROGRAMS) await attempt('fetcher:' + name, () => spawnSync(name, ['--version']));",
    'console.log(JSON.stringify(seen));',
  ].join('\n'));
  const r = spawnSync(process.execPath, [...GUARD, sample], { env: cleanEnv(machine, { GCTO_E2E_NET_LOG: log }), cwd: machine.root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const blockedSpawns = ['curl', 'gitClone', 'npm', 'shellTrue', 'shCurl', 'bashLcClone', 'execLine', 'upperCase', 'envWrapped', 'pythonPip', 'dockerRun'];
  assert.deepEqual(JSON.parse(r.stdout), {
    fetch: 'blocked', socket: 'blocked', dns: 'blocked',
    ...Object.fromEntries(blockedSpawns.map(name => [name, 'blocked'])),
    localGit: 'ALLOWED', shellLocal: 'ALLOWED', shLocal: 'ALLOWED', nodeLocal: 'ALLOWED', lineLocalGit: 'ALLOWED',
    ...Object.fromEntries(FETCHING_PROGRAMS.map(name => ['fetcher:' + name, 'blocked'])),
  });
  assert.deepEqual(attempts(log).map(a => a.kind).sort(), ['dns', 'fetch', 'loaded', 'socket', ...Array(blockedSpawns.length + FETCHING_PROGRAMS.length).fill('spawn')]);
});

test('init with the network blocked completes and makes no network call, no clone and no package-manager spawn', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' }), log = path.join(machine.root, 'net.log');
  const run = runInit(machine, pkg, { env: { GCTO_E2E_NET_LOG: log }, nodeArgs: GUARD });
  assert.equal(run.status, 0, tail(run.output));
  // 'loaded' is the guard announcing itself in the init process; anything else is an attempt.
  assert.deepEqual(attempts(log).map(a => `${a.kind}: ${a.detail}`).filter(line => !line.startsWith('loaded:')), []);
  assert.equal(attempts(log).filter(a => a.kind === 'loaded').length, 1, 'the guard was active in the init process');
  assert.equal(readHost(machine).registry.plugins[PLUGIN_KEY][0].version, '3.72.0', 'activation completed offline');
  assert.deepEqual(ranFiles(pkg), SUCCESSFUL_INIT_RUNS);
  assert.equal(fs.existsSync(path.join(machine.home, '.great_cto', 'skills')), false, 'no skill repository was cloned');
});
