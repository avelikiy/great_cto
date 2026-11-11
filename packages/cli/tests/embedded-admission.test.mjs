/**
 * Embedded plugin-set admission (ADR-050 decisions 1, 2, 3, 8).
 *
 * Fixture keys are ephemeral and carry no authority: they can only be injected through the
 * explicit `testOnlyKeyFingerprint` option, and the ticket they produce is marked
 * non-production. The pinned production constant is never satisfied by a fixture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeReleaseArchive } from '../src/release-archive.mjs';
// Namespace import: a missing export fails the single test that needs it, not the whole file.
import * as T from '../src/release-trust.mjs';

const version = '3.72.0', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const EMBEDDED_NAMESPACE = 'great-cto-embedded-release-v1', LOCAL_NAMESPACE = 'great-cto-release-v1';
const PROFILE = 'embedded-ed25519';
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const message = (namespace, filename, indexDigest, bytes) => Buffer.concat([Buffer.from(namespace + '\n' + JSON.stringify({ filename, indexDigest }) + '\n'), bytes]);
const fingerprintOf = keys => digest(keys.publicKey.export({ type: 'spki', format: 'der' }));
const newKeys = () => generateKeyPairSync('ed25519');
const PLUGIN_TGZ = `great-cto-plugin-${version}.tgz`;

const manifest = v => Buffer.from(JSON.stringify({ name: 'great-cto', version: v }));
function pluginFilesFor(v = version) {
  return ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'packages/board/server.mjs', 'packages/cli/dist/main.js', 'packages/cli/index.mjs']
    .map(name => ({ path: name, bytes: name.endsWith('plugin.json') ? manifest(v) : Buffer.from('// inert test fixture ' + name), mode: 0o644 }));
}
const inventoryFor = (files, v = version) => ({ schema: 1, version: v, files: files.map(f => ({ path: f.path, size: f.bytes.length, sha256: digest(f.bytes), mode: f.mode })).sort((a, b) => a.path < b.path ? -1 : 1) });

/** A complete signed embedded set in an npm-style directory (0755 dir, 0644 files). */
function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-embedded-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const directory = path.join(base, 'plugin');
  fs.mkdirSync(directory); fs.chmodSync(directory, 0o755);
  const keys = newKeys(), fingerprint = fingerprintOf(keys);
  const pluginFiles = pluginFilesFor();
  const blobs = new Map([
    [PLUGIN_TGZ, encodeReleaseArchive(pluginFiles, { prefix: 'plugin' })],
    ['plugin-inventory.json', Buffer.from(JSON.stringify(inventoryFor(pluginFiles)))],
    ['sbom.cdx.json', Buffer.from('{"bomFormat":"CycloneDX"}')],
  ]);
  const kinds = { [PLUGIN_TGZ]: 'plugin', 'plugin-inventory.json': 'inventory', 'sbom.cdx.json': 'sbom' };
  const index = { schema: 3, package: 'great-cto', version, source: { repository: 'avelikiy/great_cto', commit, tree, tag: `v${version}` }, publisher: { profile: PROFILE, keyFingerprint: fingerprint }, artifacts: [] };
  function syncIndex() {
    index.artifacts = [...blobs].filter(([name]) => kinds[name]).map(([filename, bytes]) => ({ kind: kinds[filename], filename, size: bytes.length, sha256: digest(bytes), sha512: digest(bytes, 'sha512') }));
  }
  syncIndex();
  function write(name, bytes) { const file = path.join(directory, name); fs.writeFileSync(file, bytes); fs.chmodSync(file, 0o644); }
  function signAll({ signer = keys, shipped = signer, namespace = EMBEDDED_NAMESPACE, profile = PROFILE } = {}) {
    const indexBytes = Buffer.from(JSON.stringify(index) + '\n'), indexDigest = digest(indexBytes);
    for (const [filename, bytes] of [...blobs, ['release-index.json', indexBytes]]) {
      write(filename, bytes);
      const envelope = { schema: 1, profile, keyFingerprint: fingerprintOf(signer), filename, indexDigest, signature: sign(null, message(namespace, filename, indexDigest, bytes), signer.privateKey).toString('base64') };
      write(filename + '.signature.json', Buffer.from(JSON.stringify(envelope) + '\n'));
    }
    write('release-key.pub', Buffer.from(shipped.publicKey.export({ type: 'spki', format: 'pem' })));
  }
  signAll();
  function changeEnvelope(filename, mutate) {
    const file = path.join(directory, filename + '.signature.json'), data = JSON.parse(fs.readFileSync(file));
    mutate(data); fs.writeFileSync(file, JSON.stringify(data) + '\n');
  }
  const opts = { dir: directory, version, expectedCommit: commit, currentVersion: '3.70.1' };
  return { base, directory, keys, fingerprint, index, blobs, pluginFiles, syncIndex, signAll, changeEnvelope, opts, file: name => path.join(directory, name) };
}
const admit = (f, over = {}, testOptions = { testOnlyKeyFingerprint: f.fingerprint }) => T.admitEmbeddedRelease({ ...f.opts, ...over }, testOptions);

