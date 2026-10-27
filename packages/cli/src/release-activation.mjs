/** Verified installation transactions. Publisher admission is not a release approval. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getAdmissionInfo, getAdmittedArtifact, inspectNpmPayload, inspectPluginPayload } from './release-trust.mjs';
import { inspectClaudeNativeAdmission } from './native-plugin-admission.mjs';

const MAX_FILES = 10000, MAX_BYTES = 512 * 1024 * 1024;
const STABLE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const owned = stat => typeof process.getuid !== 'function' || stat.uid === (typeof stat.uid === 'bigint' ? BigInt(process.getuid()) : process.getuid());
const within = (root, file) => file !== root && file.startsWith(root + path.sep);
const fail = reason => { throw Object.assign(new Error(reason), { activationReason: reason }); };
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]); return 0; };
const access = { getAdmissionInfo, getAdmittedArtifact, inspectNpmPayload, inspectPluginPayload };

function canonicalDirectory(dir, { create = false, privateMode = false } = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) fail('absolute-directory-required');
  const resolved = path.resolve(dir);
  for (let current = resolved; current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail('directory-symlink-refused');
  }
  if (create) fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || !owned(stat) || (privateMode ? (stat.mode & 0o777) !== 0o700 : !!(stat.mode & 0o022))) fail('unsafe-directory');
  if (fs.realpathSync(resolved) !== resolved) fail('noncanonical-directory');
  return resolved;
}

function readRegular(file, { max = MAX_BYTES, privateMode = false, allowRootOwner = false } = {}) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(max) || !(owned(before) || (allowRootOwner && before.uid === 0n)) || (before.mode & 0o022n) || (privateMode && (before.mode & 0o777n) !== 0o600n)) fail('unsafe-file');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true });
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) fail('file-changed-during-read');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function syncDirectory(dir) { const fd = fs.openSync(dir, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

function syncAncestors(dir, root) {
  for (let current = dir; ; current = path.dirname(current)) {
    syncDirectory(current); if (current === root) return;
    if (!within(root, current)) fail('transaction-path-outside-state-root');
  }
}

function writeRecord(file, record) {
  const temp = file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(record) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file); syncDirectory(path.dirname(file)); } finally { fs.rmSync(temp, { force: true }); }
}

function readRecord(file) { return JSON.parse(readRegular(file, { max: 1024 * 1024, privateMode: true }).toString('utf8')); }

function packageSnapshot(root) {
  canonicalDirectory(root);
  const files = [], directories = [], names = new Set(); let total = 0, entries = 0;
  function walk(dir) {
    const dirStat = fs.lstatSync(dir);
    if (!owned(dirStat) || dirStat.mode & 0o6022) fail('unsafe-package-directory');
    directories.push({ path: path.relative(root, dir), mode: dirStat.mode & 0o777 });
    for (const entry of fs.readdirSync(dir).sort()) {
      if (++entries > MAX_FILES * 2 || path.relative(root, dir).split(path.sep).length > 64) fail('package-backup-limit');
      if (entry.includes('\\') || /[\0-\x1f]/.test(entry)) fail('invalid-package-path');
      const file = path.join(dir, entry), stat = fs.lstatSync(file);
      if (!owned(stat) || stat.isSymbolicLink() || stat.mode & 0o6022) fail('unsafe-package-entry');
      if (stat.isDirectory()) { walk(file); continue; }
      if (!stat.isFile() || stat.nlink !== 1) fail('unsafe-package-entry');
      const rel = path.relative(root, file), name = rel.normalize('NFC').toLowerCase();
      if (names.has(name)) fail('colliding-package-path'); names.add(name);
      const bytes = readRegular(file);
      total += bytes.length; if (files.length >= MAX_FILES || total > MAX_BYTES) fail('package-backup-limit');
      files.push({ path: rel, size: bytes.length, sha256: hash(bytes), mode: stat.mode & 0o777, bytes });
    }
  }
  walk(root);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const inventory = files.map(({ bytes, ...file }) => file);
  directories.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files, directories, digest: hash(JSON.stringify({ files: inventory, directories })), filesDigest: hash(JSON.stringify(inventory)) };
}

function binSelection(bin, packageRoot) {
  const stat = fs.lstatSync(bin);
  if (!stat.isSymbolicLink() || !owned(stat)) fail('unsupported-bin-selection');
  const link = fs.readlinkSync(bin);
  if (path.resolve(path.dirname(bin), link) !== path.join(packageRoot, 'index.mjs')) fail('foreign-bin-selection');
  return { kind: 'symlink', link };
}

/** Resolve only the normal POSIX npm layout, never npm's configured fallback prefix. */
export function resolveNpmInstallation(binaryPath) {
  if (typeof binaryPath !== 'string' || !path.isAbsolute(binaryPath)) fail('unsupported-installation');
  if (/(?:^|\/)(?:\.pnpm|pnpm|\.volta|volta|_npx)(?:\/|$)/.test(binaryPath)) fail('unsupported-package-manager');
  const realBinary = fs.realpathSync(binaryPath), suffix = '/lib/node_modules/great-cto/index.mjs';
  if (!realBinary.endsWith(suffix)) fail('unsupported-installation');
  const prefix = realBinary.slice(0, -suffix.length);
  if (!prefix || prefix === '/') fail('unsupported-installation');
  canonicalDirectory(prefix);
  const packageRoot = path.join(prefix, 'lib/node_modules/great-cto'), binPath = path.join(prefix, 'bin/great-cto');
  canonicalDirectory(packageRoot); canonicalDirectory(path.dirname(binPath));
  const selection = binSelection(binPath, packageRoot);
  if (fs.realpathSync(binPath) !== realBinary) fail('foreign-bin-selection');
  const manifest = JSON.parse(readRegular(path.join(packageRoot, 'package.json'), { max: 1024 * 1024 }).toString('utf8'));
  if (manifest.name !== 'great-cto' || !STABLE.test(manifest.version)) fail('invalid-installed-package');
  // npm removes the previous manifest's selections before installing a replacement.
  if (!manifest.bin || Object.keys(manifest.bin).length !== 1 || manifest.bin['great-cto'] !== 'index.mjs' || manifest.man) fail('unsupported-installed-selections');
  return { prefix, packageRoot, binPath, binaryPath: realBinary, version: manifest.version, selection };
}

