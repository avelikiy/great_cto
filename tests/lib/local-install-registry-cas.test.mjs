// Compare-and-swap behaviour of scripts/lib/local-install-registry.mjs
// (ARCH-plugin-activation Q2 steps 7 and 9, ADR-050 decision 4).
//
// Every test builds its own temp tree and passes explicit paths. Nothing here reads or
// writes the real ~/.claude.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  readInstallRegistry, registerLocalPlugin, pointLocalMarketplace,
} from '../../scripts/lib/local-install-registry.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const COMMIT = 'a'.repeat(40);
const CONTENT = 'b'.repeat(64);
const INVENTORY = 'c'.repeat(64);
const VERSION = '3.99.0';

function sandbox(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-install-registry-cas-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'plugins');
  fs.mkdirSync(dir);
  const dest = path.join(root, 'cache', 'local', 'great_cto', VERSION);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, '.great-cto-local-install.json'),
    JSON.stringify({ commit: COMMIT, contentSha256: CONTENT }));
  return {
    root, dir, dest,
    registry: path.join(dir, 'installed_plugins.json'),
    backups: path.join(root, 'txn', 'previous'),
    marketplace: path.join(root, 'marketplaces', 'local', '.claude-plugin', 'marketplace.json'),
  };
}

const text = (data) => JSON.stringify(data, null, 2) + '\n';
const seed = (s, data) => fs.writeFileSync(s.registry, text(data));
const listing = (dir) => fs.readdirSync(dir).sort();
const throwsMessage = (fn, pattern) => assert.throws(fn, (e) => { assert.match(e.message, pattern); return true; });

const OTHERS = {
  'other@market': [{ scope: 'user', installPath: '/x/other', version: '1.0.0', extra: { deep: [1, 2, 3] } }],
  'third@market': [{ scope: 'project', installPath: '/x/third', projectPath: '/p' }],
};

// ── registry: default behaviour is unchanged ───────────────────────────────────────────

test('default registration still backs up beside the registry, mode 0600, git receipt', (t) => {
  const s = sandbox(t);
  const before = { version: 2, plugins: { ...OTHERS } };
  seed(s, before);

  const r = registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION });

  assert.equal(r.state, 'registered');
  assert.match(path.basename(r.backup), /^installed_plugins\.json\.great-cto-[0-9a-f-]{36}\.bak$/);
  assert.equal(path.dirname(r.backup), s.dir);
  assert.equal(fs.readFileSync(r.backup, 'utf8'), text(before));
  assert.equal(fs.statSync(r.backup).mode & 0o777, 0o600);
  assert.equal(fs.statSync(s.registry).mode & 0o777, 0o600);

  const after = JSON.parse(fs.readFileSync(s.registry, 'utf8'));
  const entry = after.plugins['great_cto@local'][0];
  assert.deepEqual(entry, {
    scope: 'user', installPath: s.dest, version: VERSION,
    installedAt: entry.installedAt, lastUpdated: entry.lastUpdated,
    gitCommitSha: COMMIT, localContentSha256: CONTENT,
  });
  assert.deepEqual(after.plugins['other@market'], OTHERS['other@market']);
  assert.deepEqual(after.plugins['third@market'], OTHERS['third@market']);
  assert.deepEqual(listing(s.dir).filter((n) => n.endsWith('.tmp') || n.endsWith('-lock')), []);
});

test('digests reported for the journal match the bytes before and after', (t) => {
  const s = sandbox(t);
  seed(s, { version: 2, plugins: {} });
  const before = fs.readFileSync(s.registry);
  const r = registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION });
  assert.equal(r.previousDigest, sha256(before));
  assert.equal(r.writtenDigest, sha256(fs.readFileSync(s.registry)));
});

test('a second call is unchanged and writes nothing', (t) => {
  const s = sandbox(t);
  seed(s, { version: 2, plugins: {} });
  registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION });
  const bytes = fs.readFileSync(s.registry);
  const mtime = fs.statSync(s.registry).mtimeMs;
  const files = listing(s.dir);

  const r = registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, backupDir: s.backups });

  assert.equal(r.state, 'unchanged');
  assert.equal(r.previousDigest, sha256(bytes));
  assert.deepEqual(fs.readFileSync(s.registry), bytes);
  assert.equal(fs.statSync(s.registry).mtimeMs, mtime);
  assert.deepEqual(listing(s.dir), files);
  assert.equal(fs.existsSync(s.backups), false);
});

// ── registry: the three new options ────────────────────────────────────────────────────

