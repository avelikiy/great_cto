/** Managed activation of the Claude Code plugin from an admitted snapshot (ADR-050, slice 1).
 *
 * One journalled transaction owns four targets: the immutable cache version directory, the host
 * plugin registry, the host settings, and the local directory-marketplace entry. Every host file
 * is snapshotted before it is touched, replaced by compare-and-swap, and restored only while it
 * still equals what this transaction wrote.
 *
 * Deliberately NOT done here (slice 1): `~/.claude/agents` and `~/.claude/commands` are not
 * synced and therefore not rolled back; `known_marketplaces.json` is never written.
 *
 * This module imports node built-ins and sibling release modules only, so the code that decides
 * what may be activated always comes from the npm installation, never from the plugin cache.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getAdmissionInfo, getAdmittedArtifact, inspectPluginPayload } from './release-trust.mjs';
import { assertNoFetchingRuntime } from './plugin-runtime-boundary.mjs';
import {
  UUID, hash, within, fail, canonicalDirectory, syncDirectory, writeRecord, readRecord, outcome,
  privateInstallationState, releaseLock, snapshotFile, compareAndSwapFile, restoreFileIfOurs,
  appendJournalPhase, readJournal,
} from './release-transaction.mjs';

export const PLUGIN_NAME = 'great_cto';
export const PLUGIN_MARKETPLACE = 'local';
export const PLUGIN_KEY = `${PLUGIN_NAME}@${PLUGIN_MARKETPLACE}`;

const STABLE = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const HOST_FILES = ['registry', 'settings', 'marketplace'];
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const render = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

/** Where a plugin activation writes, for one Claude configuration directory and one version. */
export function pluginActivationTargets(claudeDir, version) {
  if (typeof claudeDir !== 'string' || !path.isAbsolute(claudeDir)) fail('absolute-claude-directory-required');
  if (!STABLE.test(version)) fail('stable-version-required');
  const root = path.resolve(claudeDir), plugins = path.join(root, 'plugins');
  const cacheRoot = path.join(plugins, 'cache', PLUGIN_MARKETPLACE, PLUGIN_NAME);
  return {
    claudeDir: root, cacheRoot, versionDir: path.join(cacheRoot, version),
    registry: path.join(plugins, 'installed_plugins.json'),
    settings: path.join(root, 'settings.json'),
    marketplace: path.join(plugins, 'marketplaces', PLUGIN_MARKETPLACE, '.claude-plugin', 'marketplace.json'),
  };
}

// ---------------------------------------------------------------------------
// Pure transforms. Each takes the current bytes (null when the file is absent) and returns the
// bytes to write, or `changed: false` when the file already says what we want. A file that cannot
// be understood is refused by name: a host file we cannot parse is never treated as empty.
// ---------------------------------------------------------------------------

function parseHostJson(bytes, label) {
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail(`${label}-unparseable`); }
  if (!isObject(value)) fail(`${label}-not-an-object`);
  return value;
}

export function nextRegistryBytes(current, { installPath, version, inventoryDigest, now = new Date() }) {
  if (!SHA256.test(inventoryDigest)) fail('invalid-inventory-digest');
  const data = current === null ? { version: 2, plugins: {} } : parseHostJson(current, 'registry');
  if (data.version !== 2 || !isObject(data.plugins)) fail('registry-schema-unsupported');
  const entries = data.plugins[PLUGIN_KEY] ?? [];
  if (!Array.isArray(entries)) fail('registry-entry-invalid');
  const users = entries.filter(entry => entry?.scope === 'user');
  if (users.length > 1) fail('registry-multiple-user-entries');
  const existing = users[0];
  if (existing?.installPath === installPath && existing.version === version && existing.localContentSha256 === inventoryDigest && existing.gitCommitSha === undefined) {
    return { bytes: current, changed: false };
  }
  const stamp = now.toISOString();
  const next = { ...existing, scope: 'user', installPath, version, installedAt: existing?.installedAt || stamp, lastUpdated: stamp, localContentSha256: inventoryDigest };
  // An admitted snapshot is identified by its inventory, not by a git commit it was never cloned from.
  delete next.gitCommitSha;
  data.plugins[PLUGIN_KEY] = [...entries.filter(entry => entry?.scope !== 'user'), next];
  return { bytes: render(data), changed: true };
}

