import { parseStrictObject } from './release-json.mjs';
import { inspectRuntimeImportReferences } from './release-runtime-references.mjs';
import { validateNativeCompanionFiles } from './native-companion-policy.mjs';
export { inspectRuntimeImportReferences };
/** Publisher admission is an in-memory capability, never a serialized approval. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inspectReleaseArchive } from './release-archive.mjs';

export const RELEASE_TRUST_POLICY = Object.freeze({ repository: 'avelikiy/great_cto', workflow: '.github/workflows/publish.yml', issuer: 'https://token.actions.githubusercontent.com', cosignVersion: 'v3.1.4' });
// Rotation is a reviewed source change, not a value accepted from release metadata.
export const RELEASE_TRUST_ROOT_SHA256 = '6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66';
export const COSIGN_PLATFORM_SHA256 = Object.freeze({
  'darwin-x64': '9d1e4abe2b6be279ed0d2ff706fde1ccd738747c834e3e6d44039c238867334f',
  'darwin-arm64': '9f9b8cd557cf2e5b3df3373a00baa005a86b02391e3e06dd0ce37b3a1533d3a4',
  'linux-x64': '424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa',
  'linux-arm64': 'ade83b7aac62e131cacfe96d958948b2150cc9efec46a570a2649b8e27dedad2',
});
export const RELEASE_TRUST_LIMITS = Object.freeze({ index: 256 * 1024, bundle: 2 * 1024 * 1024, archive: 128 * 1024 * 1024, inventory: 8 * 1024 * 1024, sbom: 8 * 1024 * 1024 });
const admissions = new WeakMap();
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const stable = value => typeof value === 'string' && /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/.test(value);
const hex = (value, n) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(value);
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw Error(`${label} schema fields refused`);
}
function compare(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }

/** Preserve the release-index parser API and its policy-bound default limit. */
export function parseStrictReleaseIndex(text, { maxBytes = RELEASE_TRUST_LIMITS.index } = {}) {
  return parseStrictObject(text, { maxBytes });
}

export function validateReleaseIndex(input, { version, expectedCommit, currentVersion, currentIndexDigest, profile = 'github-oidc', localKeyFingerprint } = {}) {
  exact(input, ['schema', 'package', 'version', 'source', 'publisher', 'artifacts'], 'release index');
  if (!['github-oidc', 'local-ed25519'].includes(profile)) throw Error('release trust profile refused');
  if (input.schema !== (profile === 'local-ed25519' ? 2 : 1) || input.package !== 'great-cto' || !stable(input.version) || (version !== undefined && version !== input.version)) throw Error('release index version or package refused');
  if (currentVersion !== undefined) {
    if (!stable(currentVersion) || compare(input.version, currentVersion) < 0) throw Error('release version downgrade refused');
    if (input.version === currentVersion && !hex(currentIndexDigest, 64)) throw Error('same version requires retained index digest');
  }
  exact(input.source, ['repository', 'commit', 'tree', 'tag'], 'source');
  if (input.source.repository !== RELEASE_TRUST_POLICY.repository || !hex(input.source.commit, 40) || !hex(input.source.tree, 40) || input.source.tag !== `v${input.version}`) throw Error('release source identity or tag refused');
  if (expectedCommit !== undefined && input.source.commit !== expectedCommit) throw Error('release source commit mismatch');
  if (profile === 'local-ed25519') {
    exact(input.publisher, ['profile', 'keyFingerprint'], 'publisher');
    if (input.publisher.profile !== profile || !hex(input.publisher.keyFingerprint, 64) || (localKeyFingerprint !== undefined && input.publisher.keyFingerprint !== localKeyFingerprint)) throw Error('local publisher key fingerprint or profile refused');
  } else {
    exact(input.publisher, ['workflow'], 'publisher');
    if (input.publisher.workflow !== RELEASE_TRUST_POLICY.workflow) throw Error('publisher workflow refused');
  }
  if (!Array.isArray(input.artifacts) || input.artifacts.length !== 4) throw Error('release artifact kinds incomplete');
  const names = { npm: `great-cto-${input.version}.tgz`, plugin: `great-cto-plugin-${input.version}.tgz`, inventory: 'plugin-inventory.json', sbom: 'sbom.cdx.json' }, seen = new Set();
  for (const a of input.artifacts) {
    exact(a, ['kind', 'filename', 'size', 'sha256', 'sha512'], 'artifact');
    if (!Object.hasOwn(names, a.kind) || seen.has(a.kind) || a.filename !== names[a.kind]) throw Error('artifact kind or filename refused');
    seen.add(a.kind);
    const cap = ['npm', 'plugin'].includes(a.kind) ? RELEASE_TRUST_LIMITS.archive : RELEASE_TRUST_LIMITS[a.kind];
    if (!Number.isSafeInteger(a.size) || a.size <= 0 || a.size > cap || !hex(a.sha256, 64) || !hex(a.sha512, 128)) throw Error('artifact size or digest refused');
  }
  return structuredClone(input);
}

