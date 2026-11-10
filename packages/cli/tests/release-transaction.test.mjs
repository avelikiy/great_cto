import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  outcome, canonicalDirectory, writeRecord, readRecord, syncAncestors, packageSnapshot, backupSnapshot,
  privateInstallationState, releaseLock, snapshotFile, compareAndSwapFile, restoreFileIfOurs, appendJournalPhase, readJournal,
} from '../src/release-transaction.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const MODULE_URL = new URL('../src/release-transaction.mjs', import.meta.url).href;
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-tx-')));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** Every entry under dir as one string; two equal listings mean nothing was written. */
function listing(dir) {
  const out = [];
  (function walk(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name), stat = fs.lstatSync(file), rel = path.relative(dir, file);
      if (stat.isDirectory()) { out.push(`${rel}|dir|${(stat.mode & 0o777).toString(8)}`); walk(file); }
      else if (stat.isSymbolicLink()) out.push(`${rel}|link|${fs.readlinkSync(file)}`);
      else out.push(`${rel}|file|${(stat.mode & 0o777).toString(8)}|${sha(fs.readFileSync(file))}`);
    }
  })(dir);
  return out;
}

const refuses = (fn, reason) => assert.throws(fn, error => { assert.equal(error.activationReason, reason, `refused as ${error.activationReason ?? error.message}`); return true; });
const put = (file, content, mode = 0o600) => { fs.writeFileSync(file, content); fs.chmodSync(file, mode); return file; };
function directory(parent, name, mode = 0o700) { const dir = path.join(parent, name); fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, mode); return dir; }

/** A host directory (where the target lives) and a transaction directory (where backups go). */
function world(t) {
  const root = sandbox(t);
  return { root, host: directory(root, 'host'), tx: directory(root, 'tx') };
}

// ---------------------------------------------------------------------------
// Extracted primitives: behaviour is the one the npm adapter already relies on.
// ---------------------------------------------------------------------------

test('outcome keeps the authority and simulation vocabulary of the npm adapter', () => {
  const real = outcome('SMOKE_PASSED', { version: '3.71.0', installationId: 'i', transactionId: 't' });
  assert.deepEqual(real, { state: 'SMOKE_PASSED', authority: 'INSTALLATION_ACTIVATION', evidence: 'LOCAL_TRANSACTION', releaseEligibility: 'NOT_CHECKED', version: '3.71.0', installationId: 'i', transactionId: 't' });
  const synthetic = outcome('SMOKE_PASSED', { synthetic: true });
  assert.equal(synthetic.state, 'SIMULATED_SMOKE_PASSED'); assert.equal(synthetic.authority, 'NONE'); assert.equal(synthetic.evidence, 'SYNTHETIC_ONLY');
  assert.equal(outcome('ALREADY_ACTIVE', { recovery: true }).authority, 'NONE');
  const refused = outcome('REFUSED', {}, 'some-reason');
  assert.equal(refused.state, 'REFUSED'); assert.equal(refused.authority, 'NONE'); assert.equal(refused.reason, 'some-reason');
});

test('canonicalDirectory refuses relative paths, symlinked ancestors, writable-by-others and non-private directories', t => {
  const root = sandbox(t);
  refuses(() => canonicalDirectory('relative/dir'), 'absolute-directory-required');
  const real = directory(root, 'real'), link = path.join(root, 'link'); fs.symlinkSync(real, link);
  refuses(() => canonicalDirectory(path.join(link, 'sub')), 'directory-symlink-refused');
  refuses(() => canonicalDirectory(directory(root, 'open', 0o770)), 'unsafe-directory');
  refuses(() => canonicalDirectory(directory(root, 'group-readable', 0o750), { privateMode: true }), 'unsafe-directory');
  assert.equal(canonicalDirectory(directory(root, 'private', 0o700), { privateMode: true }), path.join(root, 'private'));
  const created = canonicalDirectory(path.join(root, 'made/by/create'), { create: true, privateMode: true });
  assert.equal(fs.statSync(created).mode & 0o777, 0o700);
});