test('the plugin key is a parameter; the default key is untouched when another is used', (t) => {
  const s = sandbox(t);
  const existing = { scope: 'user', installPath: '/old/local', version: '3.0.0', gitCommitSha: 'd'.repeat(40) };
  seed(s, { version: 2, plugins: { 'great_cto@local': [existing], ...OTHERS } });

  registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, key: 'great_cto@admitted' });

  const after = JSON.parse(fs.readFileSync(s.registry, 'utf8'));
  assert.deepEqual(after.plugins['great_cto@local'], [existing]);
  assert.equal(after.plugins['great_cto@admitted'].length, 1);
  assert.equal(after.plugins['great_cto@admitted'][0].installPath, s.dest);
  assert.deepEqual(after.plugins['other@market'], OTHERS['other@market']);
});

for (const key of ['__proto__', 'great_cto', '', 'a b@c', 7]) {
  test(`refuses plugin key ${JSON.stringify(key)} before touching the registry`, (t) => {
    const s = sandbox(t);
    seed(s, { version: 2, plugins: {} });
    const before = fs.readFileSync(s.registry);
    throwsMessage(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, key }), /plugin key/);
    assert.deepEqual(fs.readFileSync(s.registry), before);
    assert.deepEqual(listing(s.dir), ['installed_plugins.json']);
  });
}

test('an admitted inventory digest can be the receipt, with no git commit and no receipt file', (t) => {
  const s = sandbox(t);
  fs.rmSync(path.join(s.dest, '.great-cto-local-install.json'));
  seed(s, { version: 2, plugins: {
    'great_cto@local': [{ scope: 'user', installPath: '/old', version: '3.0.0', installedAt: '2026-01-01T00:00:00.000Z',
      gitCommitSha: 'd'.repeat(40), localContentSha256: 'e'.repeat(64) }],
    ...OTHERS,
  } });

  const r = registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, inventoryDigest: INVENTORY });

  assert.equal(r.state, 'registered');
  const entry = JSON.parse(fs.readFileSync(s.registry, 'utf8')).plugins['great_cto@local'][0];
  assert.equal(entry.localContentSha256, INVENTORY);
  assert.equal('gitCommitSha' in entry, false, 'a stale commit must not be kept next to an inventory digest');
  assert.equal(entry.installedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(entry.installPath, s.dest);

  assert.equal(registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, inventoryDigest: INVENTORY }).state,
    'unchanged');
});

for (const bad of ['', 'xyz', 'C'.repeat(64), 'c'.repeat(63), 'c'.repeat(65), 7, null]) {
  test(`refuses inventory digest ${JSON.stringify(bad)} and leaves the registry alone`, (t) => {
    const s = sandbox(t);
    seed(s, { version: 2, plugins: {} });
    const before = fs.readFileSync(s.registry);
    throwsMessage(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, inventoryDigest: bad }),
      /inventory digest/);
    assert.deepEqual(fs.readFileSync(s.registry), before);
    assert.deepEqual(listing(s.dir), ['installed_plugins.json']);
  });
}

test('backupDir takes the backup instead of writing one beside the registry', (t) => {
  const s = sandbox(t);
  seed(s, { version: 2, plugins: { ...OTHERS } });
  const before = fs.readFileSync(s.registry);

  const r = registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, backupDir: s.backups });

  const backup = path.join(s.backups, 'installed_plugins.json');
  assert.equal(r.backup, backup);
  assert.deepEqual(fs.readFileSync(backup), before);
  assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
  assert.deepEqual(listing(s.dir), ['installed_plugins.json'], 'nothing may be left beside the registry');
});

test('a snapshot already in backupDir must equal the registry', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(s.backups, { recursive: true });
  seed(s, { version: 2, plugins: { 'host@changed': [] } });
  fs.writeFileSync(path.join(s.backups, 'installed_plugins.json'), text({ version: 2, plugins: {} }));
  const before = fs.readFileSync(s.registry);

  throwsMessage(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, backupDir: s.backups }),
    /snapshot/);

  assert.deepEqual(fs.readFileSync(s.registry), before);
  assert.deepEqual(listing(s.dir), ['installed_plugins.json']);
  assert.equal(fs.readFileSync(path.join(s.backups, 'installed_plugins.json'), 'utf8'), text({ version: 2, plugins: {} }));
});