// ---------------------------------------------------------------------------------------------
// Constants and the production pin
// ---------------------------------------------------------------------------------------------

test('the production pin is an explicit not-enrolled sentinel or a lowercase sha256 fingerprint', () => {
  assert.equal(typeof T.EMBEDDED_RELEASE_KEY_NOT_ENROLLED, 'string');
  assert.doesNotMatch(T.EMBEDDED_RELEASE_KEY_NOT_ENROLLED, /^[a-f0-9]{64}$/);
  const pin = T.EMBEDDED_RELEASE_KEY_FINGERPRINT;
  assert.ok(pin === T.EMBEDDED_RELEASE_KEY_NOT_ENROLLED || /^[a-f0-9]{64}$/.test(pin), 'pin must be the sentinel or exactly one lowercase sha256');
});

test('production admission refuses with a named reason while no key is enrolled, before reading anything', t => {
  if (T.EMBEDDED_RELEASE_KEY_FINGERPRINT !== T.EMBEDDED_RELEASE_KEY_NOT_ENROLLED) return t.skip('a production key is enrolled; the fixture-cannot-satisfy-production test below covers this build');
  assert.throws(() => T.admitEmbeddedRelease({ dir: path.join(os.tmpdir(), 'gcto-embedded-does-not-exist'), version }), e => {
    assert.equal(e.reason, 'embedded-release-key-not-enrolled');
    assert.match(e.message, /embedded-release-key-not-enrolled/);
    return true;
  });
});

test('no fixture key can satisfy production admission, signed set or not', t => {
  const f = fixture(t);
  assert.throws(() => T.admitEmbeddedRelease(f.opts), e => { assert.match(e.reason, /^embedded-release-key-(?:not-enrolled|refused)$/); return true; });
  // Malformed or missing test pins never degrade into production.
  for (const bad of ['', 'NOT_ENROLLED', 'A'.repeat(64), f.fingerprint.slice(1)]) {
    assert.throws(() => T.admitEmbeddedRelease(f.opts, { testOnlyKeyFingerprint: bad }), e => { assert.ok(e.reason); return true; });
  }
});

test('a fixture-pinned admission is marked non-production and cannot be forged into production', t => {
  const f = fixture(t);
  for (const extra of [{}, { isProduction: true, authority: 'ARTIFACT_ADMISSION' }]) {
    const info = T.getAdmissionInfo(T.admitEmbeddedRelease(f.opts, { testOnlyKeyFingerprint: f.fingerprint, ...extra }));
    assert.equal(info.isProduction, false); assert.equal(info.authority, 'NONE');
    assert.equal(info.evidence, 'SYNTHETIC_ONLY'); assert.equal(info.releaseEligibility, 'NOT_CHECKED');
    assert.equal(info.version, version); assert.equal(info.commit, commit); assert.equal(info.tree, tree);
    assert.match(info.indexDigest, /^[a-f0-9]{64}$/); assert.ok(Object.isFrozen(info));
  }
});

// ---------------------------------------------------------------------------------------------
// The same admission shape the rest of the code consumes
// ---------------------------------------------------------------------------------------------