function canonicalPrivateDirectory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || fs.realpathSync(value) !== path.resolve(value)) throw Error('stage must be an absolute canonical private directory');
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || (process.getuid && stat.uid !== process.getuid())) throw Error('stage directory requires private owner-only 0700 permissions');
  return { path: value, dev: stat.dev, ino: stat.ino };
}
function sameDirectory(expected) {
  const actual = canonicalPrivateDirectory(expected.path);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw Error('stage directory identity changed');
}
function readRegular(file, cap, { privateFile = true, executable = false } = {}) {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== path.resolve(file)) throw Error('file must be canonical, not a symlink');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    const uid = process.getuid ? BigInt(process.getuid()) : stat.uid;
    const wrongOwner = privateFile ? stat.uid !== uid : stat.uid !== uid && stat.uid !== 0n;
    if (!stat.isFile() || stat.nlink !== 1n || stat.size <= 0n || stat.size > BigInt(cap) || wrongOwner) throw Error('unsafe regular file ownership, size or link count');
    if (privateFile ? (Number(stat.mode) & 0o777) !== 0o600 : (Number(stat.mode) & 0o022) !== 0) throw Error('unsafe file permissions');
    if (executable && !(Number(stat.mode) & 0o100)) throw Error('verifier is not executable');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true });
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(k => stat[k] !== after[k]) || bytes.length !== Number(stat.size)) throw Error('file changed while reading');
    const identity = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(k => stat[k].toString()).join(':');
    return { bytes, identity };
  } finally { fs.closeSync(fd); }
}
function verifyPin(file, digest, cap, executable = false) {
  if (!hex(digest, 64)) throw Error('trusted tool/root digest pin required');
  const snapshot = readRegular(file, cap, { privateFile: false, executable });
  if (sha(snapshot.bytes) !== digest) throw Error(executable ? 'cosign verifier digest mismatch' : 'trusted root digest mismatch');
  return snapshot;
}
function ticketState(ticket) {
  const state = admissions.get(ticket);
  if (!state) throw Error('unknown or forged release admission ticket');
  sameDirectory(state.directory);
  state.checkTrust?.();
  const current = readRegular(path.join(state.directory.path, 'release-index.json'), RELEASE_TRUST_LIMITS.index);
  if (current.identity !== state.indexSnapshot.identity || sha(current.bytes) !== state.info.indexDigest) throw Error('admitted release index changed');
  return state;
}

