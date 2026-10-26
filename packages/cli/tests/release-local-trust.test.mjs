import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { encodeReleaseArchive } from '../src/release-archive.mjs';
import { admitRelease, getAdmissionInfo, getAdmittedArtifact, validateReleaseIndex } from '../src/release-trust.mjs';
import { configureTrustedToolchain, readTrustedToolchain, stageRelease, runDistributionCommand } from '../src/release-update.mjs';

const version = '3.72.0', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const message = (filename, indexDigest, bytes) => Buffer.concat([Buffer.from('great-cto-release-v1\n' + JSON.stringify({ filename, indexDigest }) + '\n'), bytes]);
function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-local-admission-')));
  fs.chmodSync(base, 0o700); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const directory = path.join(base, 'stage'); fs.mkdirSync(directory, { mode: 0o700 });
  const keys = generateKeyPairSync('ed25519');
  const publicKeyPath = path.join(base, 'release.pub');
  fs.writeFileSync(publicKeyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600 });
  const fingerprint = digest(keys.publicKey.export({ type: 'spki', format: 'der' }));
  const npmFiles = [{ path: 'package.json', mode: 0o644, bytes: Buffer.from(JSON.stringify({ name: 'great-cto', version, bin: { 'great-cto': 'index.mjs' } })) },
    ...['index.mjs', 'dist/main.js', 'board/packages/board/server.mjs'].map(name => ({ path: name, bytes: Buffer.from('// inert test fixture'), mode: 0o644 }))];
  const pluginFiles = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'packages/cli/dist/main.js', 'packages/cli/index.mjs', 'packages/board/server.mjs'].map(name => ({ path: name, bytes: Buffer.from(name.endsWith('plugin.json') ? JSON.stringify({ name: 'great-cto', version }) : '// inert test fixture'), mode: 0o644 }));
  const inventory = { schema: 1, version, files: pluginFiles.map(f => ({ path: f.path, size: f.bytes.length, sha256: digest(f.bytes), mode: f.mode })).sort((a, b) => a.path.localeCompare(b.path)) };
  const blobs = new Map([
    [`great-cto-${version}.tgz`, encodeReleaseArchive(npmFiles)],
    [`great-cto-plugin-${version}.tgz`, encodeReleaseArchive(pluginFiles, { prefix: 'plugin' })],
    ['plugin-inventory.json', Buffer.from(JSON.stringify(inventory))], ['sbom.cdx.json', Buffer.from('{"bomFormat":"CycloneDX"}')],
  ]);
  const index = { schema: 2, package: 'great-cto', version, source: { repository: 'avelikiy/great_cto', commit, tree, tag: `v${version}` }, publisher: { profile: 'local-ed25519', keyFingerprint: fingerprint }, artifacts: [...blobs].map(([filename, bytes], i) => ({ kind: ['npm', 'plugin', 'inventory', 'sbom'][i], filename, size: bytes.length, sha256: digest(bytes), sha512: digest(bytes, 'sha512') })) };
  function signAll() {
    blobs.set('release-index.json', Buffer.from(JSON.stringify(index) + '\n'));
    const indexDigest = digest(blobs.get('release-index.json'));
    for (const [filename, bytes] of blobs) {
      fs.writeFileSync(path.join(directory, filename), bytes, { mode: 0o600 });
      const envelope = { schema: 1, profile: 'local-ed25519', keyFingerprint: fingerprint, filename, indexDigest, signature: sign(null, message(filename, indexDigest, bytes), keys.privateKey).toString('base64') };
      fs.writeFileSync(path.join(directory, filename + '.signature.json'), JSON.stringify(envelope) + '\n', { mode: 0o600 });
    }
  }
  signAll();
  const opts = { directory, version, expectedCommit: commit, currentVersion: '3.70.1', profile: 'local-ed25519', localPublicKeyPath: publicKeyPath, localKeyFingerprint: fingerprint };
  function changeEnvelope(filename, mutate) { const file = path.join(directory, filename + '.signature.json'), data = JSON.parse(fs.readFileSync(file)); mutate(data); fs.writeFileSync(file, JSON.stringify(data)); }
  return { base, directory, keys, publicKeyPath, fingerprint, index, blobs, signAll, opts, changeEnvelope };
}

