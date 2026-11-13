#!/usr/bin/env node
// Registry activation is a separate atomic write; other plugin scopes survive.
//
// Both writers here are compare-and-swap: read -> digest -> stage a private temp file ->
// re-read the original and confirm it is byte-identical -> rename. A host write between the
// first read and the rename is refused, never replaced. A failed read throws; it is never
// treated as an empty file.
//
// This file is copied on its own into the plugin cache and into test fixtures
// (tests/lib/local-install-target.test.mjs), so it may import only node: built-ins and
// ./is-main.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isMainModule } from './is-main.mjs';

const DEFAULT_KEY = 'great_cto@local';
const KEY_RE = /^[A-Za-z0-9._-]{1,100}@[A-Za-z0-9._-]{1,100}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

const sha256 = data => createHash('sha256').update(data).digest('hex');
const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

function assertKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key) || key === '__proto__') {
    throw new Error(`invalid plugin key ${JSON.stringify(String(key))}: expected "name@marketplace"`);
  }
}

/**
 * Read a regular file without following a symlink.
 * Returns null only when the file does not exist; every other failure throws.
 */
function readRegularBytes(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const notRegular = () => new Error(`${label} must be a regular file, not a symlink`);
  if (!stat.isFile() || stat.isSymbolicLink()) throw notRegular();
  let fd;
  try {
    // O_NOFOLLOW closes the window between the lstat above and this open.
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    if (!fs.fstatSync(fd).isFile()) throw notRegular();
    return fs.readFileSync(fd);
  } catch (error) {
    if (error.code === 'ELOOP') throw notRegular();
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function syncDirectory(dir) {
  try {
    const fd = fs.openSync(dir, fs.constants.O_RDONLY);
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch {
    // Directory fsync is unsupported on some platforms. The rename has already happened, so
    // this only narrows a crash window; it must not turn a completed write into a failure.
  }
}

/**
 * Put the original bytes in a transaction directory. An existing file there is a snapshot
 * taken earlier in the same transaction and must equal what we just read.
 */
function snapshotInto(backupDir, file, original) {
  const backup = path.join(backupDir, path.basename(file));
  const existing = readRegularBytes(backup, 'transaction snapshot');
  if (existing !== null) {
    if (!existing.equals(original)) {
      throw new Error(`${file} no longer matches the transaction snapshot ${backup}; retry after the host update`);
    }
    return { backup, created: false };
  }
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
  return { backup, created: true };
}

function loadRegistry(registry, key) {
  const bytes = readRegularBytes(registry, 'registry');
  if (bytes === null) throw Object.assign(new Error(`registry not found: ${registry}`), { code: 'ENOENT' });
  let data;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`registry ${registry} is not valid JSON (${error.message})`);
  }
  if (!isPlainObject(data) || data.version !== 2 || !isPlainObject(data.plugins)) {
    throw new Error('unsupported registry schema; use Claude plugin install first');
  }
  if (data.plugins[key] != null && !Array.isArray(data.plugins[key])) {
    throw new Error(`invalid registry entries for ${key}`);
  }
  return { data, bytes };
}

export function readInstallRegistry(registry, key = DEFAULT_KEY) {
  assertKey(key);
  return loadRegistry(registry, key).data;
}

/**
 * Register a published version directory in installed_plugins.json.
 *
 * Defaults are unchanged: the receipt is `<dest>/.great-cto-local-install.json` (git commit +
 * content digest), the key is `great_cto@local`, and the backup is a uniquely named `.bak`
 * beside the registry. Options:
 *   key             plugin key, `name@marketplace`
 *   inventoryDigest an admitted inventory digest (64 hex) used as the receipt instead of a
 *                   git commit; no receipt file is read and no gitCommitSha is recorded
 *   backupDir       transaction directory; the backup goes to `<backupDir>/<basename>`
 *                   instead of beside the registry. An existing file there is a snapshot and
 *                   must equal the registry.
 *   onPhase         called with 'read', 'staged', 'renamed'
 * Returns { state: 'unchanged'|'registered', previousDigest, [writtenDigest, backup] }.
 */
export function registerLocalPlugin({ registry, dest, version, key = DEFAULT_KEY, inventoryDigest, backupDir, onPhase }) {
  assertKey(key);
  let identity;
  if (inventoryDigest !== undefined) {
    if (typeof inventoryDigest !== 'string' || !SHA256_RE.test(inventoryDigest)) {
      throw new Error('inventory digest must be 64 lowercase hex characters');
    }
    identity = { contentSha256: inventoryDigest };
  } else {
    // Receipt identifies the snapshot, but is not a security approving receipt.
    const receipt = JSON.parse(fs.readFileSync(`${dest}/.great-cto-local-install.json`, 'utf8'));
    if (!/^[a-f0-9]{40,64}$/.test(receipt.commit) || !SHA256_RE.test(receipt.contentSha256)) {
      throw new Error('missing local snapshot identity');
    }
    identity = { commit: receipt.commit, contentSha256: receipt.contentSha256 };
  }
  const lock = `${registry}.great-cto-lock`;
  fs.mkdirSync(lock, { mode: 0o700 });
  let temp;
  let backup;
  let createdBackup = false;
  let renamed = false;
  try {
    const { data, bytes: original } = loadRegistry(registry, key);
    const previousDigest = sha256(original);
    onPhase?.('read');
    const entries = data.plugins[key] || [];
    const users = entries.filter(e => e?.scope === 'user');
    if (users.length > 1) throw new Error('multiple user registrations need manual reconciliation');
    const current = users[0];
    if (current?.installPath === dest && current.version === version
      && current.localContentSha256 === identity.contentSha256
      && (identity.commit ? current.gitCommitSha === identity.commit : current.gitCommitSha === undefined)) {
      return { state: 'unchanged', previousDigest };
    }
    const now = new Date().toISOString();
    const next = { ...current, scope: 'user', installPath: dest, version,
      installedAt: current?.installedAt || now, lastUpdated: now };
    if (identity.commit) next.gitCommitSha = identity.commit; else delete next.gitCommitSha;
    next.localContentSha256 = identity.contentSha256;
    data.plugins[key] = [...entries.filter(e => e?.scope !== 'user'), next];
    const text = JSON.stringify(data, null, 2) + '\n';

    if (backupDir) ({ backup, created: createdBackup } = snapshotInto(backupDir, registry, original));
    temp = `${registry}.great-cto-${randomUUID()}.tmp`;
    fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
    if (JSON.parse(fs.readFileSync(temp, 'utf8')).plugins[key].find(e => e.scope === 'user')?.installPath !== dest) {
      throw new Error('staged registry readback mismatch');
    }
    if (!backupDir) {
      // A unique backup preserves the previous selection; no rolling overwrite.
      backup = `${registry}.great-cto-${randomUUID()}.bak`;
      fs.copyFileSync(registry, backup, fs.constants.COPYFILE_EXCL);
      createdBackup = true;
      fs.chmodSync(backup, 0o600);
    }
    onPhase?.('staged');
    // Refuse a concurrent host update instead of replacing its new registry.
    const again = readRegularBytes(registry, 'registry');
    if (again === null || !again.equals(original) || !fs.readFileSync(backup).equals(original)) {
      throw new Error('registry changed concurrently; retry after the host update');
    }
    fs.renameSync(temp, registry);
    renamed = true;
    temp = null;
    syncDirectory(path.dirname(registry));
    if (loadRegistry(registry, key).data.plugins[key].find(e => e.scope === 'user')?.installPath !== dest) {
      throw new Error(`registry readback failed; recovery backup: ${backup}`);
    }
    onPhase?.('renamed');
    return { state: 'registered', backup, previousDigest, writtenDigest: sha256(text) };
  } catch (error) {
    // A backup this call made is only worth keeping once it guards a write that happened.
    if (createdBackup && !renamed) fs.rmSync(backup, { force: true });
    throw error;
  } finally {
    if (temp) fs.rmSync(temp, { force: true });
    fs.rmdirSync(lock);
  }
}

// ── local directory marketplace ────────────────────────────────────────────────────────

const DEFAULT_STYLE = { indent: '  ', eol: '\n', trailingNewline: true };

/** Reproduce the file's own indentation, line endings and trailing newline. */
function detectStyle(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = raw.endsWith('\n');
  if (!raw.trim().includes('\n')) return { indent: '', eol, trailingNewline };
  const indented = /^([ \t]+)"/m.exec(raw);
  return { indent: indented ? indented[1].slice(0, 10) : DEFAULT_STYLE.indent, eol, trailingNewline };
}

function render(value, style) {
  let out = JSON.stringify(value, null, style.indent);
  if (style.eol !== '\n') out = out.replace(/\n/g, style.eol);
  return style.trailingNewline ? out + style.eol : out;
}

/**
 * Point the local directory marketplace's plugin entry at a published version directory.
 *
 * Only that one entry's `source` (and `version`, when given) changes; every other entry and
 * key keeps its value, order and, for a canonically formatted file, its exact bytes.
 * `create: true` is the explicit request that permits creating an absent file or adding a
 * missing entry; without it both throw. A file that cannot be parsed, is not a marketplace,
 * is a symlink, or lists the plugin twice is refused untouched.
 *
 * Options: marketplace (file path), sourceDir (absolute, normalised), version, plugin
 * (default 'great_cto'), create, backupDir (as for registerLocalPlugin), onPhase.
 * Returns { state: 'unchanged'|'updated'|'created', previousDigest, [writtenDigest, backup,
 * reformatted] }; `reformatted` is true when the existing file's whitespace was normalised.
 */
export function pointLocalMarketplace({ marketplace, sourceDir, version, plugin = 'great_cto', create = false, backupDir, onPhase } = {}) {
  if (typeof sourceDir !== 'string' || !path.isAbsolute(sourceDir) || sourceDir.includes('\0')
    || path.resolve(sourceDir) !== sourceDir) {
    throw new Error('marketplace source must be an absolute, normalised directory path');
  }
  if (typeof plugin !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(plugin)) {
    throw new Error('invalid marketplace plugin name');
  }
  if (version !== undefined && (typeof version !== 'string' || !/^[0-9A-Za-z.+-]{1,64}$/.test(version))) {
    throw new Error('invalid marketplace plugin version');
  }

  const original = readRegularBytes(marketplace, 'local marketplace file');
  onPhase?.('read');
  const previousDigest = original ? sha256(original) : null;

  let doc;
  let style = DEFAULT_STYLE;
  let reformatted = false;
  if (original === null) {
    if (!create) {
      throw new Error(`local marketplace file ${marketplace} does not exist; pass create: true to create it`);
    }
    doc = { name: 'local', owner: { name: 'local' }, plugins: [] };
  } else {
    const raw = original.toString('utf8');
    try {
      doc = JSON.parse(raw);
    } catch {
      throw new Error(`local marketplace file ${marketplace} is not valid JSON; great_cto did not change it`);
    }
    if (!isPlainObject(doc) || !Array.isArray(doc.plugins)) {
      throw new Error(`local marketplace file ${marketplace} is not a marketplace (expected an object with a plugins list); great_cto did not change it`);
    }
    style = detectStyle(raw);
    reformatted = render(doc, style) !== raw;
  }

  const matches = doc.plugins.filter(entry => isPlainObject(entry) && entry.name === plugin);
  if (matches.length > 1) {
    throw new Error(`local marketplace file ${marketplace} lists ${plugin} more than once; reconcile it by hand`);
  }
  let entry = matches[0];
  if (!entry) {
    if (!create) {
      throw new Error(`local marketplace file ${marketplace} has no ${plugin} entry; pass create: true to add one`);
    }
    entry = { name: plugin };
    doc.plugins.push(entry);
  } else if (entry.source === sourceDir && (version === undefined || entry.version === version)) {
    return { state: 'unchanged', previousDigest };
  }
  entry.source = sourceDir;
  if (version !== undefined) entry.version = version;
  const text = render(doc, style);

  let backup = null;
  let createdBackup = false;
  let renamed = false;
  let temp;
  try {
    if (original && backupDir) ({ backup, created: createdBackup } = snapshotInto(backupDir, marketplace, original));
    fs.mkdirSync(path.dirname(marketplace), { recursive: true });
    temp = `${marketplace}.great-cto-${randomUUID()}.tmp`;
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    onPhase?.('staged');
    const staged = JSON.parse(fs.readFileSync(temp, 'utf8')).plugins.find(e => e?.name === plugin);
    if (staged?.source !== sourceDir) throw new Error('staged marketplace readback mismatch');

    // The compare in compare-and-swap: the original must be exactly what we built from.
    const again = readRegularBytes(marketplace, 'local marketplace file');
    if ((again ? sha256(again) : null) !== previousDigest) {
      throw new Error(`local marketplace file ${marketplace} changed concurrently; retry after the host update`);
    }
    fs.renameSync(temp, marketplace);
    renamed = true;
    syncDirectory(path.dirname(marketplace));
  } catch (error) {
    if (createdBackup && !renamed) fs.rmSync(backup, { force: true });
    throw error;
  } finally {
    if (temp) fs.rmSync(temp, { force: true });
  }
  onPhase?.('renamed');
  return { state: original === null ? 'created' : 'updated', previousDigest, writtenDigest: sha256(text), backup, reformatted };
}

if (isMainModule(import.meta.url)) {
  try {
    const [registry, dest, version] = process.argv.slice(2);
    const result = process.argv.includes('--check') ? readInstallRegistry(registry) : registerLocalPlugin({ registry, dest, version });
    process.stdout.write(JSON.stringify(process.argv.includes('--check') ? { state: 'readable' } : result) + '\n');
  } catch (error) {
    process.stderr.write(`local registration refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
