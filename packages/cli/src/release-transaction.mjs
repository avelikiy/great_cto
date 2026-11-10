/** Transaction primitives shared by the activation adapters: directory and file safety checks,
 * the installation lock, durable records, snapshots and the outcome vocabulary. Nothing here
 * knows what is being activated. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const MAX_FILES = 10000, MAX_BYTES = 512 * 1024 * 1024;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const owned = stat => typeof process.getuid !== 'function' || stat.uid === (typeof stat.uid === 'bigint' ? BigInt(process.getuid()) : process.getuid());
export const within = (root, file) => file !== root && file.startsWith(root + path.sep);
export const fail = reason => { throw Object.assign(new Error(reason), { activationReason: reason }); };

export function canonicalDirectory(dir, { create = false, privateMode = false } = {}) {
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

function readRegularWithMode(file, { max = MAX_BYTES, privateMode = false, allowRootOwner = false } = {}) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(max) || !(owned(before) || (allowRootOwner && before.uid === 0n)) || (before.mode & 0o022n) || (privateMode && (before.mode & 0o777n) !== 0o600n)) fail('unsafe-file');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true });
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) fail('file-changed-during-read');
    return { bytes, mode: Number(before.mode & 0o777n) };
  } finally { fs.closeSync(fd); }
}

export function readRegular(file, options) { return readRegularWithMode(file, options).bytes; }

export function syncDirectory(dir) { const fd = fs.openSync(dir, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

export function syncAncestors(dir, root) {
  for (let current = dir; ; current = path.dirname(current)) {
    syncDirectory(current); if (current === root) return;
    if (!within(root, current)) fail('transaction-path-outside-state-root');
  }
}

/** temp (exclusive, 0600) -> fsync -> rename -> fsync the directory. */
function writeDurably(file, text) {
  const temp = file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file); syncDirectory(path.dirname(file)); } finally { fs.rmSync(temp, { force: true }); }
}

export function writeRecord(file, record) { writeDurably(file, JSON.stringify(record) + '\n'); }

export function readRecord(file) { return JSON.parse(readRegular(file, { max: 1024 * 1024, privateMode: true }).toString('utf8')); }