test('explicit local profile admits real Ed25519 proofs and complete inert payloads', t => {
  const f = fixture(t), info = getAdmissionInfo(admitRelease(f.opts));
  assert.equal(info.authority, 'ARTIFACT_ADMISSION'); assert.equal(info.isProduction, true);
  assert.equal(info.evidence, 'LOCAL_ED25519_VERIFIED'); assert.equal(info.releaseEligibility, 'NOT_CHECKED');
  assert.equal(info.commit, commit); assert.equal(info.tree, tree);
});

test('a local profile never executes an injected verifier or grants synthetic authority', t => {
  const f = fixture(t); let calls = 0;
  const info = getAdmissionInfo(admitRelease(f.opts, { run: () => { calls++; return ''; } }));
  assert.equal(calls, 0); assert.equal(info.authority, 'NONE'); assert.equal(info.evidence, 'SYNTHETIC_ONLY');
});

test('profile and index authority must match explicitly without hosted fallback', t => {
  const f = fixture(t);
  for (const opts of [{}, { profile: 'github-oidc' }, { profile: 'unexpected' }]) assert.throws(() => admitRelease({ ...f.opts, ...opts, ...(Object.keys(opts).length ? {} : { profile: undefined }) }));
  assert.throws(() => validateReleaseIndex(f.index), /profile|schema|version/);
  assert.equal(validateReleaseIndex(f.index, f.opts).schema, 2);
  f.index.publisher.workflow = '.github/workflows/publish.yml'; f.signAll();
  assert.throws(() => admitRelease(f.opts), /publisher|schema/);
});

test('wrong pinned fingerprint, wrong public key and non-Ed25519 keys refuse', t => {
  const f = fixture(t);
  assert.throws(() => admitRelease({ ...f.opts, localKeyFingerprint: 'c'.repeat(64) }), /fingerprint|key/);
  const other = generateKeyPairSync('ed25519'); fs.writeFileSync(f.publicKeyPath, other.publicKey.export({ type: 'spki', format: 'pem' }));
  assert.throws(() => admitRelease(f.opts), /fingerprint|key/);
  const rsa = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  fs.writeFileSync(f.publicKeyPath, rsa.publicKey.export({ type: 'spki', format: 'pem' }));
  assert.throws(() => admitRelease({ ...f.opts, localKeyFingerprint: digest(rsa.publicKey.export({ type: 'spki', format: 'der' })) }), /Ed25519|ed25519|key/);
});

test('key in candidate stage, key symlink, hardlink and writable public key refuse', t => {
  for (const mode of ['candidate', 'symlink', 'hardlink', 'writable']) {
    const f = fixture(t); let key = f.publicKeyPath;
    if (mode === 'candidate') { key = path.join(f.directory, 'release.pub'); fs.copyFileSync(f.publicKeyPath, key); }
    if (mode === 'symlink') { key = path.join(f.base, 'key-link'); fs.symlinkSync(f.publicKeyPath, key); }
    if (mode === 'hardlink') { key = path.join(f.base, 'key-link'); fs.linkSync(f.publicKeyPath, key); }
    if (mode === 'writable') fs.chmodSync(key, 0o622);
    assert.throws(() => admitRelease({ ...f.opts, localPublicKeyPath: key }), /candidate|key|symlink|canonical|permission|regular|link/);
  }
});

