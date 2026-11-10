#!/usr/bin/env node
/** Local owner signatures authenticate bytes, not hosted build provenance. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { parseStrictReleaseIndex, validateReleaseIndex } from '../packages/cli/src/release-trust.mjs';
import { isMainModule } from './lib/is-main.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/, COMMIT = /^[a-f0-9]{40}$/;
const MAX_FILE = 128 * 1024 * 1024;
const message = (filename, indexDigest, bytes) => Buffer.concat([Buffer.from('great-cto-release-v1\n'+JSON.stringify({ filename, indexDigest })+'\n'), bytes]);
function privateDirectory(directory) {
  if (!path.isAbsolute(directory || '') || fs.realpathSync(directory) !== path.resolve(directory)) throw Error('canonical private signing directory required');
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || (process.getuid && stat.uid !== process.getuid())) throw Error('owner-only signing directory required');
}
function regular(file, cap = MAX_FILE) {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== file) throw Error('canonical regular signing input required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size <= 0n || before.size > BigInt(cap) || (Number(before.mode) & 0o777) !== 0o600 || (process.getuid && before.uid !== BigInt(process.getuid()))) throw Error('bounded owner-only regular signing input required');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true });
    if (['dev','ino','size','mtimeNs','ctimeNs'].some(k => before[k] !== after[k]) || bytes.length !== Number(after.size)) throw Error('signing input changed');
    return { bytes, identity: ['dev','ino','size','mtimeNs','ctimeNs'].map(k => after[k].toString()).join(':') };
  } finally { fs.closeSync(fd); }
}
function unchanged(file, before, cap) {
  const after = regular(file, cap);
  if (after.identity !== before.identity || !after.bytes.equals(before.bytes)) throw Error('frozen signing input changed');
}
function exclusiveWrite(file, bytes) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function syncDirectory(directory) { const fd = fs.openSync(directory, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

/** Explicitly freeze a builder set into the selected local profile and sign once.
 * No key is generated, exported or enrolled by this operation. Partial failures
 * retain their evidence and cannot be retried by overwriting an existing proof.
 */