test('a matching snapshot in backupDir is accepted and kept as is', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(s.backups, { recursive: true });
  seed(s, { version: 2, plugins: {} });
  fs.copyFileSync(s.registry, path.join(s.backups, 'installed_plugins.json'));
  const snapshot = fs.readFileSync(path.join(s.backups, 'installed_plugins.json'));
  assert.equal(registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, backupDir: s.backups }).state,
    'registered');
  assert.deepEqual(fs.readFileSync(path.join(s.backups, 'installed_plugins.json')), snapshot);
  assert.deepEqual(listing(s.dir), ['installed_plugins.json'], 'no second backup beside the registry');
});

// ── registry: compare-and-swap ─────────────────────────────────────────────────────────

for (const [label, backupDir] of [['default backup', undefined], ['transaction backupDir', 'backups']]) {
  test(`lost update is refused and leaves no temp, backup or lock (${label})`, (t) => {
    const s = sandbox(t);
    seed(s, { version: 2, plugins: {} });
    const hostWrite = text({ version: 2, plugins: { 'added@by-host': [{ scope: 'user' }] } });

    throwsMessage(() => registerLocalPlugin({
      registry: s.registry, dest: s.dest, version: VERSION,
      backupDir: backupDir && s.backups,
      onPhase: (p) => { if (p === 'staged') fs.writeFileSync(s.registry, hostWrite); },
    }), /changed concurrently; retry after the host update/);

    assert.equal(fs.readFileSync(s.registry, 'utf8'), hostWrite, "the host's write must survive");
    assert.deepEqual(listing(s.dir), ['installed_plugins.json'], 'no .tmp, .bak or lock may remain');
  });
}

test('a host write right after our first read is also refused', (t) => {
  const s = sandbox(t);
  seed(s, { version: 2, plugins: {} });
  const hostWrite = text({ version: 2, plugins: { 'added@by-host': [] } });
  throwsMessage(() => registerLocalPlugin({
    registry: s.registry, dest: s.dest, version: VERSION,
    onPhase: (p) => { if (p === 'read') fs.writeFileSync(s.registry, hostWrite); },
  }), /changed concurrently/);
  assert.equal(fs.readFileSync(s.registry, 'utf8'), hostWrite);
  assert.deepEqual(listing(s.dir), ['installed_plugins.json']);
});

// ── registry: a failed read throws, it is never an empty registry ──────────────────────

test('a missing registry throws and creates nothing', (t) => {
  const s = sandbox(t);
  assert.throws(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION }), /registry/i);
  assert.throws(() => readInstallRegistry(s.registry), /registry/i);
  assert.deepEqual(listing(s.dir), []);
});

for (const [label, content, pattern] of [
  ['invalid JSON', '{broken', /not valid JSON/],
  ['an empty file', '', /not valid JSON/],
  ['a null document', 'null', /unsupported registry schema/],
  ['schema 1', '{"version":1,"plugins":{}}', /unsupported registry schema/],
  ['no plugins map', '{"version":2}', /unsupported registry schema/],
  ['plugins as an array', '{"version":2,"plugins":[]}', /unsupported registry schema/],
]) {
  test(`${label} throws, names the registry and is left untouched`, (t) => {
    const s = sandbox(t);
    fs.writeFileSync(s.registry, content);
    throwsMessage(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION }), pattern);
    throwsMessage(() => readInstallRegistry(s.registry), pattern);
    assert.equal(fs.readFileSync(s.registry, 'utf8'), content);
    assert.deepEqual(listing(s.dir), ['installed_plugins.json']);
  });
}

test('an invalid entry list for the chosen key throws', (t) => {
  const s = sandbox(t);
  seed(s, { version: 2, plugins: { 'great_cto@admitted': 'not-a-list' } });
  throwsMessage(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION, key: 'great_cto@admitted' }),
    /great_cto@admitted/);
  // The default key is unaffected by garbage under a different key.
  assert.equal(registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION }).state, 'registered');
});

test('a symlinked registry is refused and the link target is untouched', (t) => {
  const s = sandbox(t);
  const real = path.join(s.root, 'real-installed_plugins.json');
  fs.writeFileSync(real, text({ version: 2, plugins: {} }));
  fs.symlinkSync(real, s.registry);
  throwsMessage(() => registerLocalPlugin({ registry: s.registry, dest: s.dest, version: VERSION }), /not a symlink/);
  assert.ok(fs.lstatSync(s.registry).isSymbolicLink());
  assert.equal(fs.readFileSync(real, 'utf8'), text({ version: 2, plugins: {} }));
  assert.deepEqual(listing(s.dir), ['installed_plugins.json']);
});

// ── local marketplace entry ────────────────────────────────────────────────────────────