test('writeRecord replaces durably at mode 0600 and leaves no temporary file; readRecord refuses a loose file', t => {
  const root = sandbox(t), file = path.join(root, 'record.json');
  writeRecord(file, { value: 1 }); writeRecord(file, { value: 2 });
  assert.deepEqual(readRecord(file), { value: 2 });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.deepEqual(fs.readdirSync(root), ['record.json']);
  fs.chmodSync(file, 0o644);
  refuses(() => readRecord(file), 'unsafe-file');
});

test('syncAncestors walks up to the state root and refuses a path outside it', t => {
  const root = sandbox(t), inner = directory(root, 'a/b'), outside = directory(sandbox(t), 'elsewhere');
  syncAncestors(inner, root);
  refuses(() => syncAncestors(outside, root), 'transaction-path-outside-state-root');
});

test('packageSnapshot and backupSnapshot reproduce exact bytes, modes and empty directories and refuse symlinks', t => {
  const root = sandbox(t), src = directory(root, 'pkg', 0o755);
  directory(src, 'lib', 0o755); directory(src, 'empty', 0o750);
  put(path.join(src, 'index.mjs'), 'runtime', 0o755); put(path.join(src, 'lib/a.js'), 'a', 0o644);
  const snapshot = packageSnapshot(src), backup = path.join(root, 'backup');
  backupSnapshot(snapshot, backup);
  assert.equal(packageSnapshot(backup).digest, snapshot.digest);
  assert.equal(fs.statSync(path.join(backup, 'empty')).mode & 0o777, 0o750);
  assert.equal(fs.statSync(path.join(backup, 'index.mjs')).mode & 0o777, 0o755);
  fs.symlinkSync(path.join(src, 'index.mjs'), path.join(src, 'escape'));
  refuses(() => packageSnapshot(src), 'unsafe-package-entry');
});

// ---------------------------------------------------------------------------
// Installation lock
// ---------------------------------------------------------------------------

