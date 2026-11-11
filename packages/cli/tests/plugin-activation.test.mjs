/**
 * Managed plugin activation (ADR-050 decision 4, slice 1): the transaction that publishes the
 * cache directory and swaps the host registry, settings and local marketplace entry.
 *
 * Every run uses a fixture ticket and a throwaway Claude directory under the system temp
 * directory; the adapter itself refuses a fixture ticket anywhere else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PLUGIN_KEY, activatePluginRelease, recoverPluginActivation, pluginActivationTargets,
  nextRegistryBytes, nextSettingsBytes, nextMarketplaceBytes, directoryInventory,
} from '../src/plugin-activation.mjs';
import { writeEmbeddedSet, admitFixture, tempBase, digest, pluginFiles } from './helpers/embedded-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(HERE, 'helpers', 'plugin-activation-child.mjs');
const D = 'd'.repeat(64);

function machine(t, { version = '3.72.0', files } = {}) {
  const base = tempBase(t), claudeDir = path.join(base, 'claude'), stateRoot = path.join(base, 'state');
  fs.mkdirSync(claudeDir, { mode: 0o755 }); fs.mkdirSync(stateRoot, { mode: 0o700 });
  const set = writeEmbeddedSet(base, { version, files });
  const targets = pluginActivationTargets(claudeDir, version);
  const run = (over = {}) => activatePluginRelease(admitFixture(set), { claudeDir, stateRoot, testing: true, smoke: () => {}, ...over });
  return { base, claudeDir, stateRoot, set, targets, run };
}
const read = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const hostState = targets => Object.fromEntries(['registry', 'settings', 'marketplace'].map(name => [name, read(targets[name])?.toString('utf8') ?? null]));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function seedHost(m) {
  fs.mkdirSync(path.dirname(m.targets.registry), { recursive: true });
  fs.mkdirSync(path.dirname(m.targets.marketplace), { recursive: true });
  fs.writeFileSync(m.targets.registry, JSON.stringify({ version: 2, plugins: { 'other@market': [{ scope: 'user', installPath: '/x', version: '1.0.0' }] } }, null, 2) + '\n');
  fs.writeFileSync(m.targets.settings, JSON.stringify({ theme: 'dark', enabledPlugins: { 'other@market': true } }, null, 2) + '\n');
  fs.writeFileSync(m.targets.marketplace, JSON.stringify({ name: 'local', owner: { name: 'Local', email: '' }, plugins: [{ name: 'other', source: '/y', version: '1.0.0', strict: false }] }, null, 2) + '\n');
}

// ── transforms ──────────────────────────────────────────────────────────────

test('registry transform: adds our entry, keeps every other plugin, drops a git commit it was never cloned from', () => {
  const before = Buffer.from(JSON.stringify({ version: 2, plugins: { 'a@b': [{ scope: 'user', installPath: '/a' }], [PLUGIN_KEY]: [{ scope: 'user', installPath: '/old', version: '1.0.0', installedAt: 'T0', gitCommitSha: 'c'.repeat(40) }] } }));
  const out = nextRegistryBytes(before, { installPath: '/new', version: '2.0.0', inventoryDigest: D, now: new Date('2026-11-10T00:00:00Z') });
  const data = JSON.parse(out.bytes);
  assert.equal(out.changed, true);
  assert.deepEqual(data.plugins['a@b'], [{ scope: 'user', installPath: '/a' }]);
  assert.deepEqual(data.plugins[PLUGIN_KEY], [{ scope: 'user', installPath: '/new', version: '2.0.0', installedAt: 'T0', lastUpdated: '2026-11-10T00:00:00.000Z', localContentSha256: D }]);
  assert.equal(nextRegistryBytes(out.bytes, { installPath: '/new', version: '2.0.0', inventoryDigest: D }).changed, false);
});

test('registry transform: a file it cannot understand is refused, never treated as empty', () => {
  const reason = fn => { try { fn(); } catch (e) { return e.activationReason; } return 'no-refusal'; };
  const opts = { installPath: '/n', version: '2.0.0', inventoryDigest: D };
  assert.equal(reason(() => nextRegistryBytes(Buffer.from('{'), opts)), 'registry-unparseable');
  assert.equal(reason(() => nextRegistryBytes(Buffer.from('[]'), opts)), 'registry-not-an-object');
  assert.equal(reason(() => nextRegistryBytes(Buffer.from('{"version":1,"plugins":{}}'), opts)), 'registry-schema-unsupported');
  assert.equal(reason(() => nextRegistryBytes(Buffer.from(JSON.stringify({ version: 2, plugins: { [PLUGIN_KEY]: [{ scope: 'user' }, { scope: 'user' }] } })), opts)), 'registry-multiple-user-entries');
  assert.equal(reason(() => nextRegistryBytes(null, { ...opts, inventoryDigest: 'x' })), 'invalid-inventory-digest');
});

test('settings transform: one key added, everything else kept; garbage refused', () => {
  const out = nextSettingsBytes(Buffer.from('{"theme":"dark","enabledPlugins":{"a@b":false}}'));
  assert.deepEqual(JSON.parse(out.bytes), { theme: 'dark', enabledPlugins: { 'a@b': false, [PLUGIN_KEY]: true } });
  assert.equal(nextSettingsBytes(out.bytes).changed, false);
  assert.deepEqual(JSON.parse(nextSettingsBytes(null).bytes), { enabledPlugins: { [PLUGIN_KEY]: true } });
  assert.throws(() => nextSettingsBytes(Buffer.from('not json')), e => e.activationReason === 'settings-unparseable');
  assert.throws(() => nextSettingsBytes(Buffer.from('{"enabledPlugins":[]}')), e => e.activationReason === 'settings-enabled-plugins-invalid');
});

test('marketplace transform: only our entry changes; a duplicate entry is refused', () => {
  const before = Buffer.from(JSON.stringify({ name: 'local', owner: { name: 'Local' }, metadata: { x: 1 }, plugins: [{ name: 'other', source: '/y' }, { name: 'great_cto', source: '/old', version: '1.0.0', strict: false, extra: 1 }] }));
  const data = JSON.parse(nextMarketplaceBytes(before, { sourceDir: '/new', version: '2.0.0' }).bytes);
  assert.deepEqual(data.plugins, [{ name: 'other', source: '/y' }, { strict: false, name: 'great_cto', source: '/new', version: '2.0.0', extra: 1 }]);
  assert.deepEqual(data.metadata, { x: 1 });
  assert.throws(() => nextMarketplaceBytes(Buffer.from(JSON.stringify({ plugins: [{ name: 'great_cto' }, { name: 'great_cto' }] })), { sourceDir: '/n', version: '2.0.0' }), e => e.activationReason === 'marketplace-duplicate-entry');
});

// ── the transaction ─────────────────────────────────────────────────────────

test('fresh machine: publishes exactly the admitted bytes and registers them', t => {
  const m = machine(t), result = m.run();
  assert.equal(result.state, 'SIMULATED_SMOKE_PASSED');
  assert.equal(result.authority, 'NONE', 'a fixture ticket never yields activation authority');
  assert.equal(result.managedSync, 'NOT_PERFORMED');
  assert.deepEqual(directoryInventory(m.targets.versionDir), m.set.inventory.files);
  const entry = json(m.targets.registry).plugins[PLUGIN_KEY][0];
  assert.equal(entry.installPath, m.targets.versionDir);
  assert.equal(entry.localContentSha256, m.set.inventoryDigest);
  assert.equal(json(m.targets.settings).enabledPlugins[PLUGIN_KEY], true);
  assert.deepEqual(json(m.targets.marketplace).plugins.map(p => [p.name, p.source]), [['great_cto', m.targets.versionDir]]);
  assert.equal(fs.existsSync(path.join(path.dirname(m.targets.registry), 'known_marketplaces.json')), false, 'never written');
  assert.deepEqual(fs.readdirSync(m.targets.cacheRoot), ['3.72.0'], 'no stage directory left');
});

test('existing host files: other plugins and keys survive byte-for-byte in meaning', t => {
  const m = machine(t); seedHost(m);
  assert.equal(m.run().state, 'SIMULATED_SMOKE_PASSED');
  assert.deepEqual(json(m.targets.registry).plugins['other@market'], [{ scope: 'user', installPath: '/x', version: '1.0.0' }]);
  assert.deepEqual(json(m.targets.settings), { theme: 'dark', enabledPlugins: { 'other@market': true, [PLUGIN_KEY]: true } });
  assert.equal(json(m.targets.marketplace).plugins[0].name, 'other');
});

test('second run is ALREADY_ACTIVE and writes nothing', t => {
  const m = machine(t); m.run();
  const before = hostState(m.targets), mtime = fs.statSync(m.targets.registry).mtimeMs;
  const result = m.run({ smoke: () => { throw new Error('smoke must not run'); } });
  assert.equal(result.state, 'SIMULATED_ALREADY_ACTIVE');
  assert.deepEqual(hostState(m.targets), before);
  assert.equal(fs.statSync(m.targets.registry).mtimeMs, mtime);
});

test('a fixture ticket cannot activate without the testing flag, nor outside the temp directory', t => {
  const m = machine(t);
  const production = activatePluginRelease(admitFixture(m.set), { claudeDir: m.claudeDir, stateRoot: m.stateRoot });
  assert.deepEqual([production.state, production.reason], ['REFUSED', 'production-artifact-admission-required']);
  const outside = activatePluginRelease(admitFixture(m.set), { claudeDir: path.join(path.parse(HERE).root, 'nonexistent-claude-dir'), stateRoot: m.stateRoot, testing: true });
  assert.deepEqual([outside.state, outside.reason], ['REFUSED', 'synthetic-fixture-outside-temp']);
  assert.deepEqual(hostState(m.targets), { registry: null, settings: null, marketplace: null });
  assert.equal(fs.existsSync(m.targets.cacheRoot), false);
});

test('unparseable settings: refused by name before anything is written', t => {
  const m = machine(t); seedHost(m);
  fs.writeFileSync(m.targets.settings, '{ not json');
  const before = hostState(m.targets), result = m.run();
  assert.deepEqual([result.state, result.reason], ['REFUSED', 'settings-unparseable']);
  assert.deepEqual(hostState(m.targets), before);
  assert.equal(fs.existsSync(m.targets.versionDir), false);
  assert.equal(m.run().reason, 'settings-unparseable', 'a refusal leaves no lock and no pending recovery');
});

test('smoke failure rolls every host file back and keeps the inert cache directory', t => {
  const m = machine(t); seedHost(m);
  const before = hostState(m.targets);
  const result = m.run({ smoke: () => { throw Object.assign(new Error('boom'), { activationReason: 'smoke-version-mismatch' }); } });
  assert.deepEqual([result.state, result.reason], ['SIMULATED_ROLLED_BACK', 'smoke-version-mismatch']);
  assert.deepEqual(hostState(m.targets), before);
  assert.equal(fs.existsSync(m.targets.versionDir), true);
  assert.equal(m.run().state, 'SIMULATED_SMOKE_PASSED', 'a rolled-back transaction does not block the next one');
});

test('rollback on a fresh machine removes the files it created', t => {
  const m = machine(t);
  assert.equal(m.run({ smoke: () => { throw new Error('boom'); } }).state, 'SIMULATED_ROLLED_BACK');
  assert.deepEqual(hostState(m.targets), { registry: null, settings: null, marketplace: null });
});

test('a host write that lands mid-transaction is never overwritten', t => {
  const m = machine(t); seedHost(m);
  const beforeRegistry = fs.readFileSync(m.targets.registry, 'utf8');
  const hostEdit = JSON.stringify({ theme: 'light', enabledPlugins: {} });
  const result = m.run({ onPhase: phase => { if (phase === 'ACTIVATING') fs.writeFileSync(m.targets.settings, hostEdit); } });
  assert.deepEqual([result.state, result.reason], ['SIMULATED_ROLLED_BACK', 'target-digest-mismatch']);
  assert.equal(fs.readFileSync(m.targets.settings, 'utf8'), hostEdit, 'the host edit is kept');
  assert.equal(fs.readFileSync(m.targets.registry, 'utf8'), beforeRegistry, 'our own earlier write is undone');
});

test('if the host changes a file we wrote, rollback refuses to touch it and says so', t => {
  const m = machine(t); seedHost(m);
  const hostEdit = JSON.stringify({ version: 2, plugins: { 'host@wrote': [] } });
  const result = m.run({
    onPhase: phase => { if (phase === 'REGISTRY_WRITTEN') fs.writeFileSync(m.targets.registry, hostEdit); },
    smoke: () => { throw new Error('boom'); },
  });
  assert.equal(result.state, 'RECOVERY_REQUIRED');
  assert.equal(result.restore.registry.reason, 'target-changed-since-write');
  assert.equal(fs.readFileSync(m.targets.registry, 'utf8'), hostEdit);
  assert.equal(m.run().reason, 'recovery-required-before-activation', 'the next activation does not paper over it');
});

test('a second activation while one is in flight is refused and writes nothing', t => {
  const m = machine(t);
  let inner;
  const outer = m.run({ onPhase: phase => { if (phase === 'SNAPSHOTTED') inner = m.run(); } });
  assert.deepEqual([inner.state, inner.reason], ['REFUSED', 'installation-busy-lock']);
  assert.equal(outer.state, 'SIMULATED_SMOKE_PASSED');
});

test('a cache directory with other bytes under our version is a conflict, not an update', t => {
  const m = machine(t); m.run();
  fs.rmSync(m.targets.registry);
  fs.writeFileSync(path.join(m.targets.versionDir, 'packages', 'board', 'server.mjs'), '// tampered\n');
  const result = m.run();
  assert.deepEqual([result.state, result.reason], ['REFUSED', 'cache-version-conflict']);
  assert.equal(fs.existsSync(m.targets.registry), false);
});

test('an archive changed after admission is caught by the re-admission under the lock', t => {
  const m = machine(t), ticket = admitFixture(m.set);
  fs.writeFileSync(m.set.archive, Buffer.concat([fs.readFileSync(m.set.archive), Buffer.from([0])]));
  const result = activatePluginRelease(ticket, { claudeDir: m.claudeDir, stateRoot: m.stateRoot, testing: true, smoke: () => {} });
  assert.equal(result.state, 'REFUSED');
  assert.deepEqual(hostState(m.targets), { registry: null, settings: null, marketplace: null });
  assert.equal(fs.existsSync(m.targets.cacheRoot), false);
});

test('an older version than the last activated one is refused', t => {
  const m = machine(t); m.run();
  const older = tempBase(t), set = writeEmbeddedSet(older, { version: '3.71.0' });
  const result = activatePluginRelease(admitFixture(set), { claudeDir: m.claudeDir, stateRoot: m.stateRoot, testing: true, smoke: () => {} });
  assert.deepEqual([result.state, result.reason], ['REFUSED', 'candidate-below-watermark']);
  assert.equal(json(m.targets.registry).plugins[PLUGIN_KEY][0].version, '3.72.0');
});

test('an upgrade repoints all three host files and keeps the previous version directory', t => {
  const m = machine(t); m.run();
  const newer = tempBase(t), set = writeEmbeddedSet(newer, { version: '3.73.0' });
  const result = activatePluginRelease(admitFixture(set), { claudeDir: m.claudeDir, stateRoot: m.stateRoot, testing: true, smoke: () => {} });
  assert.equal(result.state, 'SIMULATED_SMOKE_PASSED');
  const next = pluginActivationTargets(m.claudeDir, '3.73.0');
  assert.equal(json(next.registry).plugins[PLUGIN_KEY][0].installPath, next.versionDir);
  assert.equal(json(next.marketplace).plugins[0].source, next.versionDir);
  assert.deepEqual(fs.readdirSync(next.cacheRoot).sort(), ['3.72.0', '3.73.0']);
});

test('the default smoke runs the published CLI and compares its version', t => {
  const good = machine(t);
  assert.equal(good.run({ smoke: undefined }).state, 'SIMULATED_SMOKE_PASSED');
  const files = pluginFiles('3.72.0').map(f => f.path === 'packages/cli/index.mjs' ? { ...f, bytes: Buffer.from('console.log("9.9.9");\n') } : f);
  const bad = machine(t, { files }), result = bad.run({ smoke: undefined });
  assert.deepEqual([result.state, result.reason], ['SIMULATED_ROLLED_BACK', 'smoke-version-mismatch']);
  assert.deepEqual(hostState(bad.targets), { registry: null, settings: null, marketplace: null });
});

// ── crashes ─────────────────────────────────────────────────────────────────

const crash = (m, at) => spawnSync(process.execPath, [CHILD, m.set.directory, m.set.version, m.set.fingerprint, m.claudeDir, m.stateRoot, at], { encoding: 'utf8' });

for (const at of ['SNAPSHOTTED', 'PUBLISHED', 'ACTIVATING', 'REGISTRY_WRITTEN', 'SETTINGS_WRITTEN', 'MARKETPLACE_WRITTEN', 'ACTIVE']) {
  test(`crash after ${at}: recovery restores the host exactly, then activation works`, t => {
    const m = machine(t); seedHost(m);
    const before = hostState(m.targets);
    assert.equal(crash(m, at).status, 9, 'the child died at the boundary');
    const blocked = m.run();
    assert.deepEqual([blocked.state, blocked.reason], ['REFUSED', 'installation-busy-lock'], 'a dead owner still holds the lock until recovery');
    const recovered = recoverPluginActivation({ claudeDir: m.claudeDir, stateRoot: m.stateRoot });
    assert.equal(recovered.state, 'SIMULATED_ROLLED_BACK', JSON.stringify(recovered));
    assert.deepEqual(hostState(m.targets), before);
    assert.equal(m.run().state, 'SIMULATED_SMOKE_PASSED');
  });
}

test('crash after SMOKE_PASSED: recovery keeps the activation and only finishes the bookkeeping', t => {
  const m = machine(t); seedHost(m);
  assert.equal(crash(m, 'SMOKE_PASSED').status, 9);
  const after = hostState(m.targets);
  const recovered = recoverPluginActivation({ claudeDir: m.claudeDir, stateRoot: m.stateRoot });
  assert.equal(recovered.state, 'RECOVERED_ACTIVE', JSON.stringify(recovered));
  assert.deepEqual(hostState(m.targets), after);
  assert.equal(m.run().state, 'SIMULATED_ALREADY_ACTIVE');
});

test('recovery after a crash refuses to undo a file the host changed meanwhile', t => {
  const m = machine(t); seedHost(m);
  assert.equal(crash(m, 'SETTINGS_WRITTEN').status, 9);
  const hostEdit = JSON.stringify({ theme: 'host' });
  fs.writeFileSync(m.targets.settings, hostEdit);
  const recovered = recoverPluginActivation({ claudeDir: m.claudeDir, stateRoot: m.stateRoot });
  assert.equal(recovered.state, 'RECOVERY_REQUIRED');
  assert.equal(fs.readFileSync(m.targets.settings, 'utf8'), hostEdit);
});

test('recovery with nothing pending says so', t => {
  const m = machine(t);
  assert.equal(recoverPluginActivation({ claudeDir: m.claudeDir, stateRoot: m.stateRoot }).state, 'NOTHING_TO_RECOVER');
});

test('a damaged journal is RECOVERY_REQUIRED, never "nothing was written"', t => {
  const m = machine(t); seedHost(m);
  assert.equal(crash(m, 'REGISTRY_WRITTEN').status, 9);
  const stateDir = path.join(m.stateRoot, 'plugin'), id = fs.readdirSync(stateDir)[0];
  const tx = path.join(stateDir, id, 'transactions'), journal = path.join(tx, fs.readdirSync(tx)[0], 'journal.jsonl');
  fs.writeFileSync(journal, 'garbage\n', { mode: 0o600 });
  const written = fs.readFileSync(m.targets.registry, 'utf8');
  const recovered = recoverPluginActivation({ claudeDir: m.claudeDir, stateRoot: m.stateRoot });
  assert.deepEqual([recovered.state, recovered.reason], ['RECOVERY_REQUIRED', 'journal-corrupt']);
  assert.equal(fs.readFileSync(m.targets.registry, 'utf8'), written);
});

// ── where the deciding code lives ───────────────────────────────────────────

test('the adapter imports node built-ins and sibling release modules only', () => {
  const source = fs.readFileSync(path.join(HERE, '..', 'src', 'plugin-activation.mjs'), 'utf8');
  const specifiers = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1]);
  assert.ok(specifiers.length >= 5);
  for (const s of specifiers) assert.ok(s.startsWith('node:') || /^\.\/release-(trust|transaction)\.mjs$/.test(s), `unexpected import ${s}`);
  assert.equal(/import\(/.test(source.replace(/await import\(\$\{/g, '')), false, 'no dynamic import of a computed path');
  assert.equal(digest(Buffer.from('')).length, 64);
});

test('another marketplace registration of the same plugin is reported, with its paths', async () => {
  const { otherRegistrations } = await import('../src/plugin-activation.mjs');
  const bytes = Buffer.from(JSON.stringify({ version: 2, plugins: { [PLUGIN_KEY]: [{ installPath: '/a' }], 'great_cto@great-cto': [{ installPath: '/b' }], 'great_ctoX@m': [], 'other@local': [] } }));
  assert.deepEqual(otherRegistrations(bytes), [{ key: 'great_cto@great-cto', installPaths: ['/b'] }]);
  assert.deepEqual(otherRegistrations(null), []);
  assert.throws(() => otherRegistrations(Buffer.from('{')), e => e.activationReason === 'registry-unparseable');
});
