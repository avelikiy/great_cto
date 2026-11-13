// Isolated-HOME E2E, part 5: `great-cto init` with the network taken away.
//
// network-guard.mjs is preloaded into the init process (`node --import`). It makes fetch, TCP sockets and
// DNS fail like an unplugged cable, refuses the programs that exist to fetch (curl, wget, package
// managers, ssh, gh) and git's remote commands, and records every attempt. The first test proves the
// guard catches each of those; the second shows `init` completing without making one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { newMachine, buildPackage, runInit, cleanEnv, readHost, executions, NETWORK_GUARD, PLUGIN_KEY, tail } from './harness.mjs';

const GUARD = ['--import', pathToFileURL(NETWORK_GUARD).href];
const attempts = log => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];

test('the network guard records every way out (known-bad sample)', t => {
  const machine = newMachine(t), sample = path.join(machine.root, 'sample.mjs'), log = path.join(machine.root, 'net.log');
  fs.writeFileSync(sample, [
    "import net from 'node:net';",
    "import dns from 'node:dns';",
    "import { spawnSync, execFileSync } from 'node:child_process';",
    'const seen = {};',
    "const attempt = async (name, fn) => { try { await fn(); seen[name] = 'ALLOWED'; } catch (e) { seen[name] = /E2E guard/.test(e.message) ? 'blocked' : 'other: ' + e.message; } };",
    "await attempt('fetch', () => fetch('http://example.invalid/'));",
    "await attempt('socket', () => { net.connect(9, '127.0.0.1').on('error', () => {}); });",
    "await attempt('dns', () => new Promise((resolve, reject) => dns.lookup('example.invalid', e => e ? reject(e) : resolve())));",
    "await attempt('curl', () => execFileSync('curl', ['http://example.invalid/']));",
    "await attempt('gitClone', () => spawnSync('git', ['clone', 'https://example.invalid/x.git', 'x']));",
    "await attempt('npm', () => spawnSync('npm', ['view', 'x']));",
    "await attempt('localGit', () => spawnSync('git', ['--version']));",
    'console.log(JSON.stringify(seen));',
  ].join('\n'));
  const r = spawnSync(process.execPath, [...GUARD, sample], { env: cleanEnv(machine, { GCTO_E2E_NET_LOG: log }), cwd: machine.root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { fetch: 'blocked', socket: 'blocked', dns: 'blocked', curl: 'blocked', gitClone: 'blocked', npm: 'blocked', localGit: 'ALLOWED' });
  assert.deepEqual(attempts(log).map(a => a.kind).sort(), ['dns', 'fetch', 'loaded', 'socket', 'spawn', 'spawn', 'spawn']);
});

test('init with the network blocked completes and makes no network call, no clone and no package-manager spawn', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' }), log = path.join(machine.root, 'net.log');
  const run = runInit(machine, pkg, { env: { GCTO_E2E_NET_LOG: log }, nodeArgs: GUARD });
  assert.equal(run.status, 0, tail(run.output));
  // 'loaded' is the guard announcing itself in the init process; anything else is an attempt.
  assert.deepEqual(attempts(log).map(a => `${a.kind}: ${a.detail}`).filter(line => !line.startsWith('loaded:')), []);
  assert.equal(attempts(log).filter(a => a.kind === 'loaded').length, 1, 'the guard was active in the init process');
  assert.equal(readHost(machine).registry.plugins[PLUGIN_KEY][0].version, '3.72.0', 'activation completed offline');
  assert.equal(executions(pkg).length, 1);
  assert.equal(fs.existsSync(path.join(machine.home, '.great_cto', 'skills')), false, 'no skill repository was cloned');
});
