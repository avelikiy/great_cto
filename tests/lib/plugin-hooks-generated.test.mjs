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
  const input = 'a; ' + LEGACY_SINGLE + '; b';
  const once = expandHookCommand(input);
  assert.notEqual(once, input, 'the first expansion did something, so the second has something to leave alone');
  assert.equal(expandHookCommand(once), once);
});

test('the bootstrap generated before the physical path check is recognised and rewritten, so a bootstrap change is one regeneration', () => {
  const before = BOOTSTRAP
    .replace('f=require("fs"),', '')
    .replace('&&!f.lstatSync(p).isSymbolicLink()&&f.realpathSync(p)===a.join(f.realpathSync(r),a.basename(p))', '');
  assert.notEqual(before, BOOTSTRAP, 'the simulated old form differs from the current one');
  assert.doesNotMatch(before, /isSymbolicLink/);
  assert.equal(expandHookCommand('a; ' + before + '; b'), 'a; ' + BOOTSTRAP + '; b');
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
  assert.match(BOOTSTRAP, /^PLUGIN_DIR=\$\{CLAUDE_PLUGIN_ROOT:-/, 'the host variable comes first, as a plain expansion');
  assert.match(BOOTSTRAP, /scripts\/lib\/plugin-dir\.sh/);
  assert.match(BOOTSTRAP, /great_cto@local/);
  assert.doesNotMatch(BOOTSTRAP, /cache\/\*|sort -V|\bls\b/);
});

// ── 2. the shipped manifest is the generator's output ────────────────────────

test('the shipped manifest is exactly what the generator produces', () => {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  // Not vacuous: a generator that does nothing also leaves the file as it found it. The bootstrap
  // must be there, JSON-escaped as the file writes it.
  assert.ok(BOOTSTRAP.length > 100, 'the bootstrap is a real snippet');
  assert.ok(text.includes(JSON.stringify(BOOTSTRAP).slice(1, -1)), 'the manifest carries the generated bootstrap');
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
  assert.ok(hookCommands(JSON.parse(fs.readFileSync(file, 'utf8')))[0].includes(BOOTSTRAP), 'the repaired hook carries the generated bootstrap');
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

test('bootstrap: the host variable is taken as given and starts nothing: 17 hooks fire on every tool call', (t) => {
  // 8 PreToolUse and 9 PostToolUse hooks resolve PLUGIN_DIR, so a process per hook is a cost on every
  // tool call. A directory with neither a manifest nor a resolver would be REFUSED if the resolver
  // ran; coming back verbatim shows the host's own value never reaches it.
  const m = machine(t);
  const bare = path.join(m.home, 'bare');
  fs.mkdirSync(bare);
  assert.equal(m.resolve({ CLAUDE_PLUGIN_ROOT: bare }), bare);
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
  const admitted = m.plugin('local', '3.80.0'); // on disk, never registered
  // Same machine, registered properly: it resolves. So the empty answer below is a refusal, not a broken bootstrap.
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: admitted, version: '3.80.0' }] });
  assert.equal(m.resolve(), admitted);
  m.register({ 'great_cto@great-cto': [{ scope: 'user', installPath: gitCopy, version: '9.9.9' }] });
  assert.equal(m.resolve(), '');
});

test('bootstrap: no registry at all leaves PLUGIN_DIR empty rather than searching', (t) => {
  const m = machine(t);
  const admitted = m.plugin('local', '3.80.0');
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: admitted, version: '3.80.0' }] });
  assert.equal(m.resolve(), admitted, 'with the registry it resolves');
  fs.rmSync(path.join(m.home, '.claude/plugins/installed_plugins.json'));
  assert.equal(m.resolve(), '', 'without it the plugin on disk is not guessed');
});

test('bootstrap: a registration pointing outside the admitted cache is never executed', (t) => {
  // The locator runs before the resolver can validate, so it must not hand the shell a path it
  // would not accept: this plugin carries a resolver that writes a marker if it is ever run.
  const m = machine(t);
  const outside = path.join(m.home, 'outside');
  fs.mkdirSync(path.join(outside, 'scripts/lib'), { recursive: true });
  const marker = path.join(m.home, 'MARKER');
  fs.writeFileSync(path.join(outside, 'scripts/lib/plugin-dir.sh'), '#!/usr/bin/env bash\ntouch "' + marker + '"\necho "' + outside + '"\n');
  const admitted = m.plugin('local', '3.80.0');
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: admitted, version: '3.80.0' }] });
  assert.equal(m.resolve(), admitted, 'a registration inside the admitted cache resolves');
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: outside, version: '1.0.0' }] });
  assert.equal(m.resolve(), '');
  assert.equal(fs.existsSync(marker), false, 'a script outside the admitted cache was executed');
});

