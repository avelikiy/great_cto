// The ~30 hook strings that resolve PLUGIN_DIR are generated, not hand-edited.
//
// ARCH-plugin-activation Q5: "Generate the hook strings; do not hand-edit forty of them".
// scripts/generate-plugin-hooks.mjs owns the one expansion, and this file holds it to three things:
//   1. it rewrites the old cache-glob lookup and refuses to guess at anything it does not recognise;
//   2. the shipped manifest is exactly what the generator produces (a hand edit shows up as drift);
//   3. the generated bootstrap, run for real, never picks a cache the host merely pulled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BOOTSTRAP, TOKEN, expandHookCommand, generateManifestText, checkManifestText,
} from '../../scripts/generate-plugin-hooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = path.join(ROOT, '.claude-plugin/plugin.json');
const GENERATOR = path.join(ROOT, 'scripts/generate-plugin-hooks.mjs');
const RESOLVER = path.join(ROOT, 'scripts/lib/plugin-dir.sh');

// The lookup as it stood in 33 hook commands, in both quotings of the trailing sed. Plain strings,
// not template literals: the `${` is shell, not JavaScript.
const AWK = 'awk -F\'/plugins/cache/\' \'{split($NF,p,"/"); print p[3], $0}\' | sort -V | tail -1 | cut -d\' \' -f2-';
const LEGACY_SINGLE = 'PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | ' + AWK + ' | sed \'s|/$||\')}';
const LEGACY_DOUBLE = 'PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | ' + AWK + ' | sed "s|/$||")}';

const hookCommands = (manifest) => Object.values(manifest.hooks || {})
  .flat().flatMap((g) => g.hooks || []).map((h) => h.command || '');

// ── 1. the expansion ─────────────────────────────────────────────────────────

test('the old lookup is replaced in both quotings, and only the lookup is touched', () => {
  for (const legacy of [LEGACY_SINGLE, LEGACY_DOUBLE]) {
    const before = '_gd="$PWD"; cd "$_gd"; ' + legacy + '; [ -n "$PLUGIN_DIR" ] && node "${PLUGIN_DIR}/x.mjs" || true';
    const after = expandHookCommand(before);
    assert.equal(after, '_gd="$PWD"; cd "$_gd"; ' + BOOTSTRAP + '; [ -n "$PLUGIN_DIR" ] && node "${PLUGIN_DIR}/x.mjs" || true');
    assert.doesNotMatch(after, /plugins\/cache\/\*/);
  }
});

test('expanding twice changes nothing', () => {
  const once = expandHookCommand('a; ' + LEGACY_SINGLE + '; b');
  assert.equal(expandHookCommand(once), once);
});

test('the token form expands too, so a new hook is written once and generated', () => {
  assert.equal(expandHookCommand('x; PLUGIN_DIR=' + TOKEN + '; y'), 'x; ' + BOOTSTRAP + '; y');
});

test('a PLUGIN_DIR assignment of any other shape is refused, not skipped', () => {
  // A skipped odd form would keep whatever glob it carried and look generated.
  for (const odd of [
    'PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/*/great_cto/* | tail -1); x',
    'PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-/opt/great_cto}; x',
    'PLUGIN_DIR="$HOME/.claude/plugins/cache/local/great_cto/1.0.0"; x',
  ]) assert.throws(() => expandHookCommand(odd), /PLUGIN_DIR/, odd);
});

test('a command that never assigns PLUGIN_DIR is left alone', () => {
  const plain = '_pd="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"; [ -n "$_pd" ] || exit 0; node "$_pd/x.mjs"';
  assert.equal(expandHookCommand(plain), plain);
});

test('the bootstrap names the resolver, the host variable and the registration, and no cache glob', () => {
  assert.match(BOOTSTRAP, /^PLUGIN_DIR=\$\(/);
  assert.match(BOOTSTRAP, /CLAUDE_PLUGIN_ROOT/);
  assert.match(BOOTSTRAP, /scripts\/lib\/plugin-dir\.sh/);
  assert.match(BOOTSTRAP, /great_cto@local/);
  assert.doesNotMatch(BOOTSTRAP, /cache\/\*|sort -V|\bls\b/);
});

// ── 2. the shipped manifest is the generator's output ────────────────────────

test('the shipped manifest is exactly what the generator produces', () => {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  assert.deepEqual(checkManifestText(text), []);
  assert.equal(generateManifestText(text), text, 'run: node scripts/generate-plugin-hooks.mjs');
});

test('every hook that resolves PLUGIN_DIR uses the generated bootstrap; none lists a plugin cache', () => {
  const commands = hookCommands(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')));
  const resolving = commands.filter((c) => /PLUGIN_DIR=/.test(c));
  assert.ok(resolving.length >= 30, `only ${resolving.length} hooks resolve PLUGIN_DIR; the scan is not seeing the manifest`);
  for (const c of resolving) assert.ok(c.includes(BOOTSTRAP), 'hand-written resolution: ' + c.slice(0, 120));
  for (const c of commands) assert.doesNotMatch(c, /ls -d [^;|]*plugins\/cache\/\*/, 'a hook still lists the cache: ' + c.slice(0, 120));
});

test('the check reports a hand-edited hook as drift', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const group = Object.values(manifest.hooks).flat().find((g) => g.hooks.some((h) => /PLUGIN_DIR=/.test(h.command)));
  const hook = group.hooks.find((h) => /PLUGIN_DIR=/.test(h.command));
  hook.command = hook.command.replace(BOOTSTRAP, LEGACY_SINGLE);
  const problems = checkManifestText(JSON.stringify(manifest, null, 2) + '\n');
  assert.ok(problems.length >= 1 && problems.every((p) => /PLUGIN_DIR/.test(p) || /generator/.test(p)), problems.join('\n'));
});

test('non-ASCII text is written as \\uXXXX, as the file already is, so regenerating moves no other byte', () => {
  const out = generateManifestText(JSON.stringify({ hooks: {}, description: 'a — b 🚨' }, null, 2) + '\n');
  assert.match(out, /"a \\u2014 b \\ud83d\\udea8"/);
});

test('the command line: --check passes on the repository, fails on drift, and the default run repairs it', (t) => {
  assert.equal(spawnSync('node', [GENERATOR, '--check'], { cwd: ROOT, encoding: 'utf8' }).status, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-gen-hooks-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'plugin.json');
  const drifted = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'a; ' + LEGACY_SINGLE + '; b' }] }] } };
  fs.writeFileSync(file, JSON.stringify(drifted, null, 2) + '\n');
  const check = spawnSync('node', [GENERATOR, '--check', '--manifest', file], { encoding: 'utf8' });
  assert.equal(check.status, 1);
  assert.match(check.stderr, /plugin\.json/);
  assert.equal(spawnSync('node', [GENERATOR, '--manifest', file], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('node', [GENERATOR, '--check', '--manifest', file], { encoding: 'utf8' }).status, 0);
  assert.ok(fs.readFileSync(file, 'utf8').includes(BOOTSTRAP));
});