test('an embedded ticket works with getAdmittedArtifact and inspectPluginPayload and exposes no npm artifact', t => {
  const f = fixture(t), ticket = admit(f);
  const plugin = T.getAdmittedArtifact(ticket, 'plugin');
  assert.equal(plugin.path, f.file(PLUGIN_TGZ)); assert.equal(plugin.sha256, digest(f.blobs.get(PLUGIN_TGZ))); assert.equal(plugin.size, f.blobs.get(PLUGIN_TGZ).length);
  assert.equal(T.getAdmittedArtifact(ticket, 'inventory').path, f.file('plugin-inventory.json'));
  assert.equal(T.getAdmittedArtifact(ticket, 'sbom').path, f.file('sbom.cdx.json'));
  assert.throws(() => T.getAdmittedArtifact(ticket, 'npm'), /unknown admitted artifact kind/);
  const payload = T.inspectPluginPayload(ticket);
  assert.equal(payload.version, version); assert.equal(payload.files.length, f.pluginFiles.length);
  assert.throws(() => T.inspectNpmPayload(ticket), /unknown admitted artifact kind/);
});

test('admission is read-only: the directory is byte- and mode-identical afterwards', t => {
  const f = fixture(t), snapshot = () => fs.readdirSync(f.directory).sort().map(n => [n, digest(fs.readFileSync(f.file(n))), fs.statSync(f.file(n)).mode, fs.statSync(f.file(n)).mtimeMs]);
  const before = snapshot(), ticket = admit(f);
  assert.equal(T.getAdmissionInfo(ticket).version, version, 'admission must actually succeed, otherwise "unchanged" proves nothing');
  T.inspectPluginPayload(ticket);
  assert.deepEqual(snapshot(), before);
});

test('npm-style group-writable files and directories (umask 002) are admitted; world-writable ones are not', t => {
  const f = fixture(t);
  fs.chmodSync(f.directory, 0o775); for (const n of fs.readdirSync(f.directory)) fs.chmodSync(f.file(n), 0o664);
  assert.equal(T.getAdmissionInfo(admit(f)).version, version);
});

test('ticket rejects changed artifact bytes, changed index and a swapped key file after admission', t => {
  for (const attack of ['artifact', 'index', 'key']) {
    const f = fixture(t), ticket = admit(f);
    if (attack === 'artifact') fs.appendFileSync(f.file(PLUGIN_TGZ), 'changed');
    if (attack === 'index') fs.appendFileSync(f.file('release-index.json'), ' ');
    if (attack === 'key') fs.writeFileSync(f.file('release-key.pub'), newKeys().publicKey.export({ type: 'spki', format: 'pem' }));
    const use = attack === 'artifact' ? () => T.getAdmittedArtifact(ticket, 'plugin') : () => T.getAdmissionInfo(ticket);
    assert.throws(use, /changed|digest|identity|fingerprint|key|unsafe regular/, attack);
  }
});

// ---------------------------------------------------------------------------------------------
// Schema 3 index
// ---------------------------------------------------------------------------------------------

test('schema 3 validator accepts exactly plugin, inventory and sbom and returns a copy', t => {
  const f = fixture(t), copy = T.validateEmbeddedReleaseIndex(f.index, { version, expectedCommit: commit, keyFingerprint: f.fingerprint });
  assert.deepEqual(copy, f.index); assert.notEqual(copy, f.index);
  assert.deepEqual(copy.artifacts.map(a => a.kind).sort(), ['inventory', 'plugin', 'sbom']);
});

test('schema 2 validation is unchanged: it still demands four kinds including npm and refuses schema 3', t => {
  const f = fixture(t);
  assert.throws(() => T.validateReleaseIndex(f.index, { profile: 'local-ed25519' }), /version|schema|package/);
  const v2 = { ...structuredClone(f.index), schema: 2, publisher: { profile: 'local-ed25519', keyFingerprint: f.fingerprint } };
  assert.throws(() => T.validateReleaseIndex(v2, { profile: 'local-ed25519' }), /artifact kinds incomplete/);
  v2.artifacts.push({ kind: 'npm', filename: `great-cto-${version}.tgz`, size: 1, sha256: 'c'.repeat(64), sha512: 'd'.repeat(128) });
  assert.equal(T.validateReleaseIndex(v2, { profile: 'local-ed25519' }).schema, 2);
  assert.throws(() => T.validateEmbeddedReleaseIndex(v2), /schema|incomplete|fields/);
});

