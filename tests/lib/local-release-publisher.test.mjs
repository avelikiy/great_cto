import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { makeReleaseIndex } from '../../scripts/build-release-artifacts.mjs';
import { encodeReleaseArchive } from '../../packages/cli/src/release-archive.mjs';
import { admitRelease, getAdmissionInfo } from '../../packages/cli/src/release-trust.mjs';
import { signLocalReleaseArtifacts } from '../../scripts/sign-local-release-artifacts.mjs';
import { publishLocalRelease } from '../../scripts/publish-local-release.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const version = '1.2.3', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
function fixture(t, { runtime = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-local-publisher-')));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'artifacts'); fs.mkdirSync(directory, { mode: 0o700 });
  for (const filename of [`great-cto-${version}.tgz`, `great-cto-plugin-${version}.tgz`, 'plugin-inventory.json', 'sbom.cdx.json']) fs.writeFileSync(path.join(directory, filename), 'test-only inert artifact '+filename, { mode: 0o600 });
  if (runtime) {
    const npmFiles = [{ path: 'package.json', mode: 0o644, bytes: Buffer.from(JSON.stringify({ name: 'great-cto', version, bin: { 'great-cto': 'index.mjs' } })) }, ...['index.mjs','dist/main.js','board/packages/board/server.mjs'].map(name => ({ path: name, mode: 0o644, bytes: Buffer.from('// inert fixture') }))];
    const pluginFiles = ['.claude-plugin/plugin.json','.codex-plugin/plugin.json','packages/cli/dist/main.js','packages/cli/index.mjs','packages/board/server.mjs'].map(name => ({ path: name, mode: 0o644, bytes: Buffer.from(name.endsWith('plugin.json') ? JSON.stringify({ name: 'great-cto', version }) : '// inert fixture') }));
    fs.writeFileSync(path.join(directory, `great-cto-${version}.tgz`), encodeReleaseArchive(npmFiles));
    fs.writeFileSync(path.join(directory, `great-cto-plugin-${version}.tgz`), encodeReleaseArchive(pluginFiles, { prefix: 'plugin' }));
    const inventory = { schema: 1, version, files: pluginFiles.map(f => ({ path: f.path, size: f.bytes.length, sha256: digest(f.bytes), mode: f.mode })).sort((a,b) => a.path.localeCompare(b.path)) };
    fs.writeFileSync(path.join(directory, 'plugin-inventory.json'), JSON.stringify(inventory));
    fs.writeFileSync(path.join(directory, 'sbom.cdx.json'), '{"bomFormat":"CycloneDX"}');
  }
  const index = makeReleaseIndex({ version, commit, tree, directory });
  fs.writeFileSync(path.join(directory, 'release-index.json'), JSON.stringify(index)+'\n', { mode: 0o600 });
  const keys = generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(root, 'test-private.pem');
  fs.writeFileSync(privateKeyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const publicKeyPath = path.join(root, 'test-public.pem');
  fs.writeFileSync(publicKeyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600 });
  const keyFingerprint = digest(keys.publicKey.export({ type: 'spki', format: 'der' }));
  return { root, directory, privateKeyPath, publicKeyPath, keyFingerprint, keys };
}

test('local signer signs every frozen blob with filename and index binding using real Ed25519', t => {
  const f = fixture(t);
  const result = signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit });
  assert.equal(result.state, 'SIGNED_AND_VERIFIED'); assert.equal(result.published, false);
  const raw = fs.readFileSync(path.join(f.directory, 'release-index.json'));
  const index = JSON.parse(raw); assert.equal(index.schema, 2);
  assert.deepEqual(index.publisher, { profile: 'local-ed25519', keyFingerprint: f.keyFingerprint });
  const indexDigest = digest(raw);
  for (const filename of [...index.artifacts.map(x => x.filename), 'release-index.json']) {
    const envelope = JSON.parse(fs.readFileSync(path.join(f.directory, filename+'.signature.json')));
    assert.deepEqual(Object.keys(envelope).sort(), ['schema','profile','keyFingerprint','filename','indexDigest','signature'].sort());
    assert.equal(envelope.filename, filename); assert.equal(envelope.indexDigest, indexDigest);
    const bytes = fs.readFileSync(path.join(f.directory, filename));
    const message = Buffer.concat([Buffer.from('great-cto-release-v1\n'+JSON.stringify({ filename, indexDigest })+'\n'), bytes]);
    assert.equal(verify(null, message, f.keys.publicKey, Buffer.from(envelope.signature, 'base64')), true);
  }
});

