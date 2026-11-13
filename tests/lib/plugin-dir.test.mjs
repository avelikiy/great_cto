// scripts/lib/plugin-dir.sh: the one place a hook learns which great_cto it is running.
//
// ADR-050 decision 7 / ARCH-plugin-activation Q5. The hooks used to answer this with
// `ls -d ~/.claude/plugins/cache/*/great_cto/*/ | sort -V | tail -1`: the highest version in ANY
// marketplace cache. On a machine that holds the admitted local copy beside the git-marketplace
// copy (both were there on 2026-11-10), a session registered to the admitted copy could execute
// bytes the host had pulled from a mutable branch. The resolver below prefers what the host says,
// then the admitted registration, and refuses rather than guessing.
//
// Every case runs the real script under a throwaway HOME.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/lib/plugin-dir.sh');

function machine(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-plugin-dir-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const cache = (market, version) => path.join(home, '.claude/plugins/cache', market, 'great_cto', version);
  const plugin = (dir, manifest = { name: 'great-cto', version: '0.0.0' }) => {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude-plugin/plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
    return dir;
  };
  const registry = (value) => {
    const file = path.join(home, '.claude/plugins/installed_plugins.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const entry = (installPath, over = {}) => ({ scope: 'user', installPath, version: '1.0.0', ...over });
  const run = (env = {}) => spawnSync('bash', [SCRIPT], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env },
  });
  return { home, cache, plugin, registry, entry, run };
}

const refused = (r, why) => {
  assert.equal(r.status, 1, `expected a refusal (${why}); got status ${r.status}, stdout ${JSON.stringify(r.stdout)}`);
  assert.equal(r.stdout, '', 'a refusal prints nothing on stdout: a caller must never receive a half-answer');
  assert.match(r.stderr, /^GREAT_CTO: plugin dir not resolved/, 'and says why on stderr');
};

// ── 1. what the host says ────────────────────────────────────────────────────

test('CLAUDE_PLUGIN_ROOT that holds the plugin manifest is the answer', (t) => {
  const m = machine(t);
  const dir = m.plugin(path.join(m.home, 'somewhere/else'));
  const r = m.run({ CLAUDE_PLUGIN_ROOT: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, dir + '\n');
});

test('a trailing slash on CLAUDE_PLUGIN_ROOT is not part of the answer', (t) => {
  const m = machine(t);
  const dir = m.plugin(path.join(m.home, 'p'));
  const r = m.run({ CLAUDE_PLUGIN_ROOT: dir + '/' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, dir + '\n');
});

test('CLAUDE_PLUGIN_ROOT wins over the admitted registration', (t) => {
  const m = machine(t);
  const admitted = m.plugin(m.cache('local', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(admitted)] } });
  const dev = m.plugin(path.join(m.home, 'dev-checkout'));
  const r = m.run({ CLAUDE_PLUGIN_ROOT: dev });
  assert.equal(r.stdout, dev + '\n');
});

test('a CLAUDE_PLUGIN_ROOT that is not a plugin directory refuses, and does not fall through to the registration', (t) => {
  const m = machine(t);
  const admitted = m.plugin(m.cache('local', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(admitted)] } });
  const empty = path.join(m.home, 'empty');
  fs.mkdirSync(empty);
  const r = m.run({ CLAUDE_PLUGIN_ROOT: empty });
  refused(r, 'host variable points at a directory without the manifest');
  assert.match(r.stderr, /CLAUDE_PLUGIN_ROOT/);
});

test('a CLAUDE_PLUGIN_ROOT that is some other plugin refuses', (t) => {
  const m = machine(t);
  const other = m.plugin(path.join(m.home, 'other'), { name: 'not-great-cto', version: '1.0.0' });
  refused(m.run({ CLAUDE_PLUGIN_ROOT: other }), 'manifest names another plugin');
});

