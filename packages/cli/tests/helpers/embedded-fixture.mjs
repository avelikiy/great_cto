/** A complete signed embedded plugin set under the system temp directory, signed by an ephemeral
 * fixture key. Fixture keys carry no authority: the ticket they produce is non-production. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign, createPrivateKey, createPublicKey } from 'node:crypto';
import { encodeReleaseArchive } from '../../src/release-archive.mjs';
import { admitEmbeddedRelease } from '../../src/release-trust.mjs';

const NAMESPACE = 'great-cto-embedded-release-v1', PROFILE = 'embedded-ed25519';
const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
export const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const message = (filename, indexDigest, bytes) => Buffer.concat([Buffer.from(NAMESPACE + '\n' + JSON.stringify({ filename, indexDigest }) + '\n'), bytes]);

export function pluginFiles(version) {
  const manifest = Buffer.from(JSON.stringify({ name: 'great-cto', version }));
  return [
    { path: '.claude-plugin/plugin.json', bytes: manifest, mode: 0o644 },
    { path: '.codex-plugin/plugin.json', bytes: manifest, mode: 0o644 },
    { path: 'packages/board/server.mjs', bytes: Buffer.from('// inert test fixture\n'), mode: 0o644 },
    { path: 'packages/cli/dist/main.js', bytes: Buffer.from('// inert test fixture\n'), mode: 0o644 },
    { path: 'packages/cli/index.mjs', bytes: Buffer.from(`console.log(${JSON.stringify(version)});\n`), mode: 0o755 },
  ];
}

/** Writes `<base>/plugin/…` and returns what a caller needs to admit it. `privateKeyPem` lets a
 * second process sign the same set again; omit it to generate a key. */
export function writeEmbeddedSet(base, { version = '3.72.0', files = pluginFiles(version), privateKeyPem } = {}) {
  const privateKey = privateKeyPem ? createPrivateKey(privateKeyPem) : generateKeyPairSync('ed25519').privateKey;
  const publicKey = createPublicKey(privateKey);
  const fingerprint = digest(publicKey.export({ type: 'spki', format: 'der' }));
  const directory = path.join(base, 'plugin');
  fs.mkdirSync(directory); fs.chmodSync(directory, 0o755);
  const inventory = { schema: 1, version, files: files.map(f => ({ path: f.path, size: f.bytes.length, sha256: digest(f.bytes), mode: f.mode })).sort((a, b) => a.path < b.path ? -1 : 1) };
  const archive = `great-cto-plugin-${version}.tgz`;
  const blobs = [[archive, 'plugin', encodeReleaseArchive(files, { prefix: 'plugin' })], ['plugin-inventory.json', 'inventory', Buffer.from(JSON.stringify(inventory))], ['sbom.cdx.json', 'sbom', Buffer.from('{"bomFormat":"CycloneDX"}')]];
  const index = { schema: 3, package: 'great-cto', version, source: { repository: 'avelikiy/great_cto', commit, tree, tag: `v${version}` }, publisher: { profile: PROFILE, keyFingerprint: fingerprint },
    artifacts: blobs.map(([filename, kind, bytes]) => ({ kind, filename, size: bytes.length, sha256: digest(bytes), sha512: digest(bytes, 'sha512') })) };
  const indexBytes = Buffer.from(JSON.stringify(index) + '\n'), indexDigest = digest(indexBytes);
  const write = (name, bytes) => { const file = path.join(directory, name); fs.writeFileSync(file, bytes); fs.chmodSync(file, 0o644); };
  for (const [filename, bytes] of [...blobs.map(([name, , bytes]) => [name, bytes]), ['release-index.json', indexBytes]]) {
    write(filename, bytes);
    write(filename + '.signature.json', Buffer.from(JSON.stringify({ schema: 1, profile: PROFILE, keyFingerprint: fingerprint, filename, indexDigest, signature: sign(null, message(filename, indexDigest, bytes), privateKey).toString('base64') }) + '\n'));
  }
  write('release-key.pub', Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
  return { directory, version, fingerprint, files, inventory, inventoryDigest: digest(Buffer.from(JSON.stringify(inventory))), archive: path.join(directory, archive) };
}

export const admitFixture = set => admitEmbeddedRelease({ dir: set.directory, version: set.version, expectedCommit: commit }, { testOnlyKeyFingerprint: set.fingerprint });

export function tempBase(t, prefix = 'gcto-plugin-') {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t?.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}