test('tampered artifacts, signed index substitution and malformed signatures refuse', t => {
  for (const attack of ['bytes', 'index', 'signature', 'base64', 'length', 'extra', 'duplicate']) {
    const f = fixture(t);
    if (attack === 'bytes') fs.appendFileSync(path.join(f.directory, 'sbom.cdx.json'), 'changed');
    else if (attack === 'index') fs.appendFileSync(path.join(f.directory, 'release-index.json'), ' ');
    else if (attack === 'duplicate') { const file = path.join(f.directory, 'release-index.json.signature.json'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"schema":1', '"schema":1,"schema":1')); }
    else f.changeEnvelope('release-index.json', x => { if (attack === 'signature') x.signature = Buffer.alloc(64).toString('base64'); if (attack === 'base64') x.signature += '\n'; if (attack === 'length') x.signature = Buffer.alloc(32).toString('base64'); if (attack === 'extra') x.publicKey = 'candidate-selected'; });
    assert.throws(() => admitRelease(f.opts), /signature|digest|size|schema|duplicate|proof|envelope/);
  }
});

test('each proof binds filename, index digest, fingerprint and profile', t => {
  for (const field of ['filename', 'indexDigest', 'keyFingerprint', 'profile']) {
    const f = fixture(t); f.changeEnvelope('sbom.cdx.json', x => { x[field] = field.includes('Digest') || field.includes('Fingerprint') ? 'c'.repeat(64) : 'other'; });
    assert.throws(() => admitRelease(f.opts), /signature|proof|envelope|fingerprint|profile|filename|digest/);
  }
});

test('hosted sidecars cannot replace local proofs and unsafe sidecars refuse', t => {
  for (const attack of ['hosted', 'symlink', 'hardlink', 'writable']) {
    const f = fixture(t), proof = path.join(f.directory, 'release-index.json.signature.json'), outside = path.join(f.base, 'proof');
    if (attack === 'hosted') fs.renameSync(proof, path.join(f.directory, 'release-index.json.sigstore.json'));
    if (attack === 'symlink' || attack === 'hardlink') { fs.renameSync(proof, outside); attack === 'symlink' ? fs.symlinkSync(outside, proof) : fs.linkSync(outside, proof); }
    if (attack === 'writable') fs.chmodSync(proof, 0o644);
    assert.throws(() => admitRelease(f.opts), /ENOENT|symlink|canonical|permission|regular|link|membership|profile sidecars/);
  }
});

test('opaque tickets reject changed bytes, index and key after admission', t => {
  for (const attack of ['artifact', 'index', 'key']) {
    const f = fixture(t), ticket = admitRelease(f.opts);
    if (attack === 'artifact') fs.appendFileSync(path.join(f.directory, `great-cto-${version}.tgz`), 'changed');
    if (attack === 'index') fs.appendFileSync(path.join(f.directory, 'release-index.json'), ' ');
    if (attack === 'key') fs.writeFileSync(f.publicKeyPath, generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }));
    assert.throws(() => getAdmittedArtifact(ticket, 'npm'), /changed|digest|identity|key|fingerprint|unsafe regular/);
  }
});

test('local trust enrollment requires acknowledgement, pinned key and no config replacement', t => {
  const f = fixture(t), stateRoot = path.join(f.base, 'trust'), npm = path.join(f.base, 'npm'); fs.writeFileSync(npm, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  const config = { schema: 2, profile: 'local-ed25519', publicKey: { path: f.publicKeyPath, fingerprint: f.fingerprint }, npm: { path: npm, sha256: digest(fs.readFileSync(npm)) } };
  assert.throws(() => configureTrustedToolchain(config, { stateRoot }), /acknowledge/);
  const result = configureTrustedToolchain(config, { stateRoot, acknowledged: true });
  assert.equal(result.authority, 'operator-toolchain-only');
  assert.deepEqual(readTrustedToolchain({ stateRoot }), config);
  assert.equal(fs.statSync(path.join(stateRoot, 'toolchain.json')).mode & 0o777, 0o600);
  assert.throws(() => configureTrustedToolchain(config, { stateRoot, acknowledged: true }), /already configured|rotation/);
  fs.writeFileSync(f.publicKeyPath, generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }));
  assert.throws(() => readTrustedToolchain({ stateRoot }), /fingerprint|key/);
});

test('staging selects local signature suffix only from explicit operator profile', async t => {
  const f = fixture(t), requested = [];
  const fetchFn = async url => { const name = new URL(url).pathname.split('/').at(-1); requested.push(name); const file = path.join(f.directory, name); return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('', { status: 404 }); };
  const staged = await stageRelease(version, { stateRoot: path.join(f.base, 'downloads'), fetchFn, profile: 'local-ed25519' });
  assert.equal(requested.length, 10); assert.equal(requested.filter(x => x.endsWith('.signature.json')).length, 5);
  assert.equal(requested.some(x => x.endsWith('.sigstore.json')), false);
  assert.equal(getAdmissionInfo(admitRelease({ ...f.opts, directory: staged })).evidence, 'LOCAL_ED25519_VERIFIED');
  await assert.rejects(() => stageRelease(version, { stateRoot: path.join(f.base, 'bad-downloads'), fetchFn, profile: 'unknown' }), /profile/);
});