test('a relative CLAUDE_PLUGIN_ROOT is refused', (t) => {
  const m = machine(t);
  m.plugin(path.join(m.home, 'rel'));
  refused(m.run({ CLAUDE_PLUGIN_ROOT: 'rel' }), 'relative path');
});

// ── 2. the admitted registration ─────────────────────────────────────────────

test('without CLAUDE_PLUGIN_ROOT the admitted registration is the answer', (t) => {
  const m = machine(t);
  const admitted = m.plugin(m.cache('local', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(admitted)] } });
  const r = m.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, admitted + '\n');
});

test('an empty CLAUDE_PLUGIN_ROOT counts as unset', (t) => {
  const m = machine(t);
  const admitted = m.plugin(m.cache('local', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(admitted)] } });
  assert.equal(m.run({ CLAUDE_PLUGIN_ROOT: '' }).stdout, admitted + '\n');
});

test('the highest version in another marketplace cache is never chosen', (t) => {
  // The machine ARCH Q6 measured: the git marketplace copy is newer than the admitted one.
  const m = machine(t);
  const admitted = m.plugin(m.cache('local', '3.80.0'));
  const gitCopy = m.plugin(m.cache('great-cto', '9.9.9'));
  m.registry({ version: 2, plugins: {
    'great_cto@great-cto': [m.entry(gitCopy, { gitCommitSha: 'c'.repeat(40) })],
    'great_cto@local': [m.entry(admitted)],
  } });
  const r = m.run();
  assert.equal(r.stdout, admitted + '\n', 'the old lookup would have printed ' + gitCopy);
});

test('no admitted registration: nothing is chosen, even though a cache holds a plugin', (t) => {
  const m = machine(t);
  const gitCopy = m.plugin(m.cache('great-cto', '9.9.9'));
  m.plugin(m.cache('local', '3.80.0')); // present on disk, never registered
  m.registry({ version: 2, plugins: { 'great_cto@great-cto': [m.entry(gitCopy)] } });
  const r = m.run();
  refused(r, 'only the git marketplace is registered');
  assert.match(r.stderr, /great_cto@local/);
});

test('a missing registry refuses and says how to get one', (t) => {
  const m = machine(t);
  m.plugin(m.cache('local', '3.80.0'));
  const r = m.run();
  refused(r, 'no installed_plugins.json');
  assert.match(r.stderr, /great-cto init/);
});

for (const [name, content] of [
  ['unparseable JSON', '{'],
  ['a JSON array', '[]'],
  ['schema version 1', { version: 1, plugins: {} }],
  ['no plugins object', { version: 2 }],
  ['the plugin listed as a string', { version: 2, plugins: { 'great_cto@local': 'x' } }],
]) {
  test(`a registry that is ${name} refuses`, (t) => {
    const m = machine(t);
    m.plugin(m.cache('local', '3.80.0'));
    m.registry(content);
    refused(m.run(), name);
  });
}

test('two user-scope registrations are ambiguous and refuse', (t) => {
  const m = machine(t);
  const a = m.plugin(m.cache('local', '3.80.0')), b = m.plugin(m.cache('local', '3.81.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(a), m.entry(b)] } });
  refused(m.run(), 'two user entries');
});

test('only the user-scope registration counts', (t) => {
  const m = machine(t);
  const a = m.plugin(m.cache('local', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(a, { scope: 'project' })] } });
  refused(m.run(), 'project scope only');
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(a, { scope: 'project' }), m.entry(a)] } });
  assert.equal(m.run().stdout, a + '\n', 'a project entry beside the user entry is not ambiguity');
});

// ── 3. what a registration may point at ──────────────────────────────────────

test('a registered path outside the admitted cache root is refused', (t) => {
  const m = machine(t);
  const elsewhere = m.plugin(path.join(m.home, 'not-the-cache/great_cto/3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(elsewhere)] } });
  refused(m.run(), 'outside cache/local/great_cto');
});

test('a registered path in another marketplace cache is refused even under the local key', (t) => {
  const m = machine(t);
  const gitCopy = m.plugin(m.cache('great-cto', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(gitCopy)] } });
  refused(m.run(), 'git marketplace path under the local key');
});