export function admitRelease(opts, { run = execFileSync } = {}) {
  if (opts.profile === 'local-ed25519') return admitLocalRelease(opts, { isProduction: run === execFileSync });
  if (opts.profile !== undefined && opts.profile !== 'github-oidc') throw Error('release trust profile refused');
  const isProduction = run === execFileSync;
  if (isProduction) {
    const expectedTool = COSIGN_PLATFORM_SHA256[`${process.platform}-${process.arch}`];
    if (!expectedTool) throw Error('unsupported verifier platform');
    if (opts.cosignSha256 !== expectedTool || opts.trustedRootSha256 !== RELEASE_TRUST_ROOT_SHA256) throw Error('pinned production verifier and trust root required');
  }
  const directory = canonicalPrivateDirectory(opts.directory);
  const tool = path.resolve(opts.cosignPath || ''), root = path.resolve(opts.trustedRootPath || '');
  for (const name of [tool, root]) if (name === directory.path || name.startsWith(directory.path + path.sep)) throw Error('candidate cannot supply verifier or trusted root');
  if (tool !== opts.cosignPath || root !== opts.trustedRootPath) throw Error('verifier and trust root require absolute canonical paths');
  const checkTools = () => { verifyPin(tool, opts.cosignSha256, 256 * 1024 * 1024, true); verifyPin(root, opts.trustedRootSha256, RELEASE_TRUST_LIMITS.bundle); };
  checkTools();
  const indexFile = path.join(directory.path, 'release-index.json');
  const indexSnapshot = readRegular(indexFile, RELEASE_TRUST_LIMITS.index);
  const index = validateReleaseIndex(parseStrictReleaseIndex(indexSnapshot.bytes.toString('utf8')), opts);
  if (opts.currentVersion === index.version && opts.currentIndexDigest !== sha(indexSnapshot.bytes)) throw Error('same-version release index digest changed');
  const verifierHome = fs.mkdtempSync(path.join(directory.path, '.verifier-')); fs.chmodSync(verifierHome, 0o700);
  const snapshots = new Map();
  const options = { cwd: verifierHome, encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', HOME: verifierHome, TMPDIR: verifierHome, LANG: 'C', LC_ALL: 'C' } };
  const verify = (file, snapshot, cap) => {
    checkTools(); sameDirectory(directory);
    const bundle = file + '.sigstore.json', proof = readRegular(bundle, RELEASE_TRUST_LIMITS.bundle);
    const before = readRegular(file, cap);
    if (before.identity !== snapshot.identity || sha(before.bytes) !== sha(snapshot.bytes)) throw Error('staged file changed before verification');
    run(tool, ['verify-blob', '--bundle', bundle, '--trusted-root', root, '--certificate-identity', `https://github.com/${RELEASE_TRUST_POLICY.repository}/${RELEASE_TRUST_POLICY.workflow}@refs/tags/v${index.version}`, '--certificate-oidc-issuer', RELEASE_TRUST_POLICY.issuer, '--certificate-github-workflow-repository', RELEASE_TRUST_POLICY.repository, '--certificate-github-workflow-ref', `refs/tags/v${index.version}`, '--certificate-github-workflow-sha', index.source.commit, '--certificate-github-workflow-trigger', 'push', '--timeout', '30s', file], options);
    const after = readRegular(file, cap), afterProof = readRegular(bundle, RELEASE_TRUST_LIMITS.bundle);
    if (after.identity !== snapshot.identity || sha(after.bytes) !== sha(snapshot.bytes) || afterProof.identity !== proof.identity || sha(afterProof.bytes) !== sha(proof.bytes)) throw Error('staged file or signature bundle changed during verification');
    return after;
  };
  try {
    const reported = JSON.parse(String(run(tool, ['version', '--json'], options)));
    if (reported.gitVersion !== RELEASE_TRUST_POLICY.cosignVersion) throw Error('unsupported cosign verifier version');
    verify(indexFile, indexSnapshot, RELEASE_TRUST_LIMITS.index);
    for (const artifact of index.artifacts) {
      const file = path.join(directory.path, artifact.filename), snapshot = readRegular(file, artifact.size);
      if (snapshot.bytes.length !== artifact.size || sha(snapshot.bytes) !== artifact.sha256 || sha(snapshot.bytes, 'sha512') !== artifact.sha512) throw Error('artifact size or digest mismatch');
      verify(file, snapshot, artifact.size); snapshots.set(artifact.kind, { ...artifact, path: file, identity: snapshot.identity });
    }
    checkTools(); sameDirectory(directory);
  } finally { fs.rmSync(verifierHome, { recursive: true, force: true }); }
  const info = Object.freeze({ version: index.version, commit: index.source.commit, tree: index.source.tree, source: Object.freeze({ ...index.source }), indexDigest: sha(indexSnapshot.bytes), isProduction, authority: isProduction ? 'ARTIFACT_ADMISSION' : 'NONE', evidence: isProduction ? 'COSIGN_VERIFIED' : 'SYNTHETIC_ONLY', releaseEligibility: 'NOT_CHECKED' });
  const ticket = Object.freeze({ type: 'release-admission' });
  admissions.set(ticket, { directory, info, index, snapshots, indexSnapshot });
  try {
    inspectNpmPayload(ticket);
    inspectPluginPayload(ticket);
  } catch (error) {
    admissions.delete(ticket);
    throw error;
  }
  return ticket;
}


/** A separately enrolled public key is operator authority, never candidate input. */
export function readTrustedLocalPublicKey(file, fingerprint) {
  if (!hex(fingerprint, 64)) throw Error('pinned local release key fingerprint required');
  const snapshot = readRegular(file, 8192, { privateFile: false });
  const text = snapshot.bytes.toString('utf8');
  if (!text.startsWith('-----BEGIN PUBLIC KEY-----\n')) throw Error('Ed25519 SPKI public key PEM required');
  let key;
  try { key = createPublicKey({ key: snapshot.bytes, format: 'pem', type: 'spki' }); }
  catch { throw Error('invalid local release public key'); }
  if (key.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 release key required');
  if (text !== key.export({ type: 'spki', format: 'pem' })) throw Error('canonical SPKI public key PEM required');
  if (sha(key.export({ type: 'spki', format: 'der' })) !== fingerprint) throw Error('local release public key fingerprint mismatch');
  return { key, fingerprint, identity: snapshot.identity };
}

/** Filename and exact index digest separate signatures from other protocols. */
export function localReleaseSignatureMessage(filename, indexDigest, bytes) {
  if (typeof filename !== 'string' || !filename || path.basename(filename) !== filename || /[\\\0\r\n]/.test(filename) || !hex(indexDigest, 64) || !Buffer.isBuffer(bytes)) throw Error('invalid local signature message');
  return Buffer.concat([Buffer.from('great-cto-release-v1\n' + JSON.stringify({ filename, indexDigest }) + '\n'), bytes]);
}

function admitLocalRelease(opts, { isProduction }) {
  const directory = canonicalPrivateDirectory(opts.directory);
  const keyPath = opts.localPublicKeyPath;
  if (typeof keyPath !== 'string' || keyPath === directory.path || keyPath.startsWith(directory.path + path.sep)) throw Error('candidate cannot supply trusted release key');
  const enrolled = readTrustedLocalPublicKey(keyPath, opts.localKeyFingerprint);
  const checkTrust = () => {
    const current = readTrustedLocalPublicKey(keyPath, opts.localKeyFingerprint);
    if (current.identity !== enrolled.identity) throw Error('trusted local release key identity changed');
  };
  const indexFile = path.join(directory.path, 'release-index.json');
  const indexSnapshot = readRegular(indexFile, RELEASE_TRUST_LIMITS.index);
  const indexDigest = sha(indexSnapshot.bytes);
  const index = validateReleaseIndex(parseStrictReleaseIndex(indexSnapshot.bytes.toString('utf8')), opts);
  if (opts.currentVersion === index.version && opts.currentIndexDigest !== indexDigest) throw Error('same-version release index digest changed');
  const names = ['release-index.json', ...index.artifacts.map(a => a.filename)];
  const expected = [...names, ...names.map(name => name + '.signature.json')].sort();
  if (JSON.stringify(fs.readdirSync(directory.path).sort()) !== JSON.stringify(expected)) throw Error('unexpected local signature directory membership or profile sidecars');
  const snapshots = new Map();
  const verify = (filename, cap) => {
    sameDirectory(directory); checkTrust();
    const file = path.join(directory.path, filename), snapshot = readRegular(file, cap);
    const proofFile = file + '.signature.json', proof = readRegular(proofFile, 8192);
    const envelope = parseStrictReleaseIndex(proof.bytes.toString('utf8'), { maxBytes: 8192 });
    exact(envelope, ['schema', 'profile', 'keyFingerprint', 'filename', 'indexDigest', 'signature'], 'local signature envelope');
    if (envelope.schema !== 1 || envelope.profile !== 'local-ed25519' || envelope.keyFingerprint !== opts.localKeyFingerprint || envelope.filename !== filename || envelope.indexDigest !== indexDigest) throw Error('local signature envelope binding refused');
    if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) throw Error('canonical Ed25519 signature required');
    const signature = Buffer.from(envelope.signature, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== envelope.signature || !verifySignature(null, localReleaseSignatureMessage(filename, indexDigest, snapshot.bytes), enrolled.key, signature)) throw Error('local release signature verification failed');
    const after = readRegular(file, cap), afterProof = readRegular(proofFile, 8192);
    if (after.identity !== snapshot.identity || sha(after.bytes) !== sha(snapshot.bytes) || afterProof.identity !== proof.identity || sha(afterProof.bytes) !== sha(proof.bytes)) throw Error('local artifact or signature changed during verification');
    sameDirectory(directory); checkTrust();
    return snapshot;
  };
  const verifiedIndex = verify('release-index.json', RELEASE_TRUST_LIMITS.index);
  if (verifiedIndex.identity !== indexSnapshot.identity || sha(verifiedIndex.bytes) !== indexDigest) throw Error('release index changed during verification');
  for (const artifact of index.artifacts) {
    const snapshot = verify(artifact.filename, artifact.size);
    if (snapshot.bytes.length !== artifact.size || sha(snapshot.bytes) !== artifact.sha256 || sha(snapshot.bytes, 'sha512') !== artifact.sha512) throw Error('artifact size or digest mismatch');
    snapshots.set(artifact.kind, { ...artifact, path: path.join(directory.path, artifact.filename), identity: snapshot.identity });
  }
  const info = Object.freeze({ version: index.version, commit: index.source.commit, tree: index.source.tree, source: Object.freeze({ ...index.source }), indexDigest, isProduction, authority: isProduction ? 'ARTIFACT_ADMISSION' : 'NONE', evidence: isProduction ? 'LOCAL_ED25519_VERIFIED' : 'SYNTHETIC_ONLY', releaseEligibility: 'NOT_CHECKED' });
  const ticket = Object.freeze({ type: 'release-admission' });
  admissions.set(ticket, { directory, info, index, snapshots, indexSnapshot, checkTrust });
  try { inspectNpmPayload(ticket); inspectPluginPayload(ticket); }
  catch (error) { admissions.delete(ticket); throw error; }
  return ticket;
}

export function getAdmissionInfo(ticket) { return ticketState(ticket).info; }
export function getAdmittedArtifact(ticket, kind) {
  const state = ticketState(ticket), artifact = state.snapshots.get(kind);
  if (!artifact) throw Error('unknown admitted artifact kind');
  const snapshot = readRegular(artifact.path, artifact.size);
  if (snapshot.identity !== artifact.identity || snapshot.bytes.length !== artifact.size || sha(snapshot.bytes) !== artifact.sha256 || sha(snapshot.bytes, 'sha512') !== artifact.sha512) throw Error('admitted artifact identity or digest changed');
  return Object.freeze({ path: artifact.path, sha256: artifact.sha256, size: artifact.size });
}
function artifactBytes(ticket, kind) { const a = getAdmittedArtifact(ticket, kind); const bytes = readRegular(a.path, a.size).bytes; if (sha(bytes) !== a.sha256) throw Error('artifact digest changed'); return bytes; }
function required(files, names) { const paths = new Set(files.map(f => f.path)); for (const name of names) if (!paths.has(name)) throw Error(`runtime archive missing ${name}`); }

export function inspectNpmPayload(ticket) {
  const { version } = getAdmissionInfo(ticket), files = inspectReleaseArchive(artifactBytes(ticket, 'npm'));
  required(files, ['package.json', 'index.mjs', 'dist/main.js', 'board/packages/board/server.mjs']);
  const pkg = parseStrictReleaseIndex(files.find(f => f.path === 'package.json').bytes.toString('utf8'));
  if (pkg.name !== 'great-cto' || pkg.version !== version) throw Error('npm payload package identity mismatch');
  exact(pkg.bin, ['great-cto'], 'npm bin');
  if (pkg.bin['great-cto'] !== 'index.mjs') throw Error('npm bin target is unsupported');
  for (const k of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
    if (Object.hasOwn(pkg, k) && (!pkg[k] || typeof pkg[k] !== 'object' || Object.keys(pkg[k]).length !== 0)) throw Error('npm runtime dependency closure is unsupported');
  }
  if (files.some(f => /^(?:npm-shrinkwrap\.json|package-lock\.json)$/.test(f.path))) throw Error('npm dependency lockfile closure is unsupported');
  for (const key of ['man', 'workspaces']) if (Object.hasOwn(pkg, key) && (!Array.isArray(pkg[key]) || pkg[key].length)) throw Error('additional npm install targets are unsupported');
  inspectRuntimeImportReferences(files);
  return { version, files };
}

/** Validate declarative local assets as well as literal JavaScript imports. */
export function inspectPluginManifestReferences(files) {
  const actual = new Map(files.map(f => [f.path, f]));
  const reference = (value, directoryAllowed = false) => {
    if (typeof value !== 'string' || !value.startsWith('./') || /[\\?#\0]/.test(value) || (!directoryAllowed && value.endsWith('/'))) throw Error('plugin manifest path refused');
    const member = value.slice(2).replace(/\/$/, '');
    if (!member || path.posix.normalize(member) !== member || member === '..' || member.startsWith('../')) throw Error('plugin manifest path refused');
    const fileMatch = !value.endsWith('/') && actual.has(member);
    const directoryMatch = directoryAllowed && files.some(f => f.path.startsWith(member + '/'));
    if (!fileMatch && !directoryMatch) throw Error('plugin manifest reference missing from runtime archive');
  };
  for (const name of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    if (!actual.has(name)) throw Error('plugin manifest reference missing from runtime archive');
    const manifest = parseStrictReleaseIndex(actual.get(name).bytes.toString('utf8'));
    for (const key of ['agents', 'commands', 'skills', 'outputStyles']) {
      if (!Object.hasOwn(manifest, key)) continue;
      const values = Array.isArray(manifest[key]) ? manifest[key] : [manifest[key]];
      for (const value of values) reference(value, true);
    }
    if (Object.hasOwn(manifest, 'types')) reference(manifest.types);
    for (const key of ['hooks', 'mcpServers']) {
      if (!Object.hasOwn(manifest, key)) continue;
      if (typeof manifest[key] === 'string') reference(manifest[key]);
      else if (!manifest[key] || typeof manifest[key] !== 'object' || Array.isArray(manifest[key])) throw Error('plugin manifest reference shape refused');
    }
    if (manifest.interface && Object.hasOwn(manifest.interface, 'composerIcon')) reference(manifest.interface.composerIcon);
  }
  return true;
}

export function inspectPluginPayload(ticket) {
  const { version } = getAdmissionInfo(ticket), files = inspectReleaseArchive(artifactBytes(ticket, 'plugin'), { prefix: 'plugin' });
  required(files, ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'packages/cli/dist/main.js', 'packages/cli/index.mjs', 'packages/board/server.mjs']);
  const inventory = parseStrictReleaseIndex(artifactBytes(ticket, 'inventory').toString('utf8'), { maxBytes: RELEASE_TRUST_LIMITS.inventory });
  exact(inventory, ['schema', 'version', 'files'], 'plugin inventory');
  if (inventory.schema !== 1 || inventory.version !== version || !Array.isArray(inventory.files) || inventory.files.length !== files.length) throw Error('plugin inventory membership mismatch');
  const actual = new Map(files.map(f => [f.path, f])); let previous = '';
  for (const entry of inventory.files) {
    exact(entry, ['path', 'size', 'sha256', 'mode'], 'plugin inventory entry');
    if (typeof entry.path !== 'string' || entry.path <= previous) throw Error('plugin inventory must be sorted and unique'); previous = entry.path;
    const file = actual.get(entry.path);
    if (!file || entry.size !== file.bytes.length || entry.sha256 !== sha(file.bytes) || entry.mode !== file.mode) throw Error('plugin inventory bytes, size or mode mismatch');
  }
  for (const [name, expected] of [['.claude-plugin/plugin.json', 'great-cto'], ['.codex-plugin/plugin.json', 'great-cto']]) {
    const manifest = parseStrictReleaseIndex(actual.get(name).bytes.toString('utf8'));
    if (manifest.name !== expected || manifest.version !== version) throw Error('plugin manifest identity mismatch');
  }
  inspectPluginManifestReferences(files);
  inspectRuntimeImportReferences(files);
  if (actual.has('native-companions.json')) validateNativeCompanionFiles(files);
  else if (files.some(file => file.path.startsWith('vendor/native/'))) throw Error('native-companion-descriptor-required');
  return { version, files };
}