export function signLocalReleaseArtifacts({ directory, version, expectedCommit, privateKeyPath, keyFingerprint }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '') || !COMMIT.test(expectedCommit || '') || !HASH.test(keyFingerprint || '')) throw Error('explicit stable version, source commit and independently selected key fingerprint required');
  privateDirectory(directory);
  if (!path.isAbsolute(privateKeyPath || '') || privateKeyPath === directory || privateKeyPath.startsWith(directory+path.sep)) throw Error('private release key must be outside candidate directory');
  const keyInput = regular(privateKeyPath, 16 * 1024);
  let privateKey;
  try { privateKey = createPrivateKey({ key: keyInput.bytes, format: 'pem', type: 'pkcs8' }); } catch { throw Error('cannot load selected unencrypted Ed25519 release key'); }
  if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 release key required');
  if (privateKey.export({ format: 'pem', type: 'pkcs8' }) !== keyInput.bytes.toString('utf8')) throw Error('canonical single PKCS8 private PEM required');
  const publicKey = createPublicKey(privateKey);
  if (hash(publicKey.export({ format: 'der', type: 'spki' })) !== keyFingerprint) throw Error('selected release key fingerprint mismatch');
  const indexFile = path.join(directory, 'release-index.json'), oldIndex = regular(indexFile, 256 * 1024);
  const parsed = parseStrictReleaseIndex(oldIndex.bytes.toString('utf8'));
  // The prepared builder profile is validated before conversion; local or
  // partially signed input is never silently re-labelled or re-signed.
  if (parsed.schema !== 1) throw Error('fresh unsealed builder profile required');
  const index = validateReleaseIndex(parsed, { version, expectedCommit });
  const filenames = [...index.artifacts.map(x => x.filename), 'release-index.json'];
  if (JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify([...filenames].sort())) throw Error('unexpected signing member or existing proof; refusing overwrite');
  const snapshots = new Map();
  for (const artifact of index.artifacts) {
    const snapshot = regular(path.join(directory, artifact.filename), artifact.size);
    if (snapshot.bytes.length !== artifact.size || hash(snapshot.bytes) !== artifact.sha256 || createHash('sha512').update(snapshot.bytes).digest('hex') !== artifact.sha512) throw Error('indexed artifact size or digest mismatch');
    snapshots.set(artifact.filename, snapshot);
  }
  const lock = path.join(directory, '.local-signing-lock');
  exclusiveWrite(lock, Buffer.from('local-release-signing\n'));
  try {
    privateDirectory(directory); unchanged(privateKeyPath, keyInput, 16 * 1024); unchanged(indexFile, oldIndex, 256 * 1024);
    for (const [filename, snapshot] of snapshots) unchanged(path.join(directory, filename), snapshot, MAX_FILE);
    const localIndex = { ...index, schema: 2, publisher: { profile: 'local-ed25519', keyFingerprint } };
    const indexBytes = Buffer.from(JSON.stringify(localIndex, null, 2)+'\n');
    const fd = fs.openSync(indexFile, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd, { bigint: true });
      if (['dev','ino','size','mtimeNs','ctimeNs'].map(k => stat[k].toString()).join(':') !== oldIndex.identity) throw Error('release index changed before freeze');
      fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, indexBytes); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    snapshots.set('release-index.json', regular(indexFile, 256 * 1024));
    const indexDigest = hash(indexBytes);
    const proofs = new Map();
    for (const filename of filenames) {
      privateDirectory(directory);
      const snapshot = snapshots.get(filename);
      unchanged(path.join(directory, filename), snapshot, MAX_FILE);
      const signature = sign(null, message(filename, indexDigest, snapshot.bytes), privateKey);
      if (!verify(null, message(filename, indexDigest, snapshot.bytes), publicKey, signature)) throw Error('local signature verification failed');
      const proof = { schema: 1, profile: 'local-ed25519', keyFingerprint, filename, indexDigest, signature: signature.toString('base64') };
      const proofFile = path.join(directory, filename+'.signature.json'), proofBytes = Buffer.from(JSON.stringify(proof)+'\n');
      exclusiveWrite(proofFile, proofBytes);
      const recordedProof = regular(proofFile, 2*1024*1024);
      if (!recordedProof.bytes.equals(proofBytes)) throw Error('signature proof changed during recording');
      proofs.set(proofFile, recordedProof);
    }
    for (const [filename, snapshot] of snapshots) unchanged(path.join(directory, filename), snapshot, MAX_FILE);
    for (const [proofFile, snapshot] of proofs) unchanged(proofFile, snapshot, 2*1024*1024);
    unchanged(privateKeyPath, keyInput, 16 * 1024);
    syncDirectory(directory);
    return { state: 'SIGNED_AND_VERIFIED', profile: 'local-ed25519', version: index.version, commit: index.source.commit, tree: index.source.tree, indexDigest, keyFingerprint, bundles: filenames.map(x => x+'.signature.json'), authority: 'ARTIFACT_SIGNATURES_ONLY', provenance: 'LOCAL_OWNER_SIGNATURE', releaseEligibility: 'NOT_CHECKED', published: false, installed: false };
  } finally { fs.unlinkSync(lock); syncDirectory(directory); }
}

if (isMainModule(import.meta.url)) {
  try {
    const allowed = new Set(['--directory','--version','--commit','--private-key','--key-fingerprint']), flags = new Map();
    for (let i=2;i<process.argv.length;i+=2) {
      const flag = process.argv[i], value = process.argv[i+1];
      if (!allowed.has(flag) || flags.has(flag) || !value || value.startsWith('--')) throw Error('invalid local signing option');
      flags.set(flag,value);
    }
    const result = signLocalReleaseArtifacts({ directory: flags.get('--directory'), version: flags.get('--version'), expectedCommit: flags.get('--commit'), privateKeyPath: flags.get('--private-key'), keyFingerprint: flags.get('--key-fingerprint') });
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch { console.error('local release signing refused; inspect selected input identity, permissions and independently selected fingerprint'); process.exitCode=1; }
}