export function nextSettingsBytes(current) {
  const data = current === null || !current.toString('utf8').trim() ? {} : parseHostJson(current, 'settings');
  if (data.enabledPlugins !== undefined && !isObject(data.enabledPlugins)) fail('settings-enabled-plugins-invalid');
  if (data.enabledPlugins?.[PLUGIN_KEY] === true) return { bytes: current, changed: false };
  data.enabledPlugins = { ...(data.enabledPlugins ?? {}), [PLUGIN_KEY]: true };
  return { bytes: render(data), changed: true };
}

export function nextMarketplaceBytes(current, { sourceDir, version }) {
  const data = current === null ? { name: PLUGIN_MARKETPLACE, owner: { name: 'Local', email: '' }, plugins: [] } : parseHostJson(current, 'marketplace');
  if (!Array.isArray(data.plugins)) fail('marketplace-plugins-invalid');
  const matches = data.plugins.filter(entry => entry?.name === PLUGIN_NAME);
  if (matches.length > 1) fail('marketplace-duplicate-entry');
  const existing = matches[0];
  if (existing && existing.source === sourceDir && existing.version === version) return { bytes: current, changed: false };
  const next = { strict: false, ...existing, name: PLUGIN_NAME, source: sourceDir, version };
  data.plugins = existing ? data.plugins.map(entry => entry === existing ? next : entry) : [...data.plugins, next];
  return { bytes: render(data), changed: true };
}

/** Keys under which the same plugin is registered from another marketplace: bytes this
 * activation does not control. Reported to the user, never modified. */
export function otherRegistrations(registryBytes) {
  if (registryBytes === null) return [];
  const data = parseHostJson(registryBytes, 'registry');
  if (!isObject(data.plugins)) fail('registry-schema-unsupported');
  return Object.keys(data.plugins).filter(key => key.startsWith(PLUGIN_NAME + '@') && key !== PLUGIN_KEY).sort()
    .map(key => ({ key, installPaths: (Array.isArray(data.plugins[key]) ? data.plugins[key] : []).map(entry => entry?.installPath).filter(value => typeof value === 'string') }));
}

// ---------------------------------------------------------------------------
// Cache publication.
// ---------------------------------------------------------------------------

/** Sorted `{path,size,sha256,mode}` of a directory tree; refuses anything that is not a plain file or directory. */
export function directoryInventory(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), rel = prefix ? `${prefix}/${name}` : name, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) fail('cache-entry-symlink-refused');
      if (stat.isDirectory()) { walk(file, rel); continue; }
      if (!stat.isFile()) fail('cache-entry-not-regular');
      const bytes = fs.readFileSync(file);
      out.push({ path: rel, size: bytes.length, sha256: hash(bytes), mode: stat.mode & 0o777 });
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

const admittedInventory = files => files.map(file => ({ path: file.path, size: file.bytes.length, sha256: hash(file.bytes), mode: file.mode }))
  .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sameInventory = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  return canonicalDirectory(dir);
}

