/** Write the signed plugin set that travels inside the npm package (ADR-050).
 *
 * Nine files: the plugin archive, its inventory and SBOM, a schema-3 index naming exactly those
 * three, one signature sidecar for each of the four, and the public key. The consumer is
 * `admitEmbeddedRelease` in packages/cli/src/release-trust.mjs, and this module finishes by running
 * that same consumer over what it wrote: a set the CLI would refuse is never left on disk.
 *
 * The private key is read once, from a path outside the source tree and the release directory,
 * and is never written, logged or returned.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  EMBEDDED_RELEASE_KEY_FILENAME, EMBEDDED_RELEASE_KEY_FINGERPRINT, EMBEDDED_RELEASE_KEY_NOT_ENROLLED,
  EMBEDDED_RELEASE_PROFILE, admitEmbeddedRelease, embeddedArtifactNames, embeddedReleaseSignatureMessage,
  getAdmissionInfo, validateEmbeddedReleaseIndex,
} from '../packages/cli/src/release-trust.mjs';

const REPOSITORY = 'avelikiy/great_cto';
const SHA256 = /^[a-f0-9]{64}$/;
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

/** Every filename of a complete embedded set for one version, sorted. */
export function embeddedSetMembers(version) {
  const signed = ['release-index.json', ...Object.values(embeddedArtifactNames(version))];
  return [...signed, ...signed.map(name => name + '.signature.json'), EMBEDDED_RELEASE_KEY_FILENAME].sort();
}

function loadSigningKey(privateKeyPath, keyFingerprint, forbiddenRoots) {
  if (typeof privateKeyPath !== 'string' || !path.isAbsolute(privateKeyPath)) throw Error('embedded release key path must be absolute');
  if (!SHA256.test(keyFingerprint || '')) throw Error('embedded release key fingerprint must be 64 lowercase hex characters');
  const real = fs.realpathSync(privateKeyPath);
  for (const root of forbiddenRoots) if (inside(fs.realpathSync(root), real)) throw Error('embedded release key must be outside the source tree and the release directory');
  const stat = fs.lstatSync(privateKeyPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16 * 1024 || (stat.mode & 0o077)) throw Error('embedded release key must be a private regular file');
  const pem = fs.readFileSync(privateKeyPath, 'utf8');
  let privateKey;
  try { privateKey = createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' }); } catch { throw Error('cannot load the selected unencrypted Ed25519 release key'); }
  if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 release key required');
  if (privateKey.export({ format: 'pem', type: 'pkcs8' }) !== pem) throw Error('canonical single PKCS8 private PEM required');
  const publicKey = createPublicKey(privateKey);
  if (digest(publicKey.export({ type: 'spki', format: 'der' })) !== keyFingerprint) throw Error('embedded release key does not match the expected fingerprint');
  return { privateKey, publicKey };
}

/**
 * A package signed by a key the CLI does not pin can never be activated by that CLI, so a
 * production set is refused unless the supplied fingerprint is the one in source. `allowUnpinnedKey`
 * exists for fixture builds only and is not reachable from any command line.
 */
export function assertEmbeddedKeyIsPinned(keyFingerprint, { allowUnpinnedKey = false } = {}) {
  if (allowUnpinnedKey) return;
  if (EMBEDDED_RELEASE_KEY_FINGERPRINT === EMBEDDED_RELEASE_KEY_NOT_ENROLLED) {
    throw Error('no release key is enrolled in source: set EMBEDDED_RELEASE_KEY_FINGERPRINT in packages/cli/src/release-trust.mjs to this key\'s SPKI sha256 in a reviewed commit, then build again');
  }
  if (keyFingerprint !== EMBEDDED_RELEASE_KEY_FINGERPRINT) throw Error('the supplied key is not the release key pinned in packages/cli/src/release-trust.mjs');
}

/**
 * @param {{ outDirectory: string, version: string, commit: string, tree: string,
 *   artifacts: { plugin: Buffer, inventory: Buffer, sbom: Buffer },
 *   privateKeyPath: string, keyFingerprint: string, forbiddenRoots?: string[], allowUnpinnedKey?: boolean }} options
 */
export function writeEmbeddedReleaseSet({ outDirectory, version, commit, tree, artifacts, privateKeyPath, keyFingerprint, forbiddenRoots = [], allowUnpinnedKey = false }) {
  assertEmbeddedKeyIsPinned(keyFingerprint, { allowUnpinnedKey });
  const { privateKey, publicKey } = loadSigningKey(privateKeyPath, keyFingerprint, forbiddenRoots);
  const names = embeddedArtifactNames(version);
  for (const kind of Object.keys(names)) if (!Buffer.isBuffer(artifacts?.[kind]) || !artifacts[kind].length) throw Error(`embedded artifact missing: ${kind}`);
  if (!path.isAbsolute(outDirectory || '')) throw Error('embedded set directory must be absolute');
  if (fs.existsSync(outDirectory)) throw Error('embedded set directory already exists; refusing overwrite');
  fs.mkdirSync(outDirectory, { mode: 0o755 }); fs.chmodSync(outDirectory, 0o755);
  try {
    const index = validateEmbeddedReleaseIndex({
      schema: 3, package: 'great-cto', version,
      source: { repository: REPOSITORY, commit, tree, tag: `v${version}` },
      publisher: { profile: EMBEDDED_RELEASE_PROFILE, keyFingerprint },
      artifacts: Object.entries(names).map(([kind, filename]) => ({ kind, filename, size: artifacts[kind].length, sha256: digest(artifacts[kind]), sha512: digest(artifacts[kind], 'sha512') })),
    }, { version, expectedCommit: commit, keyFingerprint });
    const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + '\n'), indexDigest = digest(indexBytes);
    const write = (name, bytes) => { fs.writeFileSync(path.join(outDirectory, name), bytes, { flag: 'wx', mode: 0o644 }); fs.chmodSync(path.join(outDirectory, name), 0o644); };
    for (const [filename, bytes] of [...Object.entries(names).map(([kind, filename]) => [filename, artifacts[kind]]), ['release-index.json', indexBytes]]) {
      const message = embeddedReleaseSignatureMessage(filename, indexDigest, bytes), signature = sign(null, message, privateKey);
      if (!verify(null, message, publicKey, signature)) throw Error('embedded signature verification failed');
      write(filename, bytes);
      write(filename + '.signature.json', Buffer.from(JSON.stringify({ schema: 1, profile: EMBEDDED_RELEASE_PROFILE, keyFingerprint, filename, indexDigest, signature: signature.toString('base64') }) + '\n'));
    }
    write(EMBEDDED_RELEASE_KEY_FILENAME, Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })));
    if (JSON.stringify(fs.readdirSync(outDirectory).sort()) !== JSON.stringify(embeddedSetMembers(version))) throw Error('embedded set membership is not exact');
    // The consumer's own check, against the fingerprint this build was told to use. The ticket is
    // non-production by construction; whether the CLI pins this key was decided above.
    const ticket = admitEmbeddedRelease({ dir: fs.realpathSync(outDirectory), version, expectedCommit: commit }, { testOnlyKeyFingerprint: keyFingerprint });
    if (getAdmissionInfo(ticket).indexDigest !== indexDigest) throw Error('embedded set admitted a different index than was written');
    return { state: 'EMBEDDED_SET_WRITTEN', version, indexDigest, keyFingerprint, members: embeddedSetMembers(version) };
  } catch (error) {
    fs.rmSync(outDirectory, { recursive: true, force: true });
    throw error;
  }
}
