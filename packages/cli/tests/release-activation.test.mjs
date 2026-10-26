import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { activateNpmRelease, recoverNpmActivation, resolveNpmInstallation, proposeManagedPluginActivation } from '../src/release-activation.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-activation-')));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = path.join(root, 'prefix');
  const pkg = path.join(prefix, 'lib/node_modules/great-cto');
  const bin = path.join(prefix, 'bin/great-cto');
  fs.mkdirSync(pkg, { recursive: true }); fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'index.mjs'), 'previous runtime', { mode: 0o755 });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'great-cto', version: '3.70.1', bin: { 'great-cto': 'index.mjs' } }));
  fs.symlinkSync('../lib/node_modules/great-cto/index.mjs', bin);
  const neighbour = path.join(prefix, 'lib/node_modules/other-tool/keep');
  fs.mkdirSync(path.dirname(neighbour), { recursive: true }); fs.writeFileSync(neighbour, 'untouched');
  const archive = path.join(root, 'candidate.tgz'); fs.writeFileSync(archive, 'admitted fixture bytes', { mode: 0o600 });
  const files = [
    { path: 'package.json', bytes: Buffer.from(JSON.stringify({ name: 'great-cto', version: '3.71.0', bin: { 'great-cto': 'index.mjs' } })), mode: 0o644 },
    { path: 'index.mjs', bytes: Buffer.from('candidate runtime'), mode: 0o755 },
    { path: 'dist/main.js', bytes: Buffer.from('candidate main'), mode: 0o644 },
    { path: 'board/packages/board/server.mjs', bytes: Buffer.from('candidate board'), mode: 0o644 },
  ];
  const calls = [];
  const admission = Object.freeze({ fixture: true });
  const info = { version: '3.71.0', source: { commit: 'a'.repeat(40) }, isProduction: false, authority: 'NONE', evidence: 'SYNTHETIC_ONLY' };
  const access = {
    getAdmissionInfo: x => { assert.equal(x, admission); return info; },
    getAdmittedArtifact: (x, kind) => { assert.equal(x, admission); assert.equal(kind, 'npm'); return { path: archive, sha256: sha(fs.readFileSync(archive)), size: fs.statSync(archive).size }; },
    inspectNpmPayload: x => { assert.equal(x, admission); return { version: info.version, files }; },
  };
  function installFiles() {
    fs.rmSync(pkg, { recursive: true, force: true }); fs.mkdirSync(pkg, { recursive: true });
    for (const file of files) { const target = path.join(pkg, file.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.bytes, { mode: file.mode }); }
  }
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes('install')) { installFiles(); return { status: 0, stdout: '' }; }
    return { status: 0, stdout: args.includes('--version') ? info.version + '\n' : '[]\n' };
  };
  const stateRoot = path.join(root, 'state');
  const testing = { fixtureRoot: root, access, run };
  const options = { binaryPath: bin, stateRoot, npmPath: process.execPath, testing };
  return { root, prefix, pkg, bin, neighbour, archive, files, calls, admission, info, access, installFiles, testing, stateRoot, options };
}

test('resolved npm shim identifies the exact package and prefix; unknown and foreign bins refuse', t => {
  const f = fixture(t), p = resolveNpmInstallation(f.bin);
  assert.equal(p.prefix, f.prefix); assert.equal(p.packageRoot, f.pkg); assert.equal(p.binPath, f.bin);
  const foreign = path.join(f.root, 'foreign.mjs'); fs.writeFileSync(foreign, 'foreign');
  fs.unlinkSync(f.bin); fs.symlinkSync(foreign, f.bin);
  assert.throws(() => resolveNpmInstallation(f.bin), /unsupported|selection|installation/i);
});

test('a synthetic or forged admission never authorizes real activation or state creation', t => {
  const f = fixture(t);
  const r = activateNpmRelease(f.admission, { binaryPath: f.bin, stateRoot: f.stateRoot, npmPath: process.execPath });
  assert.equal(r.state, 'REFUSED'); assert.equal(r.authority, 'NONE'); assert.equal(fs.existsSync(f.stateRoot), false);
  assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('synthetic transaction mode requires a private temporary fixture and contained prefix', t => {
  const f = fixture(t);
  fs.chmodSync(f.root, 0o755);
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.stateRoot), false);
});

test('missing artifact admission refuses before target, state or runner mutation', t => {
  const f = fixture(t); f.access.getAdmittedArtifact = () => { throw new Error('bad signature'); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.stateRoot), false);
});