function fixtureMode(testing, prefix, stateRoot, artifactPath = null) {
  if (!testing) return false;
  if (!testing.access || typeof testing.run !== 'function') fail('synthetic-runner-required');
  const root = canonicalDirectory(testing.fixtureRoot, { privateMode: true });
  const temp = fs.realpathSync(os.tmpdir());
  if (!within(temp, root) || !within(root, prefix) || !within(root, path.resolve(stateRoot)) || (artifactPath && !within(root, artifactPath))) fail('synthetic-fixture-outside-temp');
  return true;
}

function outcome(state, context = {}, reason = null) {
  const synthetic = !!context.synthetic;
  return { state: synthetic && ['SMOKE_PASSED', 'ALREADY_ACTIVE', 'ROLLED_BACK'].includes(state) ? 'SIMULATED_' + state : state,
    authority: synthetic || context.recovery || !['SMOKE_PASSED', 'ALREADY_ACTIVE'].includes(state) ? 'NONE' : 'INSTALLATION_ACTIVATION',
    evidence: synthetic ? 'SYNTHETIC_ONLY' : 'LOCAL_TRANSACTION', releaseEligibility: 'NOT_CHECKED',
    ...(context.version ? { version: context.version } : {}), ...(context.installationId ? { installationId: context.installationId } : {}),
    ...(context.transactionId ? { transactionId: context.transactionId } : {}), ...(reason ? { reason } : {}) };
}