const ENTRIES = () => [
  { name: 'beads', source: { source: 'url', url: 'https://example.invalid/beads.git', subdir: 'claude-plugin' },
    description: 'issue tracker', version: '0.1.0', strict: false },
  { name: 'great_cto', source: '/old/cache/local/great_cto/3.70.1', description: 'cto', version: '3.70.1', strict: false },
  { name: 'tail', source: '/x/tail/1.0.0', description: 'last one', version: '1.0.0', strict: false },
];
const MARKETPLACE = () => ({ name: 'local', owner: { name: 'someone' }, metadata: { description: 'm' }, plugins: ENTRIES() });
const seedMarketplace = (s, data = MARKETPLACE(), render = text) => {
  fs.mkdirSync(path.dirname(s.marketplace), { recursive: true });
  fs.writeFileSync(s.marketplace, typeof data === 'string' ? data : render(data));
};
const point = (s, extra = {}) => pointLocalMarketplace({ marketplace: s.marketplace, sourceDir: s.dest, version: VERSION, ...extra });

test('marketplace: only the great_cto source and version change, all else is byte-identical', (t) => {
  const s = sandbox(t);
  seedMarketplace(s);
  const before = fs.readFileSync(s.marketplace);

  const r = point(s);

  const expected = MARKETPLACE();
  expected.plugins[1].source = s.dest;
  expected.plugins[1].version = VERSION;
  assert.equal(fs.readFileSync(s.marketplace, 'utf8'), text(expected));
  assert.equal(r.state, 'updated');
  assert.equal(r.previousDigest, sha256(before));
  assert.equal(r.writtenDigest, sha256(fs.readFileSync(s.marketplace)));
  assert.equal(r.reformatted, false);
  assert.equal(fs.statSync(s.marketplace).mode & 0o777, 0o600);
  assert.deepEqual(listing(path.dirname(s.marketplace)), ['marketplace.json']);
});

test('marketplace: the file keeps its own indentation', (t) => {
  const s = sandbox(t);
  seedMarketplace(s, MARKETPLACE(), (d) => JSON.stringify(d, null, 4));
  point(s);
  const expected = MARKETPLACE();
  expected.plugins[1].source = s.dest;
  expected.plugins[1].version = VERSION;
  assert.equal(fs.readFileSync(s.marketplace, 'utf8'), JSON.stringify(expected, null, 4));
});

test('marketplace: second call is unchanged and writes nothing', (t) => {
  const s = sandbox(t);
  seedMarketplace(s);
  point(s);
  const bytes = fs.readFileSync(s.marketplace);
  const mtime = fs.statSync(s.marketplace).mtimeMs;
  const r = point(s, { backupDir: s.backups });
  assert.equal(r.state, 'unchanged');
  assert.equal(r.previousDigest, sha256(bytes));
  assert.deepEqual(fs.readFileSync(s.marketplace), bytes);
  assert.equal(fs.statSync(s.marketplace).mtimeMs, mtime);
  assert.equal(fs.existsSync(s.backups), false);
});

test('marketplace: an absent file is not created unless asked', (t) => {
  const s = sandbox(t);
  throwsMessage(() => point(s), /create: true/);
  assert.equal(fs.existsSync(path.dirname(s.marketplace)), false, 'no directory may be created either');
});

test('marketplace: create: true creates the file with just the great_cto entry', (t) => {
  const s = sandbox(t);
  const r = point(s, { create: true });
  assert.equal(r.state, 'created');
  assert.equal(r.previousDigest, null);
  const doc = JSON.parse(fs.readFileSync(s.marketplace, 'utf8'));
  assert.equal(doc.name, 'local');
  assert.equal(doc.plugins.length, 1);
  assert.deepEqual(
    { name: doc.plugins[0].name, source: doc.plugins[0].source, version: doc.plugins[0].version },
    { name: 'great_cto', source: s.dest, version: VERSION });
  assert.equal(fs.statSync(s.marketplace).mode & 0o777, 0o600);
  assert.equal(point(s, { create: true }).state, 'unchanged');
});

test('marketplace: a missing great_cto entry is added only when asked, others untouched', (t) => {
  const s = sandbox(t);
  const doc = MARKETPLACE();
  doc.plugins.splice(1, 1);
  seedMarketplace(s, doc);
  const before = fs.readFileSync(s.marketplace);
  throwsMessage(() => point(s), /create: true/);
  assert.deepEqual(fs.readFileSync(s.marketplace), before);

  point(s, { create: true });
  const after = JSON.parse(fs.readFileSync(s.marketplace, 'utf8'));
  assert.deepEqual(after.plugins.slice(0, 2), doc.plugins);
  assert.equal(after.plugins[2].name, 'great_cto');
  assert.equal(after.plugins[2].source, s.dest);
});