test('signer refuses wrong key fingerprint and malformed or changed archives before writing', t => {
  for (const mutation of ['fingerprint', 'artifact', 'source']) {
    const f = fixture(t), before = fs.readFileSync(path.join(f.directory, 'release-index.json'));
    if (mutation === 'artifact') fs.appendFileSync(path.join(f.directory, 'sbom.cdx.json'), 'changed');
    assert.throws(() => signLocalReleaseArtifacts({ ...f, version, expectedCommit: mutation === 'source' ? 'c'.repeat(40) : commit, keyFingerprint: mutation === 'fingerprint' ? '0'.repeat(64) : f.keyFingerprint }));
    assert.equal(fs.readdirSync(f.directory).filter(x => x.endsWith('.signature.json')).length, 0);
    assert.deepEqual(fs.readFileSync(path.join(f.directory, 'release-index.json')), before);
  }
});

test('signer refuses preexisting proofs, links and permissive private keys', t => {
  for (const mutation of ['proof', 'permission', 'symlink', 'hardlink', 'key-in-stage']) {
    const f = fixture(t);
    if (mutation === 'proof') fs.writeFileSync(path.join(f.directory, 'release-index.json.signature.json'), 'existing', { mode: 0o600 });
    if (mutation === 'permission') fs.chmodSync(f.privateKeyPath, 0o644);
    if (mutation === 'symlink') { const link = path.join(f.root, 'link.pem'); fs.symlinkSync(f.privateKeyPath, link); f.privateKeyPath = link; }
    if (mutation === 'hardlink') fs.linkSync(f.privateKeyPath, path.join(f.root, 'copy.pem'));
    if (mutation === 'key-in-stage') { const target = path.join(f.directory, 'private.pem'); fs.renameSync(f.privateKeyPath, target); f.privateKeyPath = target; }
    assert.throws(() => signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit }));
  }
});

test('repeated signing cannot replace an already frozen signature set', t => {
  const f = fixture(t); signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit });
  const before = fs.readFileSync(path.join(f.directory, 'release-index.json.signature.json'));
  assert.throws(() => signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit }));
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'release-index.json.signature.json')), before);
});