test('a registered path that climbs out of the cache root is refused', (t) => {
  const m = machine(t);
  m.plugin(path.join(m.home, 'outside'));
  // Concatenated, not path.join'ed: join would normalise the ".." away and test nothing.
  const root = path.join(m.home, '.claude/plugins/cache/local/great_cto');
  for (const sneaky of [root + '/../../../../../outside', root + '/..', root + '/3.80.0/../../../../../../outside']) {
    m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(sneaky)] } });
    refused(m.run(), 'dot-dot traversal: ' + sneaky);
  }
});

test('a registered path nested below the version directory is refused', (t) => {
  const m = machine(t);
  const nested = m.plugin(path.join(m.cache('local', '3.80.0'), 'inner'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(nested)] } });
  refused(m.run(), 'one level only');
});

test('a registered path that does not exist, or holds no manifest, is refused', (t) => {
  const m = machine(t);
  const missing = m.cache('local', '3.80.0');
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(missing)] } });
  refused(m.run(), 'absent directory');
  fs.mkdirSync(missing, { recursive: true });
  refused(m.run(), 'directory without a manifest');
});

test('a registered path that is not a string is refused', (t) => {
  const m = machine(t);
  m.registry({ version: 2, plugins: { 'great_cto@local': [{ scope: 'user', installPath: 7 }] } });
  refused(m.run(), 'installPath is a number');
});

// The registered path is checked physically, not as a string (bug 0m3u). The documented guarantee is
// that the resolver never hands back a path outside the version directory the admitted registration
// names. A version directory that is a symlink satisfies every string comparison and still runs
// whatever it points at.

test('a registered version directory that is a symlink is refused, whether it points outside the cache or inside it', (t) => {
  const m = machine(t);
  const real = m.plugin(m.cache('local', '3.80.0'));
  const outside = m.plugin(path.join(m.home, 'outside'));
  const link = m.cache('local', '9.0.0');
  for (const target of [outside, real]) {
    fs.rmSync(link, { force: true, recursive: true });
    fs.symlinkSync(target, link);
    m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(link)] } });
    const r = m.run();
    refused(r, `a symlink to ${target}`);
    assert.match(r.stderr, /symbolic link/);
  }
});

test('the same registration with a real directory in place of the symlink resolves: the refusal above is about the link', (t) => {
  const m = machine(t);
  const dir = m.plugin(m.cache('local', '9.0.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(dir)] } });
  assert.equal(m.run().stdout, dir + '\n');
});

test('a Claude directory that is itself a symlink (dotfile managers do this) still resolves: the comparison is physical on both sides', (t) => {
  const m = machine(t);
  const dotfiles = path.join(m.home, 'dotfiles', 'claude');
  fs.mkdirSync(dotfiles, { recursive: true });
  fs.symlinkSync(dotfiles, path.join(m.home, '.claude'));
  const dir = m.plugin(m.cache('local', '3.80.0'));
  m.registry({ version: 2, plugins: { 'great_cto@local': [m.entry(dir)] } });
  const r = m.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, dir + '\n', 'the registered path is printed as registered');
});

// ── 4. the property the hooks depend on ──────────────────────────────────────

test('the script lists no cache and sorts nothing: it cannot pick "the newest"', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  // Not vacuous: an empty file would also contain no glob. The script must actually read both sources.
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
  assert.match(src, /installed_plugins\.json/);
  assert.doesNotMatch(src, /cache\/\*|\bsort\b|\bls\b|\bfind\b/, 'a glob or a sort over the cache is the defect this script exists to remove');
});

test('the script is executable by bash on macOS: no bash 4 features', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env bash\n/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/, 'the file under test is the resolver, not a placeholder');
  assert.doesNotMatch(src, /\$\{[A-Za-z_]+(,,|\^\^)\}|\bmapfile\b|\breadarray\b|declare -A/, 'macOS ships bash 3.2');
});