test('correct signatures cannot admit incomplete plugin inventory or dependency-bearing npm payloads', t => {
  for (const attack of ['inventory', 'dependencies']) {
    const f = fixture(t);
    if (attack === 'inventory') {
      const inventory = JSON.parse(f.blobs.get('plugin-inventory.json')); inventory.files.pop();
      f.blobs.set('plugin-inventory.json', Buffer.from(JSON.stringify(inventory)));
    } else {
      const files = [{ path: 'package.json', mode: 0o644, bytes: Buffer.from(JSON.stringify({ name: 'great-cto', version, bin: { 'great-cto': 'index.mjs' }, dependencies: { unadmitted: '1' } })) },
        ...['index.mjs', 'dist/main.js', 'board/packages/board/server.mjs'].map(name => ({ path: name, bytes: Buffer.from('// inert'), mode: 0o644 }))];
      f.blobs.set(`great-cto-${version}.tgz`, encodeReleaseArchive(files));
    }
    for (const artifact of f.index.artifacts) { const bytes = f.blobs.get(artifact.filename); Object.assign(artifact, { size: bytes.length, sha256: digest(bytes), sha512: digest(bytes, 'sha512') }); }
    f.signAll();
    assert.throws(() => admitRelease(f.opts), /inventory|membership|dependenc/);
  }
});

test('proofs from a different correctly signed index cannot be spliced into a release', t => {
  const f = fixture(t), originalProof = fs.readFileSync(path.join(f.directory, 'sbom.cdx.json.signature.json'));
  f.index.source.tree = 'c'.repeat(40); f.signAll();
  fs.writeFileSync(path.join(f.directory, 'sbom.cdx.json.signature.json'), originalProof);
  assert.throws(() => admitRelease(f.opts), /binding|digest|signature/);
});

test('same-version local replay requires retained exact index and downgrade is refused', t => {
  const f = fixture(t), indexDigest = digest(f.blobs.get('release-index.json'));
  assert.throws(() => admitRelease({ ...f.opts, currentVersion: version }), /retained index digest/);
  assert.throws(() => admitRelease({ ...f.opts, currentVersion: version, currentIndexDigest: '0'.repeat(64) }), /digest changed/);
  assert.throws(() => admitRelease({ ...f.opts, currentVersion: '4.0.0' }), /downgrade/);
  assert.equal(getAdmissionInfo(admitRelease({ ...f.opts, currentVersion: version, currentIndexDigest: indexDigest })).version, version);
});

test('local enrollment rejects private PEM, unpinned key, and extra profile fields before creating state', t => {
  for (const attack of ['private', 'unpinned', 'extra']) {
    const f = fixture(t), stateRoot = path.join(f.base, 'trust'), npm = path.join(f.base, 'npm'); fs.writeFileSync(npm, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    const config = { schema: 2, profile: 'local-ed25519', publicKey: { path: f.publicKeyPath, fingerprint: f.fingerprint }, npm: { path: npm, sha256: digest(fs.readFileSync(npm)) } };
    if (attack === 'private') fs.writeFileSync(f.publicKeyPath, f.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    if (attack === 'unpinned') delete config.publicKey.fingerprint;
    if (attack === 'extra') config.cosign = { path: npm, sha256: config.npm.sha256 };
    assert.throws(() => configureTrustedToolchain(config, { stateRoot, acknowledged: true }), /public key|fingerprint|schema|PEM/);
    assert.equal(fs.existsSync(stateRoot), false);
  }
});

test('local CLI enrollment requires the specific key acknowledgement and rejects mixed profiles', t => {
  const f = fixture(t), npm = path.join(f.base, 'npm'); fs.writeFileSync(npm, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  const stateRoot = path.join(f.base, 'trust'), args = ['configure', '--profile', 'local-ed25519', '--public-key', f.publicKeyPath, '--key-fingerprint', f.fingerprint, '--npm', npm, '--npm-sha256', digest(fs.readFileSync(npm))];
  assert.equal(runDistributionCommand(args, { stateRoot }).state, 'REFUSED');
  assert.equal(runDistributionCommand([...args, '--acknowledge-independent-toolchain'], { stateRoot }).state, 'REFUSED');
  assert.equal(runDistributionCommand([...args, '--cosign', npm, '--acknowledge-independent-key'], { stateRoot }).state, 'REFUSED');
  assert.equal(fs.existsSync(stateRoot), false);
  assert.equal(runDistributionCommand([...args, '--acknowledge-independent-key'], { stateRoot }).state, 'TOOLCHAIN_CONFIGURED');
  assert.equal(runDistributionCommand(['status'], { stateRoot }).state, 'TOOLCHAIN_CONFIGURED');
  assert.equal(runDistributionCommand([...args, '--acknowledge-independent-key'], { stateRoot }).state, 'REFUSED');
});