function safeEnvironment(tx, npmPath) {
  const home = path.join(tx, 'home'), temp = path.join(tx, 'tmp');
  fs.mkdirSync(home, { mode: 0o700 }); fs.mkdirSync(temp, { mode: 0o700 });
  const config = path.join(tx, 'empty.npmrc'); fs.writeFileSync(config, '', { flag: 'wx', mode: 0o600 });
  const globalConfig = path.join(tx, 'empty-global.npmrc'); fs.writeFileSync(globalConfig, '', { flag: 'wx', mode: 0o600 });
  return { PATH: [path.dirname(process.execPath), path.dirname(npmPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
    HOME: home, USERPROFILE: home, TMPDIR: temp, NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_CACHE: path.join(tx, 'npm-cache'), NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_PACKAGE_LOCK: 'false',
    DO_NOT_TRACK: '1', GREAT_CTO_TELEMETRY: 'off', GREAT_CTO_NO_BOARD: '1', GREAT_CTO_NO_UPDATE_CHECK: '1', CI: '1' };
}

function targetState(installation) {
  const snapshot = packageSnapshot(installation.packageRoot);
  return { packageDigest: snapshot.digest, filesDigest: snapshot.filesDigest, selection: binSelection(installation.binPath, installation.packageRoot) };
}

function stateMatches(actual, expected) { return actual.packageDigest === expected.packageDigest && JSON.stringify(actual.selection) === JSON.stringify(expected.selection); }

function expectedCandidate(files) {
  const inventory = files.map(file => ({ path: file.path, size: file.bytes.length, sha256: hash(file.bytes), mode: file.mode })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return hash(JSON.stringify(inventory));
}

function privateInstallationState(stateRoot, packageRoot, { recovering = false } = {}) {
  const root = canonicalDirectory(stateRoot, { create: true, privateMode: true });
  const installationId = hash(packageRoot), dir = path.join(root, installationId);
  canonicalDirectory(dir, { create: true, privateMode: true });
  const lock = path.join(dir, 'lock');
  if (recovering && fs.existsSync(lock)) {
    const guard = path.join(dir, 'recovery-lock');
    try { fs.mkdirSync(guard, { mode: 0o700 }); } catch (e) { if (e.code === 'EEXIST') fail('recovery-busy-lock'); throw e; }
    try {
      canonicalDirectory(lock, { privateMode: true });
      const ownerFile = path.join(lock, 'owner.json'), owner = readRecord(ownerFile);
      if (owner.schema !== 1 || !Number.isInteger(owner.pid) || owner.pid <= 0 || !UUID.test(owner.token)) fail('invalid-lock-owner');
      try { process.kill(owner.pid, 0); fail('installation-busy-lock'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
      // Normal updaters cannot remove this lock; recovery contenders are serialized.
      if (JSON.stringify(readRecord(ownerFile)) !== JSON.stringify(owner)) fail('lock-owner-changed');
      fs.renameSync(lock, path.join(dir, 'orphaned-lock-' + owner.token)); syncDirectory(dir);
    } finally { fs.rmdirSync(guard); }
  }
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch (e) { if (e.code === 'EEXIST') fail('installation-busy-lock'); throw e; }
  const lockToken = randomUUID();
  try { writeRecord(path.join(lock, 'owner.json'), { schema: 1, pid: process.pid, token: lockToken }); }
  catch (e) { try { fs.rmdirSync(lock); } catch { /* leave failed ownership evidence */ } throw e; }
  syncDirectory(dir);
  return { installationId, dir, lock, lockToken, journalPath: path.join(dir, 'transaction.json'), watermarkPath: path.join(dir, 'watermark.json') };
}

function releaseLock(state) {
  if (!state?.lock) return;
  try {
    const ownerFile = path.join(state.lock, 'owner.json'), owner = readRecord(ownerFile);
    if (owner.pid !== process.pid || owner.token !== state.lockToken) return;
    fs.unlinkSync(ownerFile); fs.rmdirSync(state.lock); syncDirectory(state.dir);
  } catch { /* Never remove a lock whose ownership cannot be established. */ }
}

function backupSnapshot(snapshot, backupRoot) {
  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  for (const directory of snapshot.directories) fs.mkdirSync(path.join(backupRoot, directory.path), { recursive: true, mode: 0o700 });
  for (const file of snapshot.files) {
    const out = path.join(backupRoot, file.path); fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    const fd = fs.openSync(out, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, file.mode);
    try { fs.writeFileSync(fd, file.bytes); fs.fchmodSync(fd, file.mode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  for (const directory of [...snapshot.directories].reverse()) { const dir = path.join(backupRoot, directory.path); fs.chmodSync(dir, directory.mode); syncDirectory(dir); }
}

function validJournal(journal, installation, state) {
  if (journal?.schema !== 1 || journal.installationId !== state.installationId || journal.packageRoot !== installation.packageRoot || journal.binPath !== installation.binPath || !UUID.test(journal.transactionId) || !/^[a-f0-9]{64}$/.test(journal.previous?.packageDigest || '') || !STABLE.test(journal.previous?.version || '') || journal.previous?.provenance !== 'LEGACY_LOCAL_RECOVERY' || !STABLE.test(journal.candidate?.version || '') || !/^[a-f0-9]{64}$/.test(journal.candidate?.digest || '') || !/^[a-f0-9]{40}$/.test(journal.candidate?.commit || '') || typeof journal.synthetic !== 'boolean') fail('invalid-recovery-journal');
  if (journal.previous.selection?.kind !== 'symlink' || path.resolve(path.dirname(installation.binPath), journal.previous.selection.link) !== path.join(installation.packageRoot, 'index.mjs')) fail('invalid-recovery-selection');
  return journal;
}

function rollback(installation, state, journal, context) {
  try {
    validJournal(journal, installation, state);
    const backup = path.join(state.dir, 'transactions', journal.transactionId, 'previous/package');
    const snapshot = packageSnapshot(backup);
    if (snapshot.digest !== journal.previous.packageDigest) fail('recovery-backup-digest-mismatch');
    const current = targetState(installation);
    if (stateMatches(current, journal.previous)) {
      journal.state = 'ROLLED_BACK'; writeRecord(state.journalPath, journal); return outcome('ROLLED_BACK', context);
    }
    if (!journal.written || !stateMatches(current, journal.written)) fail('recovery-target-drift-or-unobserved-write');
    const restored = path.join(state.dir, 'transactions', journal.transactionId, 'restored-' + randomUUID());
    backupSnapshot(snapshot, restored);
    // Check immediately before replacement, without restoring a shared npm prefix.
    if (!stateMatches(targetState(installation), journal.written)) fail('recovery-target-drift');
    const displaced = path.join(state.dir, 'transactions', journal.transactionId, 'failed-package-' + randomUUID());
    fs.renameSync(installation.packageRoot, displaced);
    if (packageSnapshot(displaced).digest !== journal.written.packageDigest) {
      if (!fs.existsSync(installation.packageRoot)) fs.renameSync(displaced, installation.packageRoot);
      fail('recovery-target-changed-at-replacement');
    }
    try { fs.renameSync(restored, installation.packageRoot); }
    catch (error) { fs.renameSync(displaced, installation.packageRoot); throw error; }
    const selected = binSelection(installation.binPath, installation.packageRoot);
    if (JSON.stringify(selected) !== JSON.stringify(journal.written.selection)) fail('recovery-bin-drift');
    if (JSON.stringify(selected) !== JSON.stringify(journal.previous.selection)) {
      const displacedBin = path.join(state.dir, 'transactions', journal.transactionId, 'failed-bin-' + randomUUID());
      fs.renameSync(installation.binPath, displacedBin);
      if (fs.readlinkSync(displacedBin) !== journal.written.selection.link) {
        if (!fs.existsSync(installation.binPath)) fs.renameSync(displacedBin, installation.binPath);
        fail('recovery-bin-changed-at-replacement');
      }
      // symlink creation is exclusive: a concurrent new selection is never replaced.
      fs.symlinkSync(journal.previous.selection.link, installation.binPath);
    }
    syncDirectory(path.dirname(installation.packageRoot)); syncDirectory(path.dirname(installation.binPath));
    if (!stateMatches(targetState(installation), journal.previous)) fail('restored-state-mismatch');
    journal.state = 'ROLLED_BACK'; journal.recovery = 'RESTORED_PREEXISTING_OPERATOR_STATE'; writeRecord(state.journalPath, journal);
    return outcome('ROLLED_BACK', context);
  } catch (error) {
    journal.state = 'RECOVERY_REQUIRED'; journal.failure = error.activationReason || 'recovery-check-failed';
    try { writeRecord(state.journalPath, journal); } catch { /* preserve original journal if its writer fails */ }
    return outcome('RECOVERY_REQUIRED', context, journal.failure);
  }
}

/** No candidate process executes until the ticket and exact bytes are admitted. */
export function activateNpmRelease(admission, options) {
  let state = null, journal = null, installation = null, context = {};
  try {
    const api = options?.testing?.access || access;
    const info = api.getAdmissionInfo(admission);
    if (!info?.isProduction && !options?.testing) fail('production-artifact-admission-required');
    if (!info || !STABLE.test(info.version)) fail('invalid-admission-version');
    const artifact = api.getAdmittedArtifact(admission, 'npm'), payload = api.inspectNpmPayload(admission);
    installation = resolveNpmInstallation(options.binaryPath);
    const synthetic = fixtureMode(options.testing, installation.prefix, options.stateRoot, artifact.path);
    if (synthetic && info.isProduction) fail('synthetic-adapter-cannot-activate-production-ticket');
    context = { synthetic, version: info.version };
    const statePath = path.resolve(options.stateRoot), archivePath = path.resolve(artifact.path);
    if (statePath === installation.prefix || within(installation.prefix, statePath) || archivePath === installation.prefix || within(installation.prefix, archivePath)) fail('staging-inside-installation');
    if (payload.version !== info.version || !Array.isArray(payload.files)) fail('payload-version-mismatch');
    if (hash(readRegular(artifact.path)) !== artifact.sha256) fail('artifact-digest-mismatch');
    if (compare(info.version, installation.version) < 0) fail('candidate-downgrade');
    const previous = packageSnapshot(installation.packageRoot), selection = binSelection(installation.binPath, installation.packageRoot);
    state = privateInstallationState(options.stateRoot, installation.packageRoot); context.installationId = state.installationId;
    if (fs.statSync(state.dir).dev !== fs.statSync(installation.packageRoot).dev) fail('cross-device-recovery-unsupported');
    if (fs.existsSync(state.journalPath)) {
      const old = readRecord(state.journalPath);
      if (!!old.synthetic !== synthetic) fail('installation-authority-mismatch');
      if (!['SMOKE_PASSED', 'ROLLED_BACK', 'REFUSED'].includes(old.state)) return outcome('RECOVERY_REQUIRED', context, 'unfinished-activation');
    }
    if (fs.existsSync(state.watermarkPath)) {
      const watermark = readRecord(state.watermarkPath);
      if (watermark.schema !== 1 || !STABLE.test(watermark.version) || !/^[a-f0-9]{64}$/.test(watermark.digest || '')) fail('invalid-admission-watermark');
      if (!!watermark.synthetic !== synthetic) fail('watermark-authority-mismatch');
      if (compare(info.version, watermark.version) < 0) fail('candidate-below-watermark');
      if (info.version === watermark.version) {
        if (artifact.sha256 !== watermark.digest) fail('same-version-content-conflict');
        if (installation.version !== info.version || previous.filesDigest !== expectedCandidate(payload.files)) fail('selected-package-drift');
        return outcome('ALREADY_ACTIVE', context);
      }
    } else if (info.version === installation.version) fail('same-version-without-retained-admission');
    const txid = randomUUID(), tx = path.join(state.dir, 'transactions', txid);
    fs.mkdirSync(tx, { recursive: true, mode: 0o700 }); context.transactionId = txid;
    backupSnapshot(previous, path.join(tx, 'previous/package'));
    syncAncestors(path.join(tx, 'previous/package'), path.resolve(options.stateRoot));
    const activationArchive = path.join(tx, 'candidate.tgz'), admittedBytes = readRegular(artifact.path, { max: 128 * 1024 * 1024 });
    if (hash(admittedBytes) !== artifact.sha256) fail('artifact-changed-before-staging');
    const archiveFd = fs.openSync(activationArchive, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(archiveFd, admittedBytes); fs.fsyncSync(archiveFd); } finally { fs.closeSync(archiveFd); }
    syncDirectory(tx);
    journal = { schema: 1, installationId: state.installationId, transactionId: txid, packageRoot: installation.packageRoot, binPath: installation.binPath,
      previous: { version: installation.version, packageDigest: previous.digest, selection, provenance: 'LEGACY_LOCAL_RECOVERY' },
      candidate: { version: info.version, digest: artifact.sha256, commit: info.source.commit }, state: 'SNAPSHOTTED', synthetic };
    const phase = name => { journal.state = name; writeRecord(state.journalPath, journal); options.testing?.onPhase?.(name); };
    phase('SNAPSHOTTED');
    if (!stateMatches(targetState(installation), journal.previous)) fail('target-drift-before-activation');
    const checked = api.getAdmittedArtifact(admission, 'npm');
    if (checked.path !== artifact.path || checked.sha256 !== artifact.sha256 || hash(readRegular(artifact.path)) !== artifact.sha256) fail('artifact-changed-before-activation');
    const npmPath = fs.realpathSync(options.npmPath), npmStat = fs.lstatSync(npmPath);
    if (!npmStat.isFile() || npmStat.mode & 0o022 || !(npmStat.mode & 0o111)) fail('unsafe-npm-executable');
    if (!synthetic && !/^[a-f0-9]{64}$/.test(options.npmSha256 || '')) fail('trusted-npm-digest-required');
    const verifyNpm = () => { if (options.npmSha256 && hash(readRegular(npmPath, { max: 128 * 1024 * 1024, allowRootOwner: true })) !== options.npmSha256) fail('trusted-npm-digest-mismatch'); };
    verifyNpm();
    const env = safeEnvironment(tx, npmPath), run = synthetic ? options.testing.run : spawnSync;
    phase('ACTIVATING');
    verifyNpm();
    const finalArtifact = api.getAdmittedArtifact(admission, 'npm');
    if (finalArtifact.sha256 !== artifact.sha256 || hash(readRegular(activationArchive, { max: 128 * 1024 * 1024 })) !== artifact.sha256) fail('artifact-changed-at-activation');
    const args = ['install', '--global', activationArchive, '--ignore-scripts', '--offline', '--prefix', installation.prefix, '--package-lock=false', '--no-save', '--audit=false', '--fund=false'];
    const result = run(npmPath, args, { cwd: tx, env, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    try { journal.written = targetState(installation); } catch { journal.written = null; }
    phase('ACTIVE');
    if (result?.error || result?.signal || result?.status !== 0) return rollback(installation, state, journal, context);
    if (!journal.written || journal.written.filesDigest !== expectedCandidate(payload.files)) return rollback(installation, state, journal, context);
    if (!stateMatches(targetState(installation), journal.written)) return outcome('RECOVERY_REQUIRED', context, 'target-drift-after-activation');
    for (const smokeArgs of [[installation.binaryPath, '--version'], [installation.binaryPath, 'codex-host', 'list']]) {
      const smoke = run(process.execPath, smokeArgs, { cwd: tx, env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      if (smoke?.error || smoke?.signal || smoke?.status !== 0 || (smokeArgs.includes('--version') && String(smoke.stdout || '').trim() !== info.version)) return rollback(installation, state, journal, context);
      if (!stateMatches(targetState(installation), journal.written)) return outcome('RECOVERY_REQUIRED', context, 'target-drift-during-smoke');
    }
    writeRecord(state.watermarkPath, { schema: 1, version: info.version, digest: artifact.sha256, synthetic });
    phase('SMOKE_PASSED');
    return outcome('SMOKE_PASSED', context);
  } catch (error) {
    if (journal && error.activationCrash) return outcome('RECOVERY_REQUIRED', context, 'interrupted-activation');
    if (journal && ['ACTIVATING', 'ACTIVE', 'RECOVERY_REQUIRED'].includes(journal.state)) {
      return rollback(installation, state, journal, context);
    }
    if (journal) { journal.state = 'REFUSED'; try { writeRecord(state.journalPath, journal); } catch { /* do not replace a failed writer with a success */ } }
    const reason = error.activationReason || 'activation-check-failed';
    return outcome(reason.startsWith('unsupported') ? 'UNSUPPORTED' : 'REFUSED', context, reason);
  } finally { releaseLock(state); }
}

/** Recovery only restores previously captured operator state; it admits no release. */
export function recoverNpmActivation(options) {
  let state = null, context = {};
  try {
    const prefix = canonicalDirectory(options.prefix), packageRoot = path.join(prefix, 'lib/node_modules/great-cto'), binPath = path.join(prefix, 'bin/great-cto');
    const synthetic = fixtureMode(options.testing, prefix, options.stateRoot);
    context = { synthetic, recovery: true };
    state = privateInstallationState(options.stateRoot, packageRoot, { recovering: true }); context.installationId = state.installationId;
    const installation = { prefix, packageRoot, binPath }, journal = validJournal(readRecord(state.journalPath), installation, state);
    if (!!journal.synthetic !== synthetic) fail('recovery-authority-mismatch');
    context.version = journal.candidate.version; context.transactionId = journal.transactionId;
    if (journal.state === 'SMOKE_PASSED') {
      const watermark = readRecord(state.watermarkPath);
      if (!journal.written || !stateMatches(targetState(installation), journal.written) || watermark.version !== journal.candidate.version || watermark.digest !== journal.candidate.digest || !!watermark.synthetic !== synthetic) fail('completed-installation-drift');
      return outcome('ALREADY_ACTIVE', context);
    }
    return rollback(installation, state, journal, context);
  } catch (error) { return outcome('RECOVERY_REQUIRED', context, error.activationReason || 'recovery-check-failed'); }
  finally { releaseLock(state); }
}

/** Inspection is not host activation; external runtime is not covered by a snapshot signature. */
export function proposeManagedPluginActivation(admission) {
  try {
    const info = getAdmissionInfo(admission);
    if (!info.isProduction) fail('production-artifact-admission-required');
    const nativeInspection = inspectClaudeNativeAdmission(admission);
    if (nativeInspection.state === 'REFUSED') return outcome('REFUSED', {}, nativeInspection.blockers[0]);
    const payload = inspectPluginPayload(admission);
    const mcpFile = payload.files.find(file => file.path === '.codex-plugin/mcp.json');
    if (mcpFile && /\b(?:npx|npm|pnpm|bunx|uvx)\b/.test(mcpFile.bytes.toString('utf8'))) return { ...outcome('UNSUPPORTED', { version: info.version }, 'external-mcp-runtime-admission-required'), nativeInspection };
    return { ...outcome('UNSUPPORTED', { version: info.version }, nativeInspection.blockers[0]), nativeInspection };
  } catch (error) { return outcome('REFUSED', {}, error.activationReason || 'artifact-admission-required'); }
}
