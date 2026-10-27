import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { encodeReleaseArchive } from '../../src/release-archive.mjs';
// Ephemeral, inert fixtures only. Never use the operator release key or home.
const version = '3.72.0', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const message = (filename, indexDigest, bytes) => Buffer.concat([Buffer.from('great-cto-release-v1\n' + JSON.stringify({ filename, indexDigest }) + '\n'), bytes]);
export function nativeAdmissionFixture(t, mutate = () => {}) {
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
  mutate(pluginFiles);
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