test('signer requires an explicit stable version and one canonical Ed25519 PKCS8 key', t => {
  for (const attack of ['missing-version','key-junk','wrong-algorithm']) {
    const f = fixture(t);
    if (attack === 'key-junk') fs.appendFileSync(f.privateKeyPath, 'extra data\n');
    if (attack === 'wrong-algorithm') fs.writeFileSync(f.privateKeyPath, generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
    assert.throws(() => signLocalReleaseArtifacts({ ...f, version: attack === 'missing-version' ? undefined : version, expectedCommit: commit }), /version|canonical|Ed25519/);
    assert.equal(fs.readdirSync(f.directory).length, 5);
  }
});

test('legacy cd-local publish refuses before invoking any executable from PATH', t => {
  const root = fixture(t).root, marker = path.join(root, 'ran');
  for (const command of ['node','npm','git','uname']) fs.writeFileSync(path.join(root, command), '#!/bin/sh\nprintf x >> "'+marker+'"\nexit 99\n', { mode: 0o700 });
  const result = spawnSync('/bin/bash', [new URL('../../scripts/cd-local.sh', import.meta.url).pathname, '--publish'], { encoding: 'utf8', env: { PATH: root } });
  assert.equal(result.status, 1); assert.match(result.stdout+result.stderr, /verified|admitted/i);
  assert.equal(fs.existsSync(marker), false);
});

test('publisher refuses unapproved or unadmitted bytes with zero process or network calls', async t => {
  const f = fixture(t); let calls = 0;
  const run = () => { calls++; throw Error('unexpected process'); }, fetchFn = async () => { calls++; throw Error('unexpected network'); };
  await assert.rejects(publishLocalRelease({ directory: f.directory, version, source: f.root }, { run, fetchFn }));
  assert.equal(calls, 0);
  await assert.rejects(publishLocalRelease({ directory: f.directory, version, source: f.root, approveCommit: commit, approveIndexDigest: digest(fs.readFileSync(path.join(f.directory, 'release-index.json'))), localPublicKeyPath: f.publicKeyPath, localKeyFingerprint: f.keyFingerprint }, { run, fetchFn }));
  assert.equal(calls, 0);
});

function publishFixture(t) {
  const f = fixture(t, { runtime: true });
  const signed = signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit });
  const npmPath = path.join(f.root, 'trusted-npm'); fs.writeFileSync(npmPath, '#!/bin/sh\nexit 91\n', { mode: 0o700 });
  const npmAuthFile = path.join(f.root, 'operator-auth'); fs.writeFileSync(npmAuthFile, '//registry.npmjs.org/:_authToken=test-only-noncredential\n', { mode: 0o600 });
  const bytes = fs.readFileSync(path.join(f.directory, `great-cto-${version}.tgz`));
  const integrity = 'sha512-'+createHash('sha512').update(bytes).digest('base64');
  const metadata = { name: 'great-cto', version, dist: { integrity } };
  const options = { directory: f.directory, version, source: f.root, approveCommit: commit, approveIndexDigest: signed.indexDigest, approval: 'local-owner-release', localPublicKeyPath: f.publicKeyPath, localKeyFingerprint: f.keyFingerprint, npmPath, npmSha256: digest(fs.readFileSync(npmPath)), npmAuthFile };
  const calls = [];
  const run = (binary, args, child) => {
    calls.push({ binary, args, child });
    if (binary === 'git') {
      if (args.includes('--is-shallow-repository')) return 'false\n';
      if (args.some(x => x.endsWith('^{tree}'))) return tree+'\n';
      if (args.includes('--verify')) return commit+'\n';
      return '';
    }
    assert.equal(binary, npmPath); assert.equal(args[0], 'publish');
    assert.deepEqual(fs.readFileSync(args[1]), bytes);
    assert.equal(args.includes('--ignore-scripts'), true);
    assert.equal(args.includes('--provenance'), false);
    assert.equal(child.env.NODE_OPTIONS, undefined);
    assert.equal(child.env.NPM_TOKEN, undefined);
    assert.equal(child.env.npm_config_registry, undefined);
    assert.equal(child.env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/');
    assert.equal(child.stdio[2], 'pipe');
    return '';
  };
  return { ...f, options, signed, bytes, metadata, calls, run };
}

test('real local signer output passes strict artifact admission before simulated same-tar publication', async t => {
  const f = publishFixture(t);
  const info = getAdmissionInfo(admitRelease({ directory: f.directory, version, expectedCommit: commit, profile: 'local-ed25519', localPublicKeyPath: f.publicKeyPath, localKeyFingerprint: f.keyFingerprint }));
  assert.equal(info.evidence, 'LOCAL_ED25519_VERIFIED');
  let requests=0;
  const fetchFn = async url => {
    requests++;
    if (url.endsWith('.tgz')) return new Response(f.bytes);
    return requests === 1 ? new Response('not found', { status: 404 }) : Response.json(f.metadata);
  };
  const result = await publishLocalRelease(f.options, { run: f.run, fetchFn });
  assert.equal(requests, 3); assert.equal(f.calls.filter(x => x.binary === f.options.npmPath).length, 1);
  assert.equal(result.state, 'SIMULATED_PUBLICATION_READBACK'); assert.equal(result.authority, 'NONE');
  assert.equal(result.published, false); assert.equal(result.releaseEligibility, 'NOT_CHECKED');
});