// ── 3. the bootstrap, run ────────────────────────────────────────────────────

function machine(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-bootstrap-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const plugin = (market, version) => {
    const dir = path.join(home, '.claude/plugins/cache', market, 'great_cto', version);
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude-plugin/plugin.json'), '{"name":"great-cto","version":"' + version + '"}\n');
    fs.copyFileSync(RESOLVER, path.join(dir, 'scripts/lib/plugin-dir.sh'));
    return dir;
  };
  const register = (plugins) => {
    const file = path.join(home, '.claude/plugins/installed_plugins.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 2, plugins }, null, 2) + '\n');
  };
  const resolve = (env = {}) => spawnSync('bash', ['-c', BOOTSTRAP + '; printf %s "$PLUGIN_DIR"'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env },
  }).stdout;
  return { home, plugin, register, resolve };
}

test('bootstrap: the directory the host names is used', (t) => {
  const m = machine(t);
  const dir = m.plugin('great-cto', '3.80.0');
  assert.equal(m.resolve({ CLAUDE_PLUGIN_ROOT: dir }), dir);
});

test('bootstrap: with no host variable the admitted registration is used, not the newer git-marketplace copy', (t) => {
  const m = machine(t);
  const admitted = m.plugin('local', '3.80.0'), gitCopy = m.plugin('great-cto', '9.9.9');
  m.register({
    'great_cto@great-cto': [{ scope: 'user', installPath: gitCopy, version: '9.9.9' }],
    'great_cto@local': [{ scope: 'user', installPath: admitted, version: '3.80.0' }],
  });
  assert.equal(m.resolve(), admitted);
});

test('bootstrap: with only the git-marketplace copy registered, PLUGIN_DIR stays empty', (t) => {
  const m = machine(t);
  const gitCopy = m.plugin('great-cto', '9.9.9');
  m.plugin('local', '3.80.0'); // on disk, never registered
  m.register({ 'great_cto@great-cto': [{ scope: 'user', installPath: gitCopy, version: '9.9.9' }] });
  assert.equal(m.resolve(), '');
});

test('bootstrap: no registry at all leaves PLUGIN_DIR empty rather than searching', (t) => {
  const m = machine(t);
  m.plugin('local', '3.80.0');
  assert.equal(m.resolve(), '');
});

test('bootstrap: a registration pointing outside the admitted cache is never executed', (t) => {
  // The locator runs before the resolver can validate, so it must not hand the shell a path it
  // would not accept: this plugin carries a resolver that writes a marker if it is ever run.
  const m = machine(t);
  const outside = path.join(m.home, 'outside');
  fs.mkdirSync(path.join(outside, 'scripts/lib'), { recursive: true });
  const marker = path.join(m.home, 'MARKER');
  fs.writeFileSync(path.join(outside, 'scripts/lib/plugin-dir.sh'), '#!/usr/bin/env bash\ntouch "' + marker + '"\necho "' + outside + '"\n');
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: outside, version: '1.0.0' }] });
  assert.equal(m.resolve(), '');
  assert.equal(fs.existsSync(marker), false, 'a script outside the admitted cache was executed');
});

test('bootstrap: a hook still behaves as before when the plugin is found', (t) => {
  // End to end through the real shape of a hook: resolve, then run a script from the result.
  const m = machine(t);
  const dir = m.plugin('great-cto', '3.80.0');
  fs.writeFileSync(path.join(dir, 'scripts/lib/hello.mjs'), 'process.stdout.write("hello from " + process.argv[1].split("/").slice(-3).join("/"));\n');
  const cmd = BOOTSTRAP + '; [ -n "$PLUGIN_DIR" ] && node "${PLUGIN_DIR}/scripts/lib/hello.mjs" 2>/dev/null; true';
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: m.home, CLAUDE_PLUGIN_ROOT: dir } });
  assert.equal(r.stdout, 'hello from scripts/lib/hello.mjs');
});