function leaveOrphanLock(stateRoot, subject) {
  const source = `import {privateInstallationState} from ${JSON.stringify(MODULE_URL)}; privateInstallationState(process.argv[1], process.argv[2]); process.exit(0);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source, stateRoot, subject], { encoding: 'utf8', timeout: 15000 });
  assert.equal(child.status, 0, child.stderr);
}

test('a second locker is refused and writes nothing', t => {
  const root = sandbox(t), stateRoot = path.join(root, 'state'), subject = path.join(root, 'subject');
  const first = privateInstallationState(stateRoot, subject), before = listing(stateRoot);
  refuses(() => privateInstallationState(stateRoot, subject), 'installation-busy-lock');
  assert.deepEqual(listing(stateRoot), before);
  assert.equal(readRecord(path.join(first.lock, 'owner.json')).token, first.lockToken);
  releaseLock(first);
  assert.equal(fs.existsSync(first.lock), false);
  releaseLock(privateInstallationState(stateRoot, subject));
});

test('releaseLock leaves a lock whose ownership it cannot establish', t => {
  const root = sandbox(t), state = privateInstallationState(path.join(root, 'state'), path.join(root, 'subject'));
  const owner = path.join(state.lock, 'owner.json'), record = readRecord(owner);
  fs.rmSync(owner); writeRecord(owner, { ...record, token: randomUUID() });
  releaseLock(state);
  assert.equal(fs.existsSync(owner), true);
});

test('an orphan lock left by a dead process is refused normally and reclaimed only by explicit recovery', t => {
  const root = sandbox(t), stateRoot = path.join(root, 'state'), subject = path.join(root, 'subject');
  leaveOrphanLock(stateRoot, subject);
  const dir = path.join(stateRoot, sha(subject)), owner = readRecord(path.join(dir, 'lock', 'owner.json'));
  assert.notEqual(owner.pid, process.pid);
  refuses(() => privateInstallationState(stateRoot, subject), 'installation-busy-lock');
  assert.equal(fs.existsSync(path.join(dir, 'lock')), true);
  const state = privateInstallationState(stateRoot, subject, { recovering: true });
  assert.equal(fs.existsSync(path.join(dir, 'orphaned-lock-' + owner.token)), true);
  assert.equal(readRecord(path.join(state.lock, 'owner.json')).pid, process.pid);
  assert.equal(fs.existsSync(path.join(dir, 'recovery-lock')), false);
  releaseLock(state);
});

test('recovery never steals the lock of a live process', t => {
  const root = sandbox(t), stateRoot = path.join(root, 'state'), subject = path.join(root, 'subject');
  const live = privateInstallationState(stateRoot, subject), before = listing(stateRoot);
  refuses(() => privateInstallationState(stateRoot, subject, { recovering: true }), 'installation-busy-lock');
  assert.deepEqual(listing(stateRoot), before);
  releaseLock(live);
});

test('two recovery contenders are serialized: the second finds the guard and touches nothing', t => {
  const root = sandbox(t), stateRoot = path.join(root, 'state'), subject = path.join(root, 'subject');
  leaveOrphanLock(stateRoot, subject);
  const dir = path.join(stateRoot, sha(subject)); fs.mkdirSync(path.join(dir, 'recovery-lock'), { mode: 0o700 });
  const before = listing(stateRoot);
  refuses(() => privateInstallationState(stateRoot, subject, { recovering: true }), 'recovery-busy-lock');
  assert.deepEqual(listing(stateRoot), before);
});

// ---------------------------------------------------------------------------
// snapshotFile
// ---------------------------------------------------------------------------

test('snapshotFile copies a present file into previous/ and records its digest, size and mode', t => {
  const { host, tx } = world(t), file = put(path.join(host, 'settings.json'), '{"a":1}', 0o640);
  const snapshot = snapshotFile(file, tx);
  assert.equal(snapshot.state, 'present'); assert.equal(snapshot.target, file);
  assert.equal(snapshot.sha256, sha('{"a":1}')); assert.equal(snapshot.size, 7); assert.equal(snapshot.mode, 0o640);
  assert.ok(snapshot.backupPath.startsWith(path.join(tx, 'previous') + path.sep));
  assert.equal(fs.readFileSync(snapshot.backupPath, 'utf8'), '{"a":1}');
  assert.equal(fs.statSync(snapshot.backupPath).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}'); assert.equal(fs.statSync(file).mode & 0o777, 0o640);
});

test('a missing target is recorded as absent, never as an empty file, and an empty file is not absent', t => {
  const { host, tx } = world(t);
  const missing = snapshotFile(path.join(host, 'missing.json'), tx);
  assert.equal(missing.state, 'absent'); assert.equal(missing.sha256, null); assert.equal(missing.backupPath, null); assert.equal(missing.mode, null);
  assert.equal(fs.existsSync(path.join(tx, 'previous')) ? fs.readdirSync(path.join(tx, 'previous')).length : 0, 0);
  const empty = snapshotFile(put(path.join(host, 'empty.json'), ''), tx);
  assert.equal(empty.state, 'present'); assert.equal(empty.sha256, sha('')); assert.equal(empty.size, 0);
  assert.equal(fs.readFileSync(empty.backupPath, 'utf8'), '');
});

test('an unreadable target throws and is never recorded as absent', { skip: isRoot && 'root can read mode-000 files' }, t => {
  const { host, tx } = world(t), file = put(path.join(host, 'locked.json'), 'secret', 0o000);
  assert.throws(() => snapshotFile(file, tx), error => error.code === 'EACCES' && error.activationReason === 'target-unreadable');
  assert.equal(fs.existsSync(path.join(tx, 'previous')) ? fs.readdirSync(path.join(tx, 'previous')).length : 0, 0);
});

test('snapshotFile refuses symlinks (including dangling ones), directories and a second snapshot of the same target', t => {
  const { root, host, tx } = world(t), real = put(path.join(root, 'real.json'), 'real');
  const link = path.join(host, 'link.json'); fs.symlinkSync(real, link);
  refuses(() => snapshotFile(link, tx), 'target-symlink-refused');
  const dangling = path.join(host, 'dangling.json'); fs.symlinkSync(path.join(root, 'nowhere'), dangling);
  refuses(() => snapshotFile(dangling, tx), 'target-symlink-refused');
  refuses(() => snapshotFile(directory(host, 'a-directory'), tx), 'target-not-regular');
  refuses(() => snapshotFile('relative.json', tx), 'absolute-target-required');
  const file = put(path.join(host, 'once.json'), 'x');
  snapshotFile(file, tx);
  refuses(() => snapshotFile(file, tx), 'snapshot-exists');
});

// ---------------------------------------------------------------------------
// compareAndSwapFile
// ---------------------------------------------------------------------------

test('compareAndSwapFile replaces a file whose digest matches, at the requested mode, with no temporary file left', t => {
  const { host } = world(t), file = put(path.join(host, 'registry.json'), 'before', 0o640);
  const result = compareAndSwapFile(file, { expectDigest: sha('before'), nextBytes: 'after', mode: 0o644 });
  assert.equal(fs.readFileSync(file, 'utf8'), 'after'); assert.equal(fs.statSync(file).mode & 0o777, 0o644);
  assert.deepEqual(result, { sha256: sha('after'), previousSha256: sha('before'), mode: 0o644 });
  assert.deepEqual(fs.readdirSync(host), ['registry.json']);
});

test('compareAndSwapFile keeps the existing mode unless told otherwise and creates absent files at 0600', t => {
  const { host } = world(t), file = put(path.join(host, 'a.json'), 'one', 0o640);
  compareAndSwapFile(file, { expectDigest: sha('one'), nextBytes: 'two' });
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  const fresh = path.join(host, 'fresh.json');
  const result = compareAndSwapFile(fresh, { expectAbsent: true, nextBytes: Buffer.from('new') });
  assert.equal(fs.readFileSync(fresh, 'utf8'), 'new'); assert.equal(fs.statSync(fresh).mode & 0o777, 0o600); assert.equal(result.previousSha256, null);
  assert.deepEqual(fs.readdirSync(host).sort(), ['a.json', 'fresh.json']); assert.equal(fs.statSync(fresh).nlink, 1);
});

test('a digest mismatch at the first check refuses, changes nothing and leaves no temporary file', t => {
  const { host } = world(t), file = put(path.join(host, 'settings.json'), 'operator bytes');
  const before = listing(host);
  refuses(() => compareAndSwapFile(file, { expectDigest: sha('something else'), nextBytes: 'ours' }), 'target-digest-mismatch');
  assert.deepEqual(listing(host), before);
});

test('presence expectations are enforced in both directions', t => {
  const { host } = world(t), present = put(path.join(host, 'present.json'), 'x'), missing = path.join(host, 'missing.json');
  const before = listing(host);
  refuses(() => compareAndSwapFile(present, { expectAbsent: true, nextBytes: 'ours' }), 'target-exists');
  refuses(() => compareAndSwapFile(missing, { expectDigest: sha('x'), nextBytes: 'ours' }), 'target-absent');
  assert.deepEqual(listing(host), before);
});

test('a change between the read and the rename is caught by the second check and not overwritten', t => {
  const { host } = world(t), file = put(path.join(host, 'registry.json'), 'before');
  const result = (() => { try { return compareAndSwapFile(file, { expectDigest: sha('before'), nextBytes: 'ours', onBeforeRecheck: () => fs.writeFileSync(file, 'host wrote this') }); } catch (error) { return error; } })();
  assert.equal(result.activationReason, 'target-changed-before-swap');
  assert.equal(fs.readFileSync(file, 'utf8'), 'host wrote this');
  assert.deepEqual(fs.readdirSync(host), ['registry.json']);
});

test('a file that appears between the checks is never clobbered when the target was expected to be absent', t => {
  const { host } = world(t), file = path.join(host, 'registry.json');
  const result = (() => { try { return compareAndSwapFile(file, { expectAbsent: true, nextBytes: 'ours', onBeforeRecheck: () => fs.writeFileSync(file, 'host created this') }); } catch (error) { return error; } })();
  assert.equal(result.activationReason, 'target-changed-before-swap');
  assert.equal(fs.readFileSync(file, 'utf8'), 'host created this');
  assert.deepEqual(fs.readdirSync(host), ['registry.json']);
});

test('symlink and non-regular targets are refused and the link target is never written', t => {
  const { root, host } = world(t), real = put(path.join(root, 'real.json'), 'real');
  const link = path.join(host, 'link.json'); fs.symlinkSync(real, link);
  refuses(() => compareAndSwapFile(link, { expectDigest: sha('real'), nextBytes: 'ours' }), 'target-symlink-refused');
  refuses(() => compareAndSwapFile(link, { expectAbsent: true, nextBytes: 'ours' }), 'target-symlink-refused');
  const dangling = path.join(host, 'dangling.json'); fs.symlinkSync(path.join(root, 'nowhere'), dangling);
  refuses(() => compareAndSwapFile(dangling, { expectAbsent: true, nextBytes: 'ours' }), 'target-symlink-refused');
  refuses(() => compareAndSwapFile(directory(host, 'dir'), { expectAbsent: true, nextBytes: 'ours' }), 'target-not-regular');
  assert.equal(fs.readFileSync(real, 'utf8'), 'real'); assert.equal(fs.existsSync(path.join(root, 'nowhere')), false);
  assert.deepEqual(fs.readdirSync(host).sort(), ['dangling.json', 'dir', 'link.json']);
});

test('a symlinked ancestor, a missing parent and malformed requests are refused before anything is written', t => {
  const { root, host } = world(t), real = directory(root, 'real'), link = path.join(root, 'link'); fs.symlinkSync(real, link);
  refuses(() => compareAndSwapFile(path.join(link, 'f.json'), { expectAbsent: true, nextBytes: 'x' }), 'directory-symlink-refused');
  refuses(() => compareAndSwapFile(path.join(host, 'no-such-dir', 'f.json'), { expectAbsent: true, nextBytes: 'x' }), 'target-parent-missing');
  const file = put(path.join(host, 'f.json'), 'x');
  refuses(() => compareAndSwapFile(file, { nextBytes: 'y' }), 'invalid-expectation');
  refuses(() => compareAndSwapFile(file, { expectAbsent: true, expectDigest: sha('x'), nextBytes: 'y' }), 'invalid-expectation');
  refuses(() => compareAndSwapFile(file, { expectDigest: 'not-a-digest', nextBytes: 'y' }), 'invalid-expectation');
  refuses(() => compareAndSwapFile(file, { expectDigest: sha('x'), nextBytes: 'y', mode: 0o666 }), 'invalid-mode');
  refuses(() => compareAndSwapFile(file, { expectDigest: sha('x'), nextBytes: 'y', mode: 0o4755 }), 'invalid-mode');
  refuses(() => compareAndSwapFile(file, { expectDigest: sha('x'), nextBytes: 12345 }), 'invalid-next-bytes');
  assert.equal(fs.readFileSync(file, 'utf8'), 'x'); assert.deepEqual(fs.readdirSync(real), []); assert.deepEqual(fs.readdirSync(host), ['f.json']);
});

// ---------------------------------------------------------------------------
// restoreFileIfOurs
// ---------------------------------------------------------------------------

function written(t, original = 'original', mode = 0o640) {
  const w = world(t), file = put(path.join(w.host, 'settings.json'), original, mode);
  const snapshot = snapshotFile(file, w.tx);
  const wrote = compareAndSwapFile(file, { expectDigest: snapshot.sha256, nextBytes: 'ours', mode: 0o600 });
  return { ...w, file, snapshot, ourDigest: wrote.sha256 };
}

test('restoreFileIfOurs puts the snapshot back, mode included, while the file still equals this transaction\'s write', t => {
  const w = written(t);
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot }), { state: 'RESTORED' });
  assert.equal(fs.readFileSync(w.file, 'utf8'), 'original'); assert.equal(fs.statSync(w.file).mode & 0o777, 0o640);
  assert.deepEqual(fs.readdirSync(w.host), ['settings.json']);
});

test('restoreFileIfOurs reports RECOVERY_REQUIRED and writes nothing when the file changed after our write', t => {
  const w = written(t); fs.writeFileSync(w.file, 'operator edit after us');
  const before = listing(w.host);
  const result = restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot });
  assert.deepEqual(result, { state: 'RECOVERY_REQUIRED', reason: 'target-changed-since-write' });
  assert.deepEqual(listing(w.host), before);
});

test('restoring a file that is already back at the snapshot is a no-op', t => {
  const w = written(t);
  restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot });
  const stat = fs.statSync(w.file), before = listing(w.host);
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot }), { state: 'ALREADY_RESTORED' });
  assert.deepEqual(listing(w.host), before); assert.equal(fs.statSync(w.file).mtimeMs, stat.mtimeMs);
});

test('an absent snapshot round-trips: created by the transaction, removed again only while still ours', t => {
  const { host, tx } = world(t), file = path.join(host, 'registry.json');
  const snapshot = snapshotFile(file, tx);
  const wrote = compareAndSwapFile(file, { expectAbsent: true, nextBytes: '{}' });
  assert.deepEqual(restoreFileIfOurs(file, { ourDigest: wrote.sha256, snapshot }), { state: 'RESTORED' });
  assert.equal(fs.existsSync(file), false); assert.deepEqual(fs.readdirSync(host), []);
  assert.deepEqual(restoreFileIfOurs(file, { ourDigest: wrote.sha256, snapshot }), { state: 'ALREADY_RESTORED' });
});

test('an absent snapshot never deletes a file the host changed after our write', t => {
  const { host, tx } = world(t), file = path.join(host, 'registry.json');
  const snapshot = snapshotFile(file, tx), wrote = compareAndSwapFile(file, { expectAbsent: true, nextBytes: '{}' });
  fs.writeFileSync(file, 'host rewrote it');
  assert.deepEqual(restoreFileIfOurs(file, { ourDigest: wrote.sha256, snapshot }), { state: 'RECOVERY_REQUIRED', reason: 'target-changed-since-write' });
  assert.equal(fs.readFileSync(file, 'utf8'), 'host rewrote it');
});

test('a file removed since our write is not recreated from the backup', t => {
  const w = written(t); fs.rmSync(w.file);
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot }), { state: 'RECOVERY_REQUIRED', reason: 'target-removed-since-write' });
  assert.deepEqual(fs.readdirSync(w.host), []);
});

test('a tampered backup is refused by its recorded digest and the target stays as written', t => {
  const w = written(t); fs.writeFileSync(w.snapshot.backupPath, 'tampered backup');
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot }), { state: 'RECOVERY_REQUIRED', reason: 'backup-digest-mismatch' });
  assert.equal(fs.readFileSync(w.file, 'utf8'), 'ours');
});

test('a host write between the restore check and the swap is not overwritten', t => {
  const w = written(t);
  const result = restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot, onBeforeRecheck: () => fs.writeFileSync(w.file, 'host wrote this') });
  assert.deepEqual(result, { state: 'RECOVERY_REQUIRED', reason: 'target-changed-before-swap' });
  assert.equal(fs.readFileSync(w.file, 'utf8'), 'host wrote this'); assert.deepEqual(fs.readdirSync(w.host), ['settings.json']);
});

test('restore refuses a snapshot of another target, a malformed snapshot and a symlinked target', t => {
  const w = written(t), other = put(path.join(w.host, 'other.json'), 'other');
  assert.deepEqual(restoreFileIfOurs(other, { ourDigest: sha('other'), snapshot: w.snapshot }), { state: 'RECOVERY_REQUIRED', reason: 'snapshot-target-mismatch' });
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: { ...w.snapshot, sha256: 'nope' } }), { state: 'RECOVERY_REQUIRED', reason: 'invalid-snapshot' });
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: undefined }), { state: 'RECOVERY_REQUIRED', reason: 'invalid-snapshot' });
  fs.rmSync(w.file); fs.symlinkSync(other, w.file);
  assert.deepEqual(restoreFileIfOurs(w.file, { ourDigest: w.ourDigest, snapshot: w.snapshot }), { state: 'RECOVERY_REQUIRED', reason: 'target-symlink-refused' });
  assert.equal(fs.readFileSync(other, 'utf8'), 'other');
});

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

test('the journal records phases in order, at mode 0600, each entry bound to the one before it', t => {
  const root = sandbox(t), file = path.join(root, 'journal');
  appendJournalPhase(file, 'SNAPSHOTTED', { snapshots: 2 }); appendJournalPhase(file, 'ACTIVATING');
  const entries = appendJournalPhase(file, 'ACTIVE');
  assert.deepEqual(entries.map(entry => [entry.seq, entry.phase]), [[1, 'SNAPSHOTTED'], [2, 'ACTIVATING'], [3, 'ACTIVE']]);
  assert.deepEqual(readJournal(file), entries); assert.equal(entries[0].data.snapshots, 2);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.deepEqual(fs.readdirSync(root), ['journal']);
});

test('appending never rewrites history: the earlier bytes stay an exact prefix', t => {
  const root = sandbox(t), file = path.join(root, 'journal');
  appendJournalPhase(file, 'SNAPSHOTTED'); const first = fs.readFileSync(file);
  appendJournalPhase(file, 'ACTIVATING');
  assert.deepEqual(fs.readFileSync(file).subarray(0, first.length), first);
  assert.ok(fs.readFileSync(file).length > first.length);
});

test('a corrupt journal throws on read and on append, never an empty result, and append writes nothing', t => {
  const root = sandbox(t), clean = path.join(root, 'clean'); appendJournalPhase(clean, 'SNAPSHOTTED'); appendJournalPhase(clean, 'ACTIVATING');
  const text = fs.readFileSync(clean, 'utf8');
  const cases = {
    'garbage line': text + 'not json\n',
    'partial last line': text.slice(0, -6),
    'empty file': '',
    'blank file': '\n',
    'edited earlier entry': text.replace('"SNAPSHOTTED"', '"SMOKE_PASSED"'),
    'deleted first entry': text.split('\n').slice(1).join('\n'),
    'entry with unknown phase shape': text + JSON.stringify({ seq: 3, phase: 'lowercase', at: 'x', prev: 'y' }) + '\n',
  };
  for (const [name, content] of Object.entries(cases)) {
    const file = put(path.join(root, name.replaceAll(' ', '-')), content);
    assert.throws(() => readJournal(file), error => error.activationReason === 'journal-corrupt', name);
    assert.throws(() => appendJournalPhase(file, 'ACTIVE'), error => error.activationReason === 'journal-corrupt', name);
    assert.equal(fs.readFileSync(file, 'utf8'), content, name + ' must be left as found');
  }
  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.tmp')), false);
});

test('a missing or loosely permissioned journal is an error, not an empty journal', t => {
  const root = sandbox(t);
  refuses(() => readJournal(path.join(root, 'absent')), 'journal-missing');
  const file = path.join(root, 'journal'); appendJournalPhase(file, 'SNAPSHOTTED'); fs.chmodSync(file, 0o644);
  refuses(() => readJournal(file), 'unsafe-file');
  refuses(() => appendJournalPhase(file, 'ACTIVATING'), 'unsafe-file');
});

test('a malformed phase name or payload is refused before the journal is created', t => {
  const root = sandbox(t), file = path.join(root, 'journal');
  for (const phase of ['snapshotted', '', 'A B', 'X', 'NINE;DROP', undefined]) refuses(() => appendJournalPhase(file, phase), 'invalid-journal-phase');
  refuses(() => appendJournalPhase(file, 'ACTIVE', [1]), 'invalid-journal-data');
  refuses(() => appendJournalPhase(file, 'ACTIVE', null), 'invalid-journal-data');
  assert.deepEqual(fs.readdirSync(root), []);
});