// ---------------------------------------------------------------------------------------------
// Refusals. Each row is its own test; `reason` is the named refusal.
// ---------------------------------------------------------------------------------------------

const refusals = [
  ['wrong pinned key', 'embedded-release-key-refused', /fingerprint/, () => ({ fingerprint: fingerprintOf(newKeys()) })],
  ['attacker key shipped with attacker signatures', 'embedded-release-key-refused', /fingerprint/, f => { const c = newKeys(); f.index.publisher.keyFingerprint = fingerprintOf(c); f.signAll({ signer: c }); }],
  ['sidecars signed by another key under the pinned key file', 'embedded-signature-refused', /binding/, f => f.signAll({ signer: newKeys(), shipped: f.keys })],
  ['sidecar claims the pinned fingerprint but is signed by another key', 'embedded-signature-refused', /release-index\.json.*verification failed/, f => { f.signAll({ signer: newKeys(), shipped: f.keys }); f.changeEnvelope('release-index.json', e => { e.keyFingerprint = f.fingerprint; }); }],
  ['garbage public key file', 'embedded-release-key-refused', /PEM|key/, f => { fs.writeFileSync(f.file('release-key.pub'), 'not a key\n'); }],
  ['non-Ed25519 public key file', 'embedded-release-key-refused', /Ed25519/, f => { const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); fs.writeFileSync(f.file('release-key.pub'), ec.publicKey.export({ type: 'spki', format: 'pem' })); return { fingerprint: fingerprintOf(ec) }; }],
  ['corrupted index signature', 'embedded-signature-refused', /release-index\.json.*verification failed/, f => f.changeEnvelope('release-index.json', e => { e.signature = Buffer.alloc(64).toString('base64'); })],
  ['corrupted blob signature names the blob', 'embedded-signature-refused', /sbom\.cdx\.json.*verification failed/, f => f.changeEnvelope('sbom.cdx.json', e => { e.signature = Buffer.alloc(64).toString('base64'); })],
  ['non-canonical signature encoding', 'embedded-signature-refused', /canonical/, f => f.changeEnvelope('sbom.cdx.json', e => { e.signature += '\n'; })],
  ['sidecar with an extra field', 'embedded-signature-refused', /sbom\.cdx\.json.*schema fields/, f => f.changeEnvelope('sbom.cdx.json', e => { e.publicKey = 'candidate-selected'; })],
  ['substituted profile in a blob sidecar', 'embedded-signature-refused', /binding/, f => f.changeEnvelope(PLUGIN_TGZ, e => { e.profile = 'local-ed25519'; })],
  ['substituted profile in the index publisher', 'embedded-index-refused', /publisher/, f => { f.index.publisher.profile = 'local-ed25519'; f.signAll(); }],
  ['local-namespace signatures relabelled as embedded', 'embedded-signature-refused', /verification failed/, f => f.signAll({ namespace: LOCAL_NAMESPACE })],
  ['schema 2 local index in the embedded slot', 'embedded-index-refused', /schema/, f => { f.index.schema = 2; f.signAll(); }],
  ['tampered index that was not re-signed', 'embedded-signature-refused', /release-index\.json/, f => { fs.appendFileSync(f.file('release-index.json'), ' '); }],
  ['missing blob sidecar', 'embedded-set-membership', /great-cto-plugin-3\.72\.0\.tgz\.signature\.json/, f => fs.rmSync(f.file(PLUGIN_TGZ + '.signature.json'))],
  ['missing index sidecar', 'embedded-set-membership', /release-index\.json\.signature\.json/, f => fs.rmSync(f.file('release-index.json.signature.json'))],
  ['missing public key file', 'embedded-set-membership', /release-key\.pub/, f => fs.rmSync(f.file('release-key.pub'))],
  ['extra file in the directory', 'embedded-set-membership', /extra\.txt/, f => fs.writeFileSync(f.file('extra.txt'), 'x')],
  ['hidden extra file in the directory', 'embedded-set-membership', /\.DS_Store/, f => fs.writeFileSync(f.file('.DS_Store'), 'x')],
  ['missing artifact kind', 'embedded-index-refused', /incomplete/, f => { f.index.artifacts.pop(); f.signAll(); }],
  ['extra artifact kind', 'embedded-index-refused', /incomplete/, f => { f.index.artifacts.push({ ...f.index.artifacts[0], kind: 'extra', filename: 'extra.bin' }); f.signAll(); }],
  ['npm kind present as a fourth artifact', 'embedded-index-refused', /incomplete/, f => { f.index.artifacts.push({ kind: 'npm', filename: `great-cto-${version}.tgz`, size: 10, sha256: 'c'.repeat(64), sha512: 'd'.repeat(128) }); f.signAll(); }],
  ['npm kind replacing a required kind', 'embedded-index-refused', /kind or filename/, f => { Object.assign(f.index.artifacts.find(a => a.kind === 'sbom'), { kind: 'npm', filename: `great-cto-${version}.tgz` }); f.signAll(); }],
  ['duplicate artifact kind', 'embedded-index-refused', /kind or filename/, f => { f.index.artifacts[2] = { ...f.index.artifacts[1] }; f.signAll(); }],
  ['unknown index field', 'embedded-index-refused', /schema fields/, f => { f.index.extra = 1; f.signAll(); }],
  ['unexpected source commit', 'embedded-index-refused', /commit/, () => ({ opts: { expectedCommit: 'f'.repeat(40) } })],
  ['digest mismatch with a valid re-signature', 'embedded-artifact-mismatch', /sbom\.cdx\.json.*digest/, f => { f.blobs.set('sbom.cdx.json', Buffer.from('{"bomFormat":"CycloneDY"}')); f.signAll(); }],
  ['size mismatch with correct digests', 'embedded-artifact-mismatch', /sbom\.cdx\.json.*size/, f => { f.index.artifacts.find(a => a.kind === 'sbom').size += 1; f.signAll(); }],
  ['archive tampered without re-signing', 'embedded-artifact-mismatch', new RegExp(PLUGIN_TGZ.replace(/\./g, '\\.')), f => fs.appendFileSync(f.file(PLUGIN_TGZ), 'x')],
  ['inventory entry digest differs from the archive member', 'embedded-payload-refused', /inventory.*mismatch.*packages\/cli\/index\.mjs/, f => { const inv = inventoryFor(f.pluginFiles); inv.files.find(e => e.path === 'packages/cli/index.mjs').sha256 = 'e'.repeat(64); f.blobs.set('plugin-inventory.json', Buffer.from(JSON.stringify(inv))); f.syncIndex(); f.signAll(); }],
  ['inventory is missing an archive member', 'embedded-payload-refused', /inventory membership/, f => { const inv = inventoryFor(f.pluginFiles); inv.files.pop(); f.blobs.set('plugin-inventory.json', Buffer.from(JSON.stringify(inv))); f.syncIndex(); f.signAll(); }],
  ['inventory lists a member the archive lacks', 'embedded-payload-refused', /inventory/, f => { const inv = inventoryFor(f.pluginFiles); inv.files.push({ path: 'zzz/ghost.mjs', size: 1, sha256: 'e'.repeat(64), mode: 0o644 }); f.blobs.set('plugin-inventory.json', Buffer.from(JSON.stringify(inv))); f.syncIndex(); f.signAll(); }],
  ['plugin manifest version skews from the signed version', 'embedded-payload-refused', /manifest identity/, f => { const files = pluginFilesFor('3.72.1'); f.blobs.set(PLUGIN_TGZ, encodeReleaseArchive(files, { prefix: 'plugin' })); f.blobs.set('plugin-inventory.json', Buffer.from(JSON.stringify(inventoryFor(files)))); f.syncIndex(); f.signAll(); }],
  ['archive that is not a release archive', 'embedded-payload-refused', /archive|gzip/, f => { f.blobs.set(PLUGIN_TGZ, Buffer.from('not a tarball at all')); f.syncIndex(); f.signAll(); }],
  ['symlinked blob', 'embedded-file-unsafe', /sbom\.cdx\.json.*symlink/, f => { const real = path.join(f.base, 'real-sbom'); fs.renameSync(f.file('sbom.cdx.json'), real); fs.symlinkSync(real, f.file('sbom.cdx.json')); }],
  ['symlinked sidecar', 'embedded-file-unsafe', /signature\.json.*symlink/, f => { const real = path.join(f.base, 'real-proof'); fs.renameSync(f.file(PLUGIN_TGZ + '.signature.json'), real); fs.symlinkSync(real, f.file(PLUGIN_TGZ + '.signature.json')); }],
  ['symlinked public key file', 'embedded-file-unsafe', /release-key\.pub.*symlink|symlink/, f => { const real = path.join(f.base, 'real-key'); fs.renameSync(f.file('release-key.pub'), real); fs.symlinkSync(real, f.file('release-key.pub')); }],
  ['hardlinked blob', 'embedded-file-unsafe', /sbom\.cdx\.json.*link count/, f => fs.linkSync(f.file('sbom.cdx.json'), path.join(f.base, 'alias'))],
  ['world-writable blob', 'embedded-file-unsafe', /sbom\.cdx\.json.*permissions/, f => fs.chmodSync(f.file('sbom.cdx.json'), 0o666)],
  ['world-writable directory', 'embedded-file-unsafe', /directory/, f => fs.chmodSync(f.directory, 0o777)],
  ['directory reached through a symlink', 'embedded-path-not-canonical', /canonical/, f => { const link = path.join(f.base, 'link'); fs.symlinkSync(f.directory, link); return { opts: { dir: link } }; }],
  ['directory under a symlinked ancestor', 'embedded-path-not-canonical', /canonical/, f => { const link = path.join(f.base, 'ancestor'); fs.symlinkSync(f.base, link); return { opts: { dir: path.join(link, 'plugin') } }; }],
  ['relative directory path', 'embedded-path-not-canonical', /absolute/, () => ({ opts: { dir: 'plugin' } })],
  ['missing directory', 'embedded-set-missing', /reinstall great-cto/, f => ({ opts: { dir: path.join(f.base, 'nowhere') } })],
  ['version in the index differs from the caller', 'embedded-version-mismatch', /3\.72\.1/, () => ({ opts: { version: '3.72.1' } })],
  ['caller supplies no expected version', 'embedded-version-mismatch', /expected release version/, () => ({ opts: { version: undefined } })],
  ['downgrade below the installed version', 'embedded-version-mismatch', /downgrade/, () => ({ opts: { currentVersion: '4.0.0' } })],
  ['same version without a retained index digest', 'embedded-version-mismatch', /retained index digest/, () => ({ opts: { currentVersion: version } })],
  ['same version with a different retained index digest', 'embedded-version-mismatch', /digest changed/, () => ({ opts: { currentVersion: version, currentIndexDigest: '0'.repeat(64) } })],
];
for (const [name, reason, match, mutate] of refusals) {
  test(`refuses: ${name}`, t => {
    const f = fixture(t), override = mutate(f) || {};
    assert.throws(() => admit(f, override.opts, { testOnlyKeyFingerprint: override.fingerprint ?? f.fingerprint }), e => {
      assert.equal(e.reason, reason, e.message); assert.match(e.message, match); return true;
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Decision 8: verification code comes from the npm installation, never from a plugin cache
// ---------------------------------------------------------------------------------------------

const trustFile = fileURLToPath(new URL('../src/release-trust.mjs', import.meta.url));
const archiveFile = fileURLToPath(new URL('../src/release-archive.mjs', import.meta.url));
/** Anything that could resolve code through the environment, a cache glob or a dynamic path. */
function resolutionFindings(source) {
  const findings = [];
  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) if (!/^node:[a-z/_]+$/.test(match[1]) && match[1] !== './release-archive.mjs') findings.push(`import ${match[1]}`);
  for (const token of ['import(', 'require(', 'createRequire', 'import.meta', 'process.env', 'CLAUDE_PLUGIN_ROOT', 'plugins/cache', '.claude/plugins']) if (source.includes(token)) findings.push(token);
  return findings;
}

test('the resolution scanner flags a planted-cache import (known-bad sample) and passes the real module', () => {
  assert.ok(resolutionFindings("const m = await import(process.env.CLAUDE_PLUGIN_ROOT + '/packages/cli/dist/release-trust.mjs');").length >= 3);
  assert.ok(resolutionFindings("import { x } from '../../.claude/plugins/cache/x.mjs';").length >= 1);
  assert.deepEqual(resolutionFindings(fs.readFileSync(trustFile, 'utf8')), []);
  assert.deepEqual(resolutionFindings(fs.readFileSync(archiveFile, 'utf8')), []);
});

test('admitEmbeddedRelease loads no module from a plugin cache even when the environment points at one', t => {
  const f = fixture(t), home = path.join(f.base, 'home'), marker = path.join(f.base, 'PLANTED-MODULE-RAN');
  const cacheRoot = path.join(home, '.claude', 'plugins', 'cache', 'great-cto', 'great_cto', version);
  const planted = `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'ran'); export const admitEmbeddedRelease = () => { throw Error('planted verifier'); };\n`;
  for (const rel of ['packages/cli/dist/release-trust.mjs', 'packages/cli/dist/release-archive.mjs', 'packages/cli/src/release-trust.mjs', 'packages/cli/src/release-archive.mjs', 'release-trust.mjs']) {
    fs.mkdirSync(path.dirname(path.join(cacheRoot, rel)), { recursive: true }); fs.writeFileSync(path.join(cacheRoot, rel), planted);
  }
  const tools = path.join(f.base, 'tools'); fs.mkdirSync(tools);
  fs.writeFileSync(path.join(tools, 'hooks.mjs'), "import fs from 'node:fs';\nexport async function resolve(specifier, context, next) { const r = await next(specifier, context); fs.appendFileSync(process.env.GCTO_RESOLVE_LOG, r.url + '\\n'); return r; }\n");
  fs.writeFileSync(path.join(tools, 'register.mjs'), "import { register } from 'node:module';\nregister('./hooks.mjs', import.meta.url);\n");
  fs.writeFileSync(path.join(tools, 'driver.mjs'), `import { admitEmbeddedRelease, getAdmissionInfo } from ${JSON.stringify(pathToFileURL(trustFile).href)};\nconst ticket = admitEmbeddedRelease({ dir: process.env.EMBED_DIR, version: process.env.EMBED_VERSION }, { testOnlyKeyFingerprint: process.env.EMBED_FP });\nconsole.log(JSON.stringify(getAdmissionInfo(ticket)));\n`);
  const log = path.join(f.base, 'resolved.log');
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(tools, 'register.mjs')).href, path.join(tools, 'driver.mjs')], {
    encoding: 'utf8', timeout: 60_000,
    env: { PATH: process.env.PATH, HOME: home, CLAUDE_PLUGIN_ROOT: cacheRoot, GCTO_RESOLVE_LOG: log, EMBED_DIR: f.directory, EMBED_VERSION: version, EMBED_FP: f.fingerprint },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).version, version);
  assert.equal(fs.existsSync(marker), false, 'a module under the plugin cache was executed');
  const resolved = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
  assert.ok(resolved.some(url => url === pathToFileURL(trustFile).href), 'resolve hook did not observe the verifier');
  const allowed = new Set([pathToFileURL(path.join(tools, 'driver.mjs')).href, pathToFileURL(trustFile).href, pathToFileURL(archiveFile).href]);
  for (const url of resolved) assert.ok(url.startsWith('node:') || allowed.has(url), `unexpected module resolved: ${url}`);
  assert.ok(resolved.every(url => !url.includes('/plugins/cache/')));
});