export function packageSnapshot(root) {
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

export function outcome(state, context = {}, reason = null) {
  const synthetic = !!context.synthetic;
  return { state: synthetic && ['SMOKE_PASSED', 'ALREADY_ACTIVE', 'ROLLED_BACK'].includes(state) ? 'SIMULATED_' + state : state,
    authority: synthetic || context.recovery || !['SMOKE_PASSED', 'ALREADY_ACTIVE'].includes(state) ? 'NONE' : 'INSTALLATION_ACTIVATION',
    evidence: synthetic ? 'SYNTHETIC_ONLY' : 'LOCAL_TRANSACTION', releaseEligibility: 'NOT_CHECKED',
    ...(context.version ? { version: context.version } : {}), ...(context.installationId ? { installationId: context.installationId } : {}),
    ...(context.transactionId ? { transactionId: context.transactionId } : {}), ...(reason ? { reason } : {}) };
}

/** `subject` is whatever the installation is identified by (a package root, a cache version
 * directory): its digest names the state directory, and one subject has one lock. */
export function privateInstallationState(stateRoot, subject, { recovering = false } = {}) {
  const root = canonicalDirectory(stateRoot, { create: true, privateMode: true });
  const installationId = hash(subject), dir = path.join(root, installationId);
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

export function releaseLock(state) {
  if (!state?.lock) return;
  try {
    const ownerFile = path.join(state.lock, 'owner.json'), owner = readRecord(ownerFile);
    if (owner.pid !== process.pid || owner.token !== state.lockToken) return;
    fs.unlinkSync(ownerFile); fs.rmdirSync(state.lock); syncDirectory(state.dir);
  } catch { /* Never remove a lock whose ownership cannot be established. */ }
}

export function backupSnapshot(snapshot, backupRoot) {
  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  for (const directory of snapshot.directories) fs.mkdirSync(path.join(backupRoot, directory.path), { recursive: true, mode: 0o700 });
  for (const file of snapshot.files) {
    const out = path.join(backupRoot, file.path); fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    const fd = fs.openSync(out, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, file.mode);
    try { fs.writeFileSync(fd, file.bytes); fs.fchmodSync(fd, file.mode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  for (const directory of [...snapshot.directories].reverse()) { const dir = path.join(backupRoot, directory.path); fs.chmodSync(dir, directory.mode); syncDirectory(dir); }
}

// ---------------------------------------------------------------------------
// Single-file primitives. A plugin activation changes files it does not own (the host's registry
// and settings), so every write is a compare-and-swap, every change has a snapshot, and every
// restore is conditional on the file still being what this transaction wrote.
//
// POSIX has no atomic "replace only if unchanged". The last re-read and the rename are separate
// system calls, so a writer landing in that gap is overwritten. The gap is microseconds, it is
// checked on both sides, and the absent case closes it entirely with an exclusive hardlink.
// Callers hold the installation lock against each other; the host is not a participant.
// ---------------------------------------------------------------------------

const MAX_TARGET_BYTES = 64 * 1024 * 1024, SHA256 = /^[a-f0-9]{64}$/;
const noTemporary = file => fs.rmSync(file, { force: true });

/** The directory a target lives in, checked with the same rule as every other transaction path. */
function checkedParent(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) fail('absolute-target-required');
  try { return canonicalDirectory(path.dirname(path.resolve(target))); }
  catch (error) { if (error.code === 'ENOENT') fail('target-parent-missing'); throw error; }
}

/** null when the file does not exist; throws for anything else that is not a plain regular file. */
function inspectTarget(file, max) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw Object.assign(error, { activationReason: 'target-unreadable' }); }
  if (stat.isSymbolicLink()) fail('target-symlink-refused');
  if (!stat.isFile()) fail('target-not-regular');
  try { const { bytes, mode } = readRegularWithMode(file, { max }); return { bytes, mode, sha256: hash(bytes) }; }
  catch (error) {
    if (error.activationReason) throw error;
    if (error.code === 'ELOOP') fail('target-symlink-refused');
    if (error.code === 'ENOENT') fail('target-changed-during-read');
    throw Object.assign(error, { activationReason: 'target-unreadable' });
  }
}

const validMode = mode => Number.isInteger(mode) && (mode & ~0o777) === 0 && (mode & 0o022) === 0;

/**
 * Record what a file is before the transaction touches it: a copy under `<transactionDir>/previous/`
 * with its sha256, size and mode. A missing file is recorded as `absent`; an empty file is `present`
 * with the digest of nothing. A file that cannot be read throws and is never recorded as absent.
 */
export function snapshotFile(target, transactionDir, { max = MAX_TARGET_BYTES } = {}) {
  const dir = canonicalDirectory(transactionDir, { privateMode: true }), file = path.join(checkedParent(target), path.basename(target));
  const current = inspectTarget(file, max);
  if (!current) return { schema: 1, target: file, state: 'absent', sha256: null, size: 0, mode: null, backupPath: null };
  const previous = path.join(dir, 'previous');
  fs.mkdirSync(previous, { recursive: true, mode: 0o700 });
  const backupPath = path.join(previous, hash(file).slice(0, 16) + '-' + path.basename(file));
  let fd;
  try { fd = fs.openSync(backupPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('snapshot-exists'); throw error; }
  try { fs.writeFileSync(fd, current.bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(previous); syncDirectory(dir);
  return { schema: 1, target: file, state: 'present', sha256: current.sha256, size: current.bytes.length, mode: current.mode, backupPath };
}

/**
 * Replace `target` only if it is still what the caller read: read, check, write a temporary file in the
 * same directory (exclusive, 0600), fsync, re-read the original and check again, then rename and fsync
 * the directory. A mismatch at either check refuses with a named reason and leaves no temporary file.
 * `onBeforeRecheck` is an injection seam for the gap between the two checks; production passes nothing.
 */
export function compareAndSwapFile(target, { expectDigest, expectAbsent, nextBytes, mode, onBeforeRecheck, max = MAX_TARGET_BYTES } = {}) {
  const wantAbsent = expectAbsent === true;
  if (wantAbsent === (expectDigest !== undefined) || (!wantAbsent && !SHA256.test(expectDigest))) fail('invalid-expectation');
  if (typeof nextBytes !== 'string' && !(nextBytes instanceof Uint8Array)) fail('invalid-next-bytes');
  const next = Buffer.from(nextBytes);
  if (next.length > max) fail('next-bytes-too-large');
  const dir = checkedParent(target), file = path.join(dir, path.basename(target)), current = inspectTarget(file, max);
  if (wantAbsent && current) fail('target-exists');
  if (!wantAbsent && !current) fail('target-absent');
  if (!wantAbsent && current.sha256 !== expectDigest) fail('target-digest-mismatch');
  const finalMode = mode ?? current?.mode ?? 0o600;
  if (!validMode(finalMode)) fail('invalid-mode');
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, next); fs.fchmodSync(fd, finalMode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    onBeforeRecheck?.({ target: file });
    if (wantAbsent) {
      // Exclusive publish is the second check: a file that appeared meanwhile makes link() fail and is never replaced.
      try { fs.linkSync(temp, file); } catch (error) { if (error.code === 'EEXIST') fail('target-changed-before-swap'); throw error; }
      noTemporary(temp);
    } else {
      const again = inspectTarget(file, max);
      if (!again || again.sha256 !== expectDigest) fail('target-changed-before-swap');
      fs.renameSync(temp, file);
    }
    syncDirectory(dir);
  } finally { noTemporary(temp); }
  return { sha256: hash(next), previousSha256: current?.sha256 ?? null, mode: finalMode };
}

function validSnapshot(snapshot, file) {
  if (snapshot?.schema !== 1 || (snapshot.state !== 'present' && snapshot.state !== 'absent')) fail('invalid-snapshot');
  if (snapshot.target !== file) fail('snapshot-target-mismatch');
  if (snapshot.state === 'present' && (!SHA256.test(snapshot.sha256) || !validMode(snapshot.mode) || typeof snapshot.backupPath !== 'string' || !path.isAbsolute(snapshot.backupPath))) fail('invalid-snapshot');
  if (snapshot.state === 'absent' && (snapshot.sha256 !== null || snapshot.backupPath !== null)) fail('invalid-snapshot');
}

/**
 * Put a snapshot back only while the file still equals what this transaction wrote (`ourDigest`).
 * RESTORED, ALREADY_RESTORED (nothing to do, nothing written) or RECOVERY_REQUIRED with a reason and
 * nothing written. An `absent` snapshot is restored by removing the file under the same condition.
 */
export function restoreFileIfOurs(target, { ourDigest, snapshot, onBeforeRecheck, max = MAX_TARGET_BYTES } = {}) {
  try {
    if (typeof target !== 'string' || !path.isAbsolute(target)) fail('absolute-target-required');
    const file = path.resolve(target);
    validSnapshot(snapshot, file);
    if (!SHA256.test(ourDigest)) fail('invalid-expectation');
    const dir = checkedParent(file), current = inspectTarget(file, max), present = snapshot.state === 'present';
    if (present ? current?.sha256 === snapshot.sha256 : !current) return { state: 'ALREADY_RESTORED' };
    if (!current) fail('target-removed-since-write');
    if (current.sha256 !== ourDigest) fail('target-changed-since-write');
    if (present) {
      const backup = readRegularWithMode(snapshot.backupPath, { max, privateMode: true }).bytes;
      if (hash(backup) !== snapshot.sha256) fail('backup-digest-mismatch');
      compareAndSwapFile(file, { expectDigest: ourDigest, nextBytes: backup, mode: snapshot.mode, onBeforeRecheck, max });
    } else {
      onBeforeRecheck?.({ target: file });
      const again = inspectTarget(file, max);
      if (!again || again.sha256 !== ourDigest) fail('target-changed-before-swap');
      fs.unlinkSync(file); syncDirectory(dir);
    }
    return { state: 'RESTORED' };
  } catch (error) { return { state: 'RECOVERY_REQUIRED', reason: error.activationReason || 'restore-check-failed' }; }
}

// ---------------------------------------------------------------------------
// Journal: an append-only phase record. Each entry carries the digest of the line before it, so an
// edited, removed or reordered entry is detected rather than trusted. Callers append under the
// installation lock; two unlocked appenders would lose one entry.
// ---------------------------------------------------------------------------

const PHASE = /^[A-Z][A-Z0-9_]{1,47}$/, JOURNAL_ORIGIN = '0'.repeat(64), MAX_JOURNAL_BYTES = 4 * 1024 * 1024;

function loadJournal(file) {
  let raw;
  try { raw = readRegular(file, { max: MAX_JOURNAL_BYTES, privateMode: true }).toString('utf8'); }
  catch (error) { if (error.code === 'ENOENT') fail('journal-missing'); throw error; }
  if (!raw.endsWith('\n')) fail('journal-corrupt');
  const entries = []; let previous = JOURNAL_ORIGIN;
  for (const line of raw.slice(0, -1).split('\n')) {
    let entry;
    try { entry = JSON.parse(line); } catch { fail('journal-corrupt'); }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.seq !== entries.length + 1 || !PHASE.test(entry.phase) || typeof entry.at !== 'string' || entry.prev !== previous) fail('journal-corrupt');
    previous = hash(line); entries.push(entry);
  }
  return { raw, entries, last: previous };
}

/** Every entry in order. A missing journal is `journal-missing` and a damaged one `journal-corrupt`: never an empty list. */
export function readJournal(file) { return loadJournal(file).entries; }

/** Add one phase, durably, after verifying the whole journal; returns all entries. Earlier bytes are never rewritten. */
export function appendJournalPhase(file, phase, data = {}) {
  if (typeof phase !== 'string' || !PHASE.test(phase)) fail('invalid-journal-phase');
  if (data === null || typeof data !== 'object' || Array.isArray(data)) fail('invalid-journal-data');
  let exists = true;
  try { fs.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  const journal = exists ? loadJournal(file) : { raw: '', entries: [], last: JOURNAL_ORIGIN };
  const line = JSON.stringify({ seq: journal.entries.length + 1, phase, at: new Date().toISOString(), prev: journal.last, data });
  writeDurably(file, journal.raw + line + '\n');
  return [...journal.entries, JSON.parse(line)];
}