test('simulation runs only the exact local offline command with sanitized configuration and no authority', t => {
  const f = fixture(t);
  const original = { NODE_OPTIONS: process.env.NODE_OPTIONS, npm_config_prefix: process.env.npm_config_prefix, NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY };
  process.env.NODE_OPTIONS = '--require hostile-helper'; process.env.npm_config_prefix = '/hostile'; process.env.NPM_CONFIG_REGISTRY = 'https://invalid.example';
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_SMOKE_PASSED'); assert.equal(r.authority, 'NONE'); assert.equal(r.evidence, 'SYNTHETIC_ONLY'); assert.equal(r.releaseEligibility, 'NOT_CHECKED');
  assert.equal(f.calls.length, 3);
  const install = f.calls[0];
  assert.equal(install.command, process.execPath); assert.ok(install.args[2].startsWith(f.stateRoot + path.sep)); assert.equal(fs.readFileSync(install.args[2], 'utf8'), fs.readFileSync(f.archive, 'utf8')); assert.ok(install.args.includes('--ignore-scripts')); assert.ok(install.args.includes('--offline'));
  assert.equal(install.args[install.args.indexOf('--prefix') + 1], f.prefix); assert.equal(install.args.some(x => /@latest|https?:\/\//.test(x)), false);
  assert.equal(install.options.env.NODE_OPTIONS, undefined); assert.equal(install.options.env.npm_config_prefix, undefined); assert.notEqual(install.options.env.NPM_CONFIG_REGISTRY, 'https://invalid.example');
  assert.equal(fs.readFileSync(install.options.env.NPM_CONFIG_USERCONFIG, 'utf8'), '');
  assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
  assert.equal(fs.statSync(f.stateRoot).mode & 0o777, 0o700);
});

test('legacy backup is labelled as recovery, preserves exact bytes and never copies neighbouring packages', t => {
  const f = fixture(t); const r = activateNpmRelease(f.admission, f.options);
  const journal = JSON.parse(fs.readFileSync(path.join(f.stateRoot, r.installationId, 'transaction.json')));
  assert.equal(journal.previous.provenance, 'LEGACY_LOCAL_RECOVERY'); assert.equal(journal.previous.version, '3.70.1');
  const backup = path.join(f.stateRoot, r.installationId, 'transactions', r.transactionId, 'previous/package');
  assert.equal(fs.readFileSync(path.join(backup, 'index.mjs'), 'utf8'), 'previous runtime');
  assert.equal(fs.existsSync(path.join(backup, '../other-tool')), false);
});

test('unsupported package-manager layouts refuse before state or install calls', t => {
  const f = fixture(t), special = path.join(f.root, '.pnpm/global/lib/node_modules/great-cto/index.mjs');
  fs.mkdirSync(path.dirname(special), { recursive: true }); fs.writeFileSync(special, 'other');
  const r = activateNpmRelease(f.admission, { ...f.options, binaryPath: special });
  assert.equal(r.state, 'UNSUPPORTED'); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.stateRoot), false);
});