test('marketplace: two great_cto entries are ambiguous and refused', (t) => {
  const s = sandbox(t);
  const doc = MARKETPLACE();
  doc.plugins.push({ name: 'great_cto', source: '/dup' });
  seedMarketplace(s, doc);
  const before = fs.readFileSync(s.marketplace);
  throwsMessage(() => point(s), /more than once/);
  assert.deepEqual(fs.readFileSync(s.marketplace), before);
});

for (const phase of ['read', 'staged']) {
  test(`marketplace: lost update is refused when the host writes after the ${phase} phase`, (t) => {
    const s = sandbox(t);
    seedMarketplace(s);
    const hostWrite = text({ ...MARKETPLACE(), metadata: { description: 'edited by someone else' } });
    throwsMessage(() => point(s, {
      onPhase: (p) => { if (p === phase) fs.writeFileSync(s.marketplace, hostWrite); },
    }), /changed concurrently; retry after the host update/);
    assert.equal(fs.readFileSync(s.marketplace, 'utf8'), hostWrite);
    assert.deepEqual(listing(path.dirname(s.marketplace)), ['marketplace.json'], 'no temp file may remain');
  });
}

test('marketplace: unparseable JSON is refused with the file named', (t) => {
  const s = sandbox(t);
  seedMarketplace(s, '{ not json');
  throwsMessage(() => point(s), new RegExp(s.marketplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(fs.readFileSync(s.marketplace, 'utf8'), '{ not json');
  assert.deepEqual(listing(path.dirname(s.marketplace)), ['marketplace.json']);
});

for (const [label, content] of [
  ['an array document', '[]'],
  ['plugins that is not an array', '{"name":"local","plugins":{}}'],
  ['no plugins list', '{"name":"local"}'],
]) {
  test(`marketplace: ${label} is refused untouched`, (t) => {
    const s = sandbox(t);
    seedMarketplace(s, content);
    throwsMessage(() => point(s, { create: true }), /marketplace/i);
    assert.equal(fs.readFileSync(s.marketplace, 'utf8'), content);
  });
}

test('marketplace: a symlinked file is refused and the target is untouched', (t) => {
  const s = sandbox(t);
  const real = path.join(s.root, 'real-marketplace.json');
  fs.writeFileSync(real, text(MARKETPLACE()));
  fs.mkdirSync(path.dirname(s.marketplace), { recursive: true });
  fs.symlinkSync(real, s.marketplace);
  throwsMessage(() => point(s, { create: true }), /not a symlink/);
  assert.ok(fs.lstatSync(s.marketplace).isSymbolicLink());
  assert.equal(fs.readFileSync(real, 'utf8'), text(MARKETPLACE()));
});

test('marketplace: backupDir receives the original bytes and nothing lands beside the target', (t) => {
  const s = sandbox(t);
  seedMarketplace(s);
  const before = fs.readFileSync(s.marketplace);
  const r = point(s, { backupDir: s.backups });
  assert.equal(r.backup, path.join(s.backups, 'marketplace.json'));
  assert.deepEqual(fs.readFileSync(r.backup), before);
  assert.equal(fs.statSync(r.backup).mode & 0o777, 0o600);
  assert.deepEqual(listing(path.dirname(s.marketplace)), ['marketplace.json']);
});

test('marketplace: a stale snapshot in backupDir refuses', (t) => {
  const s = sandbox(t);
  seedMarketplace(s);
  fs.mkdirSync(s.backups, { recursive: true });
  fs.writeFileSync(path.join(s.backups, 'marketplace.json'), 'older');
  const before = fs.readFileSync(s.marketplace);
  throwsMessage(() => point(s, { backupDir: s.backups }), /snapshot/);
  assert.deepEqual(fs.readFileSync(s.marketplace), before);
});

for (const sourceDir of ['relative/dir', '/a/../b', '/a/./b', '/a//b', '', '/x\0y', 7]) {
  test(`marketplace: refuses source ${JSON.stringify(sourceDir)}`, (t) => {
    const s = sandbox(t);
    seedMarketplace(s);
    const before = fs.readFileSync(s.marketplace);
    throwsMessage(() => pointLocalMarketplace({ marketplace: s.marketplace, sourceDir, version: VERSION }), /source/);
    assert.deepEqual(fs.readFileSync(s.marketplace), before);
  });
}