test('bootstrap: a registered version directory that is a symlink is never executed, inside the cache or out (bug 0m3u)', (t) => {
  // The locator checks the path physically: a link satisfies every string comparison and still runs
  // whatever it points at. Each target carries a resolver that writes a marker if it is ever run.
  const m = machine(t);
  const marker = path.join(m.home, 'MARKER');
  const planted = (dir) => {
    fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts/lib/plugin-dir.sh'), '#!/usr/bin/env bash\ntouch "' + marker + '"\necho "' + dir + '"\n');
    return dir;
  };
  const real = m.plugin('local', '3.80.0');
  const outside = planted(path.join(m.home, 'outside'));
  planted(real);
  const link = path.join(m.home, '.claude/plugins/cache/local/great_cto/9.0.0');
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: real, version: '3.80.0' }] });
  assert.equal(m.resolve(), real, 'a real directory in the same place resolves');
  fs.rmSync(marker, { force: true });
  for (const target of [outside, real]) {
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(target, link);
    m.register({ 'great_cto@local': [{ scope: 'user', installPath: link, version: '9.0.0' }] });
    assert.equal(m.resolve(), '', `a link to ${path.basename(target)} was handed to the shell`);
    assert.equal(fs.existsSync(marker), false, 'the resolver behind a symlink was executed');
  }
});