test('existing registry version still requires complete exact tarball readback', async t => {
  for (const tamper of [false, true]) {
    const f = publishFixture(t); let requests=0;
    const fetchFn = async url => { requests++; return url.endsWith('.tgz') ? new Response(tamper ? Buffer.alloc(f.bytes.length) : f.bytes) : Response.json(f.metadata); };
    if (tamper) await assert.rejects(publishLocalRelease(f.options, { run: f.run, fetchFn }), /differs/);
    else assert.equal((await publishLocalRelease(f.options, { run: f.run, fetchFn })).authority, 'NONE');
    assert.equal(requests, 3); assert.equal(f.calls.filter(x => x.binary === f.options.npmPath).length, 0);
  }
});

test('registry unknown or mismatched existing integrity never triggers npm publication', async t => {
  for (const status of [401,429,500,200]) {
    const f = publishFixture(t);
    const fetchFn = async () => status === 200 ? Response.json({ ...f.metadata, dist: { integrity: 'wrong' } }) : new Response('unknown', { status });
    await assert.rejects(publishLocalRelease(f.options, { run: f.run, fetchFn }), /unknown|differ/);
    assert.equal(f.calls.filter(x => x.binary === f.options.npmPath).length, 0);
  }
});

test('explicit key, ship pin, npm pin and isolated auth refuse before any process or network', async t => {
  for (const mutation of ['approval','index','key','npm','auth','authmode']) {
    const f = publishFixture(t); let calls=0;
    if (mutation === 'approval') f.options.approval='';
    if (mutation === 'index') f.options.approveIndexDigest='0'.repeat(64);
    if (mutation === 'key') f.options.localKeyFingerprint='0'.repeat(64);
    if (mutation === 'npm') f.options.npmSha256='0'.repeat(64);
    if (mutation === 'auth') fs.writeFileSync(f.options.npmAuthFile, 'registry=https://other.invalid\n');
    if (mutation === 'authmode') fs.chmodSync(f.options.npmAuthFile, 0o644);
    await assert.rejects(publishLocalRelease(f.options, { run: () => { calls++; throw Error('unexpected'); }, fetchFn: async () => { calls++; throw Error('unexpected'); } }));
    assert.equal(calls, 0);
  }
});

test('npm child errors cannot expose auth contents and cannot be reported as a success', async t => {
  const f = publishFixture(t);
  const run = (binary, args, options) => {
    if (binary === f.options.npmPath) throw Error(fs.readFileSync(options.env.NPM_CONFIG_USERCONFIG, 'utf8'));
    return f.run(binary,args,options);
  };
  const fetchFn = async () => new Response('absent', { status: 404 });
  await assert.rejects(publishLocalRelease(f.options, { run, fetchFn }), error => { assert.equal(error.message.includes('test-only-noncredential'), false); return /output withheld/.test(error.message); });
});

test('signing write failure retains partial proof evidence and refuses overwrite on retry', t => {
  const f = fixture(t), realOpen = fs.openSync;
  const failingProof = path.join(f.directory, 'sbom.cdx.json.signature.json');
  const mocked = t.mock.method(fs, 'openSync', (file, ...args) => { if (file === failingProof) throw Object.assign(Error('simulated private disk write failure'), { code: 'ENOSPC' }); return realOpen(file, ...args); });
  assert.throws(() => signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit }), /simulated/);
  mocked.mock.restore();
  assert.equal(fs.existsSync(path.join(f.directory, '.local-signing-lock')), false);
  assert.ok(fs.readdirSync(f.directory).some(x => x.endsWith('.signature.json')));
  assert.throws(() => signLocalReleaseArtifacts({ ...f, version, expectedCommit: commit }), /fresh|unsealed|overwrite/);
});

test('test-only registry adapter cannot be combined with a real executing process runner', async t => {
  const f = publishFixture(t);
  await assert.rejects(publishLocalRelease(f.options, { fetchFn: async () => new Response('absent', { status: 404 }) }), /non-executing process adapter/);
});