test('package symlinks refuse before activation without touching their target', t => {
  const f = fixture(t); fs.symlinkSync(f.neighbour, path.join(f.pkg, 'escape'));
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('hardlinked package files refuse without modifying the outside inode', t => {
  const f = fixture(t); fs.linkSync(f.neighbour, path.join(f.pkg, 'linked'));
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('synthetic execution cannot use an installation belonging to a different fixture', t => {
  const a = fixture(t), b = fixture(t);
  const r = activateNpmRelease(a.admission, { ...a.options, binaryPath: b.bin });
  assert.equal(r.state, 'REFUSED'); assert.equal(a.calls.length, 0); assert.equal(fs.existsSync(a.stateRoot), false);
  assert.equal(fs.readFileSync(path.join(b.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('archive tampering between admission and activation refuses before process launch', t => {
  const f = fixture(t); f.testing.onPhase = phase => { if (phase === 'SNAPSHOTTED') fs.writeFileSync(f.archive, 'changed after admission'); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('transaction state cannot be created inside the installation it would back up', t => {
  const f = fixture(t), stateRoot = path.join(f.pkg, 'private-state');
  const r = activateNpmRelease(f.admission, { ...f.options, stateRoot });
  assert.equal(r.state, 'REFUSED'); assert.equal(r.reason, 'staging-inside-installation');
  assert.equal(fs.existsSync(stateRoot), false); assert.equal(f.calls.length, 0);
});

test('a pinned npm executable digest mismatch refuses before install', t => {
  const f = fixture(t), npmPath = path.join(f.root, 'npm-fixture');
  fs.writeFileSync(npmPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const r = activateNpmRelease(f.admission, { ...f.options, npmPath, npmSha256: '0'.repeat(64) });
  assert.equal(r.state, 'REFUSED'); assert.equal(r.reason, 'trusted-npm-digest-mismatch'); assert.equal(f.calls.length, 0);
});

test('executable or archive tampering at the activation boundary launches no process', t => {
  for (const tamper of ['npm', 'archive']) {
    const f = fixture(t), npmPath = path.join(f.root, 'inert-npm');
    fs.writeFileSync(npmPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    f.testing.onPhase = phase => { if (phase === 'ACTIVATING') fs.writeFileSync(tamper === 'npm' ? npmPath : f.archive, 'tampered at checkpoint'); };
    const r = activateNpmRelease(f.admission, { ...f.options, npmPath, npmSha256: sha(fs.readFileSync(npmPath)) });
    assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(f.calls.length, 0); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
  }
});

test('target drift after snapshot is refused and concurrent operator bytes remain intact', t => {
  const f = fixture(t); f.testing.onPhase = phase => { if (phase === 'SNAPSHOTTED') fs.writeFileSync(path.join(f.pkg, 'index.mjs'), 'operator edit'); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'operator edit');
});

test('exclusive transaction lock rejects a simultaneous activation', t => {
  const f = fixture(t); let nested;
  f.testing.onPhase = phase => { if (phase === 'SNAPSHOTTED') nested = activateNpmRelease(f.admission, f.options); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_SMOKE_PASSED'); assert.equal(nested.state, 'REFUSED'); assert.match(nested.reason, /lock|busy/i); assert.equal(f.calls.length, 3);
});

test('recovery never steals a lock from a still-running activation process', t => {
  const f = fixture(t); let nested;
  f.testing.onPhase = phase => { if (phase === 'SNAPSHOTTED') nested = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing }); };
  assert.equal(activateNpmRelease(f.admission, f.options).state, 'SIMULATED_SMOKE_PASSED');
  assert.equal(nested.state, 'RECOVERY_REQUIRED'); assert.equal(nested.reason, 'installation-busy-lock'); assert.equal(f.calls.length, 3);
});

test('failed install restores only the captured legacy package and bin', t => {
  const f = fixture(t); f.testing.run = (command, args) => { f.calls.push({ command, args }); f.installFiles(); return { status: 7 }; };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(f.calls.length, 1);
  assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
  assert.equal(fs.readlinkSync(f.bin), '../lib/node_modules/great-cto/index.mjs'); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('legacy rollback preserves empty directories and original directory permissions', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.pkg, 'empty'), { mode: 0o750 }); fs.chmodSync(f.pkg, 0o750);
  f.testing.run = () => { f.installFiles(); return { status: 3 }; };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(fs.statSync(f.pkg).mode & 0o777, 0o750);
  assert.equal(fs.statSync(path.join(f.pkg, 'empty')).mode & 0o777, 0o750);
});

test('rollback restores a changed but still owned npm bin selection', t => {
  const f = fixture(t);
  f.testing.run = () => { f.installFiles(); fs.unlinkSync(f.bin); fs.symlinkSync(path.join(f.pkg, 'index.mjs'), f.bin); return { status: 4 }; };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(fs.readlinkSync(f.bin), '../lib/node_modules/great-cto/index.mjs'); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('successful installer exit without admitted bytes is rolled back without executing candidate', t => {
  const f = fixture(t); f.testing.run = (...args) => { f.calls.push(args); return { status: 0 }; };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(f.calls.length, 1); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('unobserved partial removal is recovery-required and never replaces neighbouring state', t => {
  const f = fixture(t); f.testing.run = () => { fs.rmSync(f.pkg, { recursive: true }); return { status: 2 }; };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'RECOVERY_REQUIRED'); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('smoke failure rolls back without running a second smoke or candidate lifecycle', t => {
  const f = fixture(t); const install = f.testing.run;
  f.testing.run = (command, args, options) => args.includes('install') ? install(command, args, options) : (f.calls.push({ command, args, options }), { status: 1, stdout: '' });
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(f.calls.length, 2); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('drift after the recorded installer outcome is not overwritten during rollback', t => {
  const f = fixture(t);
  f.testing.onPhase = phase => { if (phase === 'ACTIVE') fs.writeFileSync(path.join(f.pkg, 'index.mjs'), 'concurrent update'); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'RECOVERY_REQUIRED'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'concurrent update'); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('foreign bin replacement is preserved and reports recovery-required', t => {
  const f = fixture(t);
  f.testing.onPhase = phase => { if (phase === 'ACTIVE') { fs.unlinkSync(f.bin); fs.symlinkSync(f.neighbour, f.bin); } };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'RECOVERY_REQUIRED'); assert.equal(fs.readlinkSync(f.bin), f.neighbour); assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
});

test('crash at ACTIVATING preserves journal and recovers unchanged preexisting state', t => {
  const f = fixture(t); f.testing.onPhase = phase => { if (phase === 'ACTIVATING') throw Object.assign(new Error('fixture crash'), { activationCrash: true }); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'RECOVERY_REQUIRED'); assert.equal(f.calls.length, 0);
  const recovered = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(recovered.state, 'SIMULATED_ROLLED_BACK'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('crash after recorded activation can restore exact previous state with its hash', t => {
  const f = fixture(t); f.testing.onPhase = phase => { if (phase === 'ACTIVE') throw Object.assign(new Error('fixture crash'), { activationCrash: true }); };
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'RECOVERY_REQUIRED'); assert.equal(f.calls.length, 1);
  const recovered = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(recovered.state, 'SIMULATED_ROLLED_BACK'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
});

test('corrupted recovery snapshot refuses restoration rather than trusting journal metadata', t => {
  const f = fixture(t); f.testing.onPhase = phase => { if (phase === 'ACTIVE') throw Object.assign(new Error('fixture crash'), { activationCrash: true }); };
  const r = activateNpmRelease(f.admission, f.options);
  const backup = path.join(f.stateRoot, r.installationId, 'transactions', r.transactionId, 'previous/package/index.mjs'); fs.writeFileSync(backup, 'tampered backup');
  const recovered = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(recovered.state, 'RECOVERY_REQUIRED'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'candidate runtime');
});

test('completed recovery checks current bytes and refuses subsequent operator drift', t => {
  const f = fixture(t); assert.equal(activateNpmRelease(f.admission, f.options).state, 'SIMULATED_SMOKE_PASSED');
  fs.writeFileSync(path.join(f.pkg, 'index.mjs'), 'later operator edit');
  const r = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(r.state, 'RECOVERY_REQUIRED'); assert.equal(r.authority, 'NONE'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'later operator edit');
});

test('completed recovery is idempotent without dispatch or additional installation authority', t => {
  const f = fixture(t); assert.equal(activateNpmRelease(f.admission, f.options).state, 'SIMULATED_SMOKE_PASSED');
  const r = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(r.state, 'SIMULATED_ALREADY_ACTIVE'); assert.equal(r.authority, 'NONE'); assert.equal(f.calls.length, 3);
});

test('completed activation remains selected after a crash at the committed smoke phase', t => {
  const f = fixture(t); f.testing.onPhase = phase => { if (phase === 'SMOKE_PASSED') throw Object.assign(new Error('crash'), { activationCrash: true }); };
  assert.equal(activateNpmRelease(f.admission, f.options).state, 'RECOVERY_REQUIRED');
  const r = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(r.state, 'SIMULATED_ALREADY_ACTIVE'); assert.equal(r.authority, 'NONE'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'candidate runtime');
});

test('an actual child-process exit leaves an orphan lock that explicit recovery can reclaim', t => {
  const f = fixture(t);
  const moduleUrl = new URL('../src/release-activation.mjs', import.meta.url).href;
  const source = [
    'import fs from "node:fs"; import {createHash} from "node:crypto";',
    'import {activateNpmRelease} from ' + JSON.stringify(moduleUrl) + ';',
    'const f=JSON.parse(process.argv[1]); const a={};',
    'const access={getAdmissionInfo:()=>({version:"3.71.0",source:{commit:"a".repeat(40)},isProduction:false,authority:"NONE"}),',
    'getAdmittedArtifact:()=>({path:f.archive,sha256:createHash("sha256").update(fs.readFileSync(f.archive)).digest("hex"),size:fs.statSync(f.archive).size}),',
    'inspectNpmPayload:()=>({version:"3.71.0",files:f.files.map(x=>({...x,bytes:Buffer.from(x.bytes)}))})};',
    'activateNpmRelease(a,{binaryPath:f.bin,stateRoot:f.stateRoot,npmPath:process.execPath,testing:{fixtureRoot:f.root,access,run:()=>{throw Error("must not execute")},onPhase:p=>{if(p==="ACTIVATING")process.exit(87)}}});',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source, JSON.stringify({ root: f.root, archive: f.archive, bin: f.bin, stateRoot: f.stateRoot, files: f.files.map(x => ({ ...x, bytes: [...x.bytes] })) })], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 87, child.stderr);
  const r = recoverNpmActivation({ prefix: f.prefix, stateRoot: f.stateRoot, testing: f.testing });
  assert.equal(r.state, 'SIMULATED_ROLLED_BACK'); assert.equal(fs.readFileSync(path.join(f.pkg, 'index.mjs'), 'utf8'), 'previous runtime');
  assert.ok(fs.readdirSync(path.join(f.stateRoot, r.installationId)).some(x => x.startsWith('orphaned-lock-')));
});

test('same admitted digest is idempotent and a same-version replacement refuses', t => {
  const f = fixture(t); assert.equal(activateNpmRelease(f.admission, f.options).state, 'SIMULATED_SMOKE_PASSED');
  const count = f.calls.length; const same = activateNpmRelease(f.admission, f.options);
  assert.equal(same.state, 'SIMULATED_ALREADY_ACTIVE'); assert.equal(f.calls.length, count);
  fs.writeFileSync(f.archive, 'new bytes'); const changed = activateNpmRelease(f.admission, f.options);
  assert.equal(changed.state, 'REFUSED'); assert.equal(f.calls.length, count);
});

test('synthetic and production transaction namespaces cannot share an admission watermark', t => {
  const f = fixture(t), r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'SIMULATED_SMOKE_PASSED'); const count = f.calls.length;
  const watermark = path.join(f.stateRoot, r.installationId, 'watermark.json'), value = JSON.parse(fs.readFileSync(watermark));
  value.synthetic = false; fs.writeFileSync(watermark, JSON.stringify(value));
  const next = activateNpmRelease(f.admission, f.options);
  assert.equal(next.state, 'REFUSED'); assert.equal(next.reason, 'watermark-authority-mismatch'); assert.equal(f.calls.length, count);
});

test('downgrade below the highest admitted watermark refuses without invoking npm', t => {
  const f = fixture(t); assert.equal(activateNpmRelease(f.admission, f.options).state, 'SIMULATED_SMOKE_PASSED'); const count = f.calls.length;
  f.info.version = '3.70.0';
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, count);
});

test('managed/native proposal cannot turn a forged or synthetic ticket into activation authority', t => {
  const f = fixture(t); const r = proposeManagedPluginActivation(f.admission);
  assert.equal(r.state, 'REFUSED'); assert.equal(r.authority, 'NONE'); assert.equal(f.calls.length, 0);
});


test('symlinked bin directory refuses before mutating an outside selection', t => {
  const f = fixture(t), outside = path.join(f.root, 'outside-bin');
  fs.renameSync(path.dirname(f.bin), outside); fs.symlinkSync(outside, path.dirname(f.bin));
  fs.unlinkSync(path.join(outside, 'great-cto')); fs.symlinkSync(path.join(f.pkg, 'index.mjs'), path.join(outside, 'great-cto'));
  const r = activateNpmRelease(f.admission, f.options);
  assert.equal(r.state, 'REFUSED'); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.stateRoot), false);
  assert.equal(fs.readlinkSync(path.join(outside, 'great-cto')), path.join(f.pkg, 'index.mjs'));
});

test('legacy manifest cannot authorize npm removal of foreign bin or man selections', t => {
  for (const metadata of [{ bin: { 'great-cto': 'index.mjs', foreign: 'index.mjs' } }, { bin: { 'great-cto': 'index.mjs' }, man: 'manual.1' }]) {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.pkg, 'package.json'), JSON.stringify({ name: 'great-cto', version: '3.70.1', ...metadata }));
    const r = activateNpmRelease(f.admission, f.options);
    assert.equal(r.state, 'UNSUPPORTED'); assert.equal(r.reason, 'unsupported-installed-selections'); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.stateRoot), false);
    assert.equal(fs.readFileSync(f.neighbour, 'utf8'), 'untouched');
  }
});