test('bootstrap: a Claude directory that is a symlink (dotfile managers) still resolves', (t) => {
  const m = machine(t);
  const dotfiles = path.join(m.home, 'dotfiles-claude');
  const admitted = m.plugin('local', '3.80.0');
  fs.renameSync(path.join(m.home, '.claude'), dotfiles);
  fs.symlinkSync(dotfiles, path.join(m.home, '.claude'));
  m.register({ 'great_cto@local': [{ scope: 'user', installPath: admitted, version: '3.80.0' }] });
  assert.equal(m.resolve(), admitted);
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

// ── 4. a guard that cannot find its code blocks (bug osik) ───────────────────
//
// Six PreToolUse hooks decide whether a tool call may go ahead. With no PLUGIN_DIR each ran
// `node "/scripts/hooks/<name>.mjs"`, which exits 1, and their wrapper turns anything but 2 into
// "allow": secret-scan and the Bash guards silently did not run. Dormant while the host exports
// CLAUDE_PLUGIN_ROOT to every hook; reachable with a git-marketplace-only install, where the
// bootstrap now (correctly) refuses to guess. The main branch had the same fail-open behind its
// cache listing, so this is not new, but the new bootstrap makes an empty PLUGIN_DIR a normal
// answer rather than an absent cache.

const GUARDS = ['bash-guards', 'secret-read-guard', 'secret-scan', 'frozen-gates-guard', 'gate-weakening-guard', 'edit-scope-guard'];
const EXIT_TWO = 'if [ $EXIT -eq 2 ]; then exit 2; fi';
const preToolUse = () => Object.entries(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).hooks.PreToolUse)
  .flatMap(([, group]) => group.hooks.map((h) => h.command));
const scriptOf = (command) => /hooks\/([\w-]+)\.mjs/.exec(command)?.[1];

test('guards: the PreToolUse hooks that can block are exactly the six, and each carries the empty-PLUGIN_DIR check', () => {
  const blocking = preToolUse().filter((c) => c.includes(EXIT_TWO));
  assert.deepEqual(blocking.map(scriptOf).sort(), [...GUARDS].sort());
  for (const command of blocking) {
    assert.ok(command.includes(BOOTSTRAP), 'the guard resolves PLUGIN_DIR through the generated bootstrap');
    const after = command.slice(command.indexOf(BOOTSTRAP) + BOOTSTRAP.length);
    assert.match(after, /^; if \[ -z "\$PLUGIN_DIR" \]; then /, `the check follows the bootstrap directly: ${scriptOf(command)}`);
    assert.match(after, /permissionDecision":"deny"/);
    assert.match(after, /exit 2; fi/);
  }
});

test('guards: hooks that are not guards are left as they were: no new early exit in an advisory hook', () => {
  const others = preToolUse().filter((c) => !c.includes(EXIT_TWO));
  assert.ok(others.length >= 3, 'the scan saw the advisory PreToolUse hooks');
  for (const command of others) assert.doesNotMatch(command, /-z "\$PLUGIN_DIR"/, scriptOf(command));
});

test('guards: the generator adds the check to a guard once, and only to a PreToolUse hook of that shape', () => {
  const guard = 'x; PLUGIN_DIR=' + TOKEN + '; node "${PLUGIN_DIR}/scripts/hooks/g.mjs"; EXIT=$?; ' + EXIT_TWO + '; exit 0';
  const once = expandHookCommand(guard, { event: 'PreToolUse' });
  assert.match(once, /-z "\$PLUGIN_DIR"/);
  assert.equal(expandHookCommand(once, { event: 'PreToolUse' }), once, 'expanding twice changes nothing');
  assert.equal(once.split('-z "$PLUGIN_DIR"').length, 2, 'the check is there exactly once');
  assert.doesNotMatch(expandHookCommand(guard, { event: 'Stop' }), /-z "\$PLUGIN_DIR"/, 'exit 2 means something else on other events');
  assert.doesNotMatch(expandHookCommand(guard), /-z "\$PLUGIN_DIR"/, 'no event given: nothing is added');
  const advisory = 'x; PLUGIN_DIR=' + TOKEN + '; node "${PLUGIN_DIR}/scripts/hooks/a.mjs" 2>/dev/null; exit 0';
  assert.doesNotMatch(expandHookCommand(advisory, { event: 'PreToolUse' }), /-z "\$PLUGIN_DIR"/);
});

test('guards: the manifest is still exactly the generator\'s output, check included', () => {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  assert.deepEqual(checkManifestText(text), []);
  assert.equal(generateManifestText(text), text);
});

function noPluginMachine(t) {
  // A machine where only the git-marketplace copy is registered: the bootstrap answers with nothing.
  const m = machine(t);
  const gitCopy = m.plugin('great-cto', '9.9.9');
  m.register({ 'great_cto@great-cto': [{ scope: 'user', installPath: gitCopy, version: '9.9.9' }] });
  assert.equal(m.resolve(), '', 'precondition: PLUGIN_DIR is empty on this machine');
  return m;
}
const runHook = (command, m, env = {}, input = '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}') => spawnSync('bash', ['-c', command], {
  encoding: 'utf8', cwd: m.home, input, env: { PATH: process.env.PATH, HOME: m.home, ...env },
});

test('guards: with PLUGIN_DIR unresolvable every one of the six blocks, in the format the guards themselves use', (t) => {
  const m = noPluginMachine(t);
  const blocking = preToolUse().filter((c) => c.includes(EXIT_TWO));
  assert.equal(blocking.length, 6);
  for (const command of blocking) {
    const r = runHook(command, m);
    const name = scriptOf(command);
    assert.equal(r.status, 2, `${name} let the call through (status ${r.status}): ${r.stderr}`);
    const decision = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(decision.hookEventName, 'PreToolUse', name);
    assert.equal(decision.permissionDecision, 'deny', name);
    assert.match(decision.permissionDecisionReason, /plugin dir not resolved/, name);
    assert.match(r.stderr, /plugin dir not resolved/, `${name}: exit 2 shows stderr to the model`);
    assert.match(r.stderr, /great-cto init/, `${name}: and says what to do`);
    assert.doesNotMatch(r.stderr, /npx/, `${name}: the message names no fetching program, or the boundary check would refuse the manifest`);
  }
});

test('guards: with the plugin found the same hooks run their guard and let a harmless call through', (t) => {
  const m = machine(t);
  const blocking = preToolUse().filter((c) => c.includes(EXIT_TWO));
  for (const command of blocking) {
    const r = runHook(command, m, { CLAUDE_PLUGIN_ROOT: ROOT });
    assert.equal(r.status, 0, `${scriptOf(command)} blocked a harmless call: ${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stdout + r.stderr, /plugin dir not resolved/);
  }
});

test('guards: a hook that is not a guard still does nothing, quietly, when PLUGIN_DIR is empty', (t) => {
  const m = noPluginMachine(t);
  const advisory = preToolUse().find((c) => scriptOf(c) === 'edit-impact');
  assert.ok(advisory, 'the advisory hook exists');
  const r = runHook(advisory, m);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