/** `created` when this call published the directory, `false` when an identical one was already there. */
function publishCache(targets, files) {
  const wanted = admittedInventory(files);
  if (fs.existsSync(targets.versionDir)) {
    canonicalDirectory(targets.versionDir);
    // Equal bytes are the same publication; anything else is someone else's directory under our name.
    if (!sameInventory(directoryInventory(targets.versionDir), wanted)) fail('cache-version-conflict');
    return { created: false };
  }
  const cacheRoot = ensureDirectory(targets.cacheRoot), stage = path.join(cacheRoot, '.stage-' + randomUUID());
  fs.mkdirSync(stage, { mode: 0o700 });
  try {
    for (const file of files) {
      const out = path.join(stage, ...file.path.split('/'));
      if (!within(stage, out)) fail('cache-member-outside-stage');
      fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o755 });
      const fd = fs.openSync(out, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, file.bytes); fs.fchmodSync(fd, file.mode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    // What is on disk, not what we meant to write, is what gets compared to the admitted inventory.
    if (!sameInventory(directoryInventory(stage), wanted)) fail('staged-cache-inventory-mismatch');
    fs.chmodSync(stage, 0o755);
    try { fs.renameSync(stage, targets.versionDir); }
    catch (error) { if (['EEXIST', 'ENOTEMPTY'].includes(error.code)) fail('cache-version-appeared-concurrently'); throw error; }
    syncDirectory(cacheRoot);
    return { created: true };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// Transaction.
// ---------------------------------------------------------------------------

/** A fixture ticket may only ever touch a throwaway tree under the system temp directory. */
function syntheticMode(testing, info, targets, stateRoot) {
  if (!testing) { if (!info.isProduction) fail('production-artifact-admission-required'); return false; }
  if (info.isProduction) fail('synthetic-adapter-cannot-activate-production-ticket');
  const temp = fs.realpathSync(os.tmpdir());
  if (!within(temp, targets.claudeDir) || !within(temp, path.resolve(stateRoot))) fail('synthetic-fixture-outside-temp');
  return true;
}

function defaultSmoke({ versionDir, version }) {
  const run = args => execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', GREAT_CTO_NO_BOARD: '1', GREAT_CTO_QUIET_POSTINSTALL: '1' } });
  if (run([path.join(versionDir, 'packages', 'cli', 'index.mjs'), '--version']).trim() !== version) fail('smoke-version-mismatch');
  // The import the pre-ADR-045 installer shipped broken: a clone has no built CLI for it to resolve.
  const gatePlan = path.join(versionDir, 'scripts', 'lib', 'gate-plan.mjs');
  if (fs.existsSync(gatePlan)) run(['--input-type=module', '-e', `await import(${JSON.stringify('file://' + gatePlan)})`]);
}

const pointerPath = state => state.journalPath;
const transactionDir = (state, id) => path.join(state.dir, 'transactions', id);

/**
 * Undo our writes, newest first. `written` names the files whose write was journalled. A file that
 * was planned but has no such entry may or may not have been replaced (the process can die between
 * the rename and the journal line): if it holds our bytes it is restored, and if it holds neither
 * our bytes nor the snapshot then nothing of ours is in it and it is left alone. A file we did
 * write that no longer holds our bytes was changed by the host afterwards: that is never undone.
 */
function restoreHostFiles(targets, plan, written) {
  const results = {};
  for (const name of [...HOST_FILES].reverse()) {
    const step = plan[name];
    if (!step.changed) { results[name] = { state: 'ALREADY_RESTORED' }; continue; }
    const result = restoreFileIfOurs(targets[name], { ourDigest: step.plannedSha256, snapshot: step.snapshot });
    const notOurs = result.state === 'RECOVERY_REQUIRED' && !written.has(name) && ['target-changed-since-write', 'target-removed-since-write'].includes(result.reason);
    results[name] = notOurs ? { state: 'NOT_WRITTEN' } : result;
  }
  return results;
}
const allRestored = results => Object.values(results).every(result => result.state !== 'RECOVERY_REQUIRED');

function readHost(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw Object.assign(error, { activationReason: 'host-file-unreadable' }); }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('host-file-not-regular');
  return fs.readFileSync(file);
}

/**
 * Activate an admitted plugin snapshot for one Claude configuration directory.
 *
 * Returns an outcome: SMOKE_PASSED, ALREADY_ACTIVE (zero writes), REFUSED (nothing written),
 * ROLLED_BACK (host files restored; the published cache directory is kept), or RECOVERY_REQUIRED.
 * `options.testing` marks a fixture run; `options.onPhase` observes durable boundaries.
 * @param {unknown} admission
 * @param {{ claudeDir?: string, stateRoot?: string, now?: Date, smoke?: (published: { versionDir: string, version: string }) => void, testing?: boolean, onPhase?: (phase: string) => void }} [options]
 */
export function activatePluginRelease(admission, { claudeDir, stateRoot, now = new Date(), smoke = defaultSmoke, testing = false, onPhase } = {}) {
  let state, context = {}, plan, targets, journal, activating = false;
  const written = new Set();
  const phase = (name, data) => { appendJournalPhase(journal, name, data); onPhase?.(name); };
  try {
    const info = getAdmissionInfo(admission);
    targets = pluginActivationTargets(claudeDir, info.version);
    if (typeof stateRoot !== 'string' || !path.isAbsolute(stateRoot)) fail('absolute-state-root-required');
    const synthetic = syntheticMode(testing, info, targets, stateRoot);
    context = { synthetic, version: info.version };
    canonicalDirectory(targets.claudeDir);

    // One lock per configuration directory, whatever the version: two versions share the host files.
    state = privateInstallationState(path.join(stateRoot, 'plugin'), targets.cacheRoot);
    context.installationId = state.installationId;
    if (fs.existsSync(pointerPath(state))) {
      const pending = readRecord(pointerPath(state));
      if (pending.state !== 'COMPLETE') fail('recovery-required-before-activation');
    }
    const inventoryDigest = getAdmittedArtifact(admission, 'inventory').sha256;
    if (fs.existsSync(state.watermarkPath)) {
      const watermark = readRecord(state.watermarkPath);
      if (watermark.schema !== 1 || !STABLE.test(watermark.version) || !SHA256.test(watermark.digest || '')) fail('invalid-admission-watermark');
      if (!!watermark.synthetic !== synthetic) fail('watermark-authority-mismatch');
      if (compare(info.version, watermark.version) < 0) fail('candidate-below-watermark');
      if (info.version === watermark.version && watermark.digest !== inventoryDigest) fail('same-version-content-conflict');
    }

    // Re-admit: nothing checked before the lock is trusted after it.
    const payload = inspectPluginPayload(admission);
    // A signature covers the snapshot's bytes, not what it downloads when the host starts it. This
    // activation is for Claude Code, so only Claude's manifest decides: a Codex-only `npx` does not.
    const externalRuntime = assertNoFetchingRuntime(payload.files, { host: 'claude' });
    const current = Object.fromEntries(HOST_FILES.map(name => [name, readHost(targets[name])]));
    const next = {
      registry: nextRegistryBytes(current.registry, { installPath: targets.versionDir, version: info.version, inventoryDigest, now }),
      settings: nextSettingsBytes(current.settings),
      marketplace: nextMarketplaceBytes(current.marketplace, { sourceDir: targets.versionDir, version: info.version }),
    };
    const published = fs.existsSync(targets.versionDir) && sameInventory(directoryInventory(targets.versionDir), admittedInventory(payload.files));
    if (published && HOST_FILES.every(name => !next[name].changed)) return { ...outcome('ALREADY_ACTIVE', context), versionDir: targets.versionDir, inventoryDigest, externalRuntime };

    const transactionId = randomUUID(), dir = transactionDir(state, transactionId);
    context.transactionId = transactionId;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    canonicalDirectory(dir, { privateMode: true });
    journal = path.join(dir, 'journal.jsonl');
    for (const name of ['registry', 'marketplace']) ensureDirectory(path.dirname(targets[name]));
    plan = Object.fromEntries(HOST_FILES.map(name => [name, {
      changed: next[name].changed, snapshot: snapshotFile(targets[name], dir),
      plannedSha256: next[name].changed ? hash(next[name].bytes) : null,
    }]));
    // A host write between the read above and this snapshot must not be planned over.
    for (const name of HOST_FILES) if ((plan[name].snapshot.sha256 ?? null) !== (current[name] === null ? null : hash(current[name]))) fail('host-file-changed-before-snapshot');
    writeRecord(pointerPath(state), { schema: 1, transactionId, version: info.version, claudeDir: targets.claudeDir, synthetic, state: 'IN_FLIGHT' });
    // The planned digests are journalled BEFORE any host write, so recovery can recognise our own
    // bytes even when the process dies between a write and the next journal entry.
    phase('SNAPSHOTTED', { version: info.version, inventoryDigest, plan });

    const cache = publishCache(targets, payload.files);
    phase('PUBLISHED', { created: cache.created });

    activating = true;
    phase('ACTIVATING');
    for (const name of HOST_FILES) {
      if (!plan[name].changed) continue;
      const snapshot = plan[name].snapshot;
      compareAndSwapFile(targets[name], snapshot.state === 'absent'
        ? { expectAbsent: true, nextBytes: next[name].bytes, mode: 0o600 }
        : { expectDigest: snapshot.sha256, nextBytes: next[name].bytes });
      written.add(name);
      phase(name.toUpperCase() + '_WRITTEN');
    }
    phase('ACTIVE');

    smoke({ versionDir: targets.versionDir, version: info.version });
    phase('SMOKE_PASSED');
    writeRecord(state.watermarkPath, { schema: 1, version: info.version, digest: inventoryDigest, synthetic });
    writeRecord(pointerPath(state), { schema: 1, transactionId, version: info.version, claudeDir: targets.claudeDir, synthetic, state: 'COMPLETE' });
    return { ...outcome('SMOKE_PASSED', context), versionDir: targets.versionDir, inventoryDigest, managedSync: 'NOT_PERFORMED', externalRuntime };
  } catch (error) {
    const reason = error?.activationReason || error?.reason || 'activation-failed';
    if (!activating) {
      // Nothing on the host changed. A published cache directory is inert and content-addressed.
      if (state && journal) { try { writeRecord(pointerPath(state), { schema: 1, transactionId: context.transactionId, version: context.version, claudeDir: targets.claudeDir, synthetic: !!context.synthetic, state: 'COMPLETE' }); } catch { return outcome('RECOVERY_REQUIRED', context, reason); } }
      return { ...outcome('REFUSED', context, reason), detail: error?.message };
    }
    const results = restoreHostFiles(targets, plan, written);
    if (!allRestored(results)) return { ...outcome('RECOVERY_REQUIRED', context, reason), detail: error?.message, restore: results };
    try {
      appendJournalPhase(journal, 'ROLLED_BACK', { reason });
      writeRecord(pointerPath(state), { schema: 1, transactionId: context.transactionId, version: context.version, claudeDir: targets.claudeDir, synthetic: !!context.synthetic, state: 'COMPLETE' });
    } catch { return { ...outcome('RECOVERY_REQUIRED', context, reason), detail: error?.message, restore: results }; }
    return { ...outcome('ROLLED_BACK', context, reason), detail: error?.message };
  } finally { releaseLock(state); }
}

/**
 * Finish what an interrupted activation left behind. Reads the journal, never the admission:
 * recovery restores previous host state and cannot activate anything.
 * @param {{ claudeDir?: string, stateRoot?: string, version?: string }} [options]
 */
export function recoverPluginActivation({ claudeDir, stateRoot, version = '0.0.0' } = {}) {
  let state, context = { recovery: true };
  try {
    const targets = pluginActivationTargets(claudeDir, version);
    if (typeof stateRoot !== 'string' || !path.isAbsolute(stateRoot)) fail('absolute-state-root-required');
    state = privateInstallationState(path.join(stateRoot, 'plugin'), targets.cacheRoot, { recovering: true });
    context.installationId = state.installationId;
    if (!fs.existsSync(pointerPath(state))) return outcome('NOTHING_TO_RECOVER', context);
    const pointer = readRecord(pointerPath(state));
    if (pointer.schema !== 1 || !UUID.test(pointer.transactionId) || pointer.claudeDir !== targets.claudeDir) fail('invalid-recovery-pointer');
    context.transactionId = pointer.transactionId; context.version = pointer.version; context.synthetic = !!pointer.synthetic;
    if (pointer.state === 'COMPLETE') return outcome('NOTHING_TO_RECOVER', context);
    const journal = path.join(transactionDir(state, pointer.transactionId), 'journal.jsonl');
    // A missing or damaged journal throws here: it is never read as "nothing was written".
    const entries = readJournal(journal), phases = entries.map(entry => entry.phase);
    const complete = () => writeRecord(pointerPath(state), { ...pointer, state: 'COMPLETE' });
    if (phases.includes('SMOKE_PASSED')) {
      // Everything was written and checked; only the bookkeeping after it was lost.
      const snapshotted = entries.find(entry => entry.phase === 'SNAPSHOTTED').data;
      writeRecord(state.watermarkPath, { schema: 1, version: snapshotted.version, digest: snapshotted.inventoryDigest, synthetic: !!pointer.synthetic });
      complete();
      return outcome('RECOVERED_ACTIVE', context);
    }
    if (!phases.includes('ACTIVATING')) { complete(); return outcome('ROLLED_BACK', context, 'interrupted-before-host-write'); }
    const plan = entries.find(entry => entry.phase === 'SNAPSHOTTED').data.plan;
    const written = new Set(HOST_FILES.filter(name => phases.includes(name.toUpperCase() + '_WRITTEN')));
    const results = restoreHostFiles(pluginActivationTargets(claudeDir, pointer.version), plan, written);
    if (!allRestored(results)) return { ...outcome('RECOVERY_REQUIRED', context, 'host-file-changed-since-write'), restore: results };
    appendJournalPhase(journal, 'ROLLED_BACK', { reason: 'recovered-after-interruption' });
    complete();
    return outcome('ROLLED_BACK', context, 'recovered-after-interruption');
  } catch (error) {
    return { ...outcome('RECOVERY_REQUIRED', context, error?.activationReason || 'recovery-failed'), detail: error?.message };
  } finally { releaseLock(state); }
}
