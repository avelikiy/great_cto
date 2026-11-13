// Isolated-HOME E2E, part 1: the real `great-cto init` on a fresh machine, again, on an upgrade, and
// against hosts that are not as clean as a fixture. See harness.mjs for what is real and what is not.
//
// Run: node --test tests/e2e/plugin-activation/*.test.mjs   (needs packages/cli built)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  newMachine, buildPackage, runInit, paths, versionDir, seedHost, readHost, snapshot, inventoryOf, executions,
  journals, stateRecords, PHASES, PLUGIN_KEY, tail,
} from './harness.mjs';

const strays = machine => Object.keys(snapshot(machine.claudeDir)).filter(key => /\.(bak|tmp)$|great-cto-.*\.bak|\.stage-/.test(key));

test('fresh machine: init publishes exactly the admitted bytes and registers them', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 0, tail(run.output));
  const p = paths(machine), dir = versionDir(machine, '3.72.0');

  // The directory on disk is the signed inventory — recomputed here, not by the adapter's own walker.
  assert.deepEqual(inventoryOf(dir), pkg.set.inventory.files);
  assert.deepEqual(fs.readdirSync(p.cacheRoot), ['3.72.0'], 'no stage directory is left behind');

  const host = readHost(machine), entries = host.registry.plugins[PLUGIN_KEY];
  assert.deepEqual(entries.map(e => [e.scope, e.installPath, e.version, e.localContentSha256]), [['user', dir, '3.72.0', pkg.set.inventoryDigest]]);
  assert.equal(entries[0].gitCommitSha, undefined, 'an admitted snapshot is identified by its inventory, not by a commit it was never cloned from');
  assert.equal(host.settings.enabledPlugins[PLUGIN_KEY], true);
  assert.deepEqual(host.marketplace.plugins.map(e => [e.name, e.source, e.version]), [['great_cto', dir, '3.72.0']]);
  assert.equal(fs.existsSync(p.knownMarketplaces), false, 'known_marketplaces.json is never written');
  assert.deepEqual(strays(machine), [], 'no backup or temporary file beside the host files');
  assert.deepEqual(journals(machine).map(j => j.phases), [PHASES]);
  assert.deepEqual(fs.readdirSync(machine.home).sort(), ['.claude', '.great_cto']);
  assert.ok(fs.existsSync(path.join(run.project, '.great_cto', 'PROJECT.md')), 'init went on to bootstrap the project');
});

test('fresh machine: the first install states what it does not prove', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 0, tail(run.output));
  assert.match(run.output, /First install: these bytes, their verifier and the pinned key all came from npm/);
  assert.match(run.output, /authenticity rests on the npm registry/);
  assert.doesNotMatch(run.output, /OIDC|provenance|transparency|Rekor|Sigstore|Fulcio|SLSA|attest/i);
});

test('fresh machine: the smoke is the only run of candidate bytes and inherits no environment', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 0, tail(run.output));
  const ran = executions(pkg);
  assert.equal(ran.length, 1);
  assert.deepEqual(ran[0].argv, ['--version']);
  const inherited = ran[0].envKeys.filter(key => !['PATH', 'HOME', 'GREAT_CTO_NO_BOARD', 'GREAT_CTO_QUIET_POSTINSTALL'].includes(key) && !key.startsWith('__CF'));
  assert.deepEqual(inherited, [], 'the smoke inherits no plugin, credential or runner environment');
});

test('a second init is ALREADY_ACTIVE and rewrites nothing under the Claude directory', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  assert.equal(runInit(machine, pkg).status, 0);
  const before = snapshot(machine.claudeDir, { times: true });
  const again = runInit(machine, pkg);
  assert.equal(again.status, 0, tail(again.output));
  assert.match(again.output, /already active at/);
  assert.doesNotMatch(again.output, /First install:/, 'the trust statement belongs to the activation that happened');
  assert.deepEqual(snapshot(machine.claudeDir, { times: true }), before, 'not a byte, mode or timestamp changed');
  assert.equal(executions(pkg).length, 1, 'a no-op activation does not run the candidate again');
});

test('upgrade from an older admitted version repoints all three host files, keeps the previous version directory and every other plugin', t => {
  const machine = newMachine(t); seedHost(machine);
  const older = buildPackage(machine, { version: '3.71.0' }), newer = buildPackage(machine, { version: '3.72.0' });
  assert.equal(runInit(machine, older).status, 0);
  const first = readHost(machine).registry.plugins[PLUGIN_KEY][0];

  const run = runInit(machine, newer);
  assert.equal(run.status, 0, tail(run.output));
  const host = readHost(machine), entry = host.registry.plugins[PLUGIN_KEY][0];
  assert.deepEqual([entry.version, entry.installPath, entry.localContentSha256], ['3.72.0', versionDir(machine, '3.72.0'), newer.set.inventoryDigest]);
  assert.equal(entry.installedAt, first.installedAt, 'the original install time is kept');
  assert.deepEqual(host.registry.plugins['other@market'], [{ scope: 'user', installPath: '/x', version: '1.0.0' }]);
  assert.deepEqual(host.settings, { theme: 'dark', enabledPlugins: { 'other@market': true, [PLUGIN_KEY]: true } });
  assert.deepEqual(host.marketplace.plugins.map(e => [e.name, e.source]), [['other', '/y'], ['great_cto', versionDir(machine, '3.72.0')]]);
  assert.deepEqual(fs.readdirSync(paths(machine).cacheRoot).sort(), ['3.71.0', '3.72.0']);
  assert.deepEqual(inventoryOf(versionDir(machine, '3.71.0')), older.set.inventory.files, 'the previous version directory is untouched');
  assert.deepEqual(inventoryOf(versionDir(machine, '3.72.0')), newer.set.inventory.files);
  assert.equal(stateRecords(machine).watermark.version, '3.72.0');
  assert.deepEqual(strays(machine), []);
});

test('a downgrade below the activated version is refused and writes nothing', t => {
  const machine = newMachine(t), newer = buildPackage(machine, { version: '3.72.0' }), older = buildPackage(machine, { version: '3.71.0' });
  assert.equal(runInit(machine, newer).status, 0);
  const before = snapshot(machine.claudeDir, { times: true });
  const run = runInit(machine, older);
  assert.equal(run.status, 1, tail(run.output));
  assert.match(run.output, /candidate-below-watermark/);
  assert.match(run.output, /A newer version was already activated here/);
  assert.deepEqual(snapshot(machine.claudeDir, { times: true }), before);
  assert.equal(executions(older).length, 0, 'the refused candidate never ran');
});

test('the shipped build refuses a fixture-signed set: no key but the enrolled one is accepted, and nothing is written', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0', pin: null });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 1, tail(run.output));
  assert.match(run.output, /embedded-release-key-(not-enrolled|refused)/);
  assert.deepEqual(fs.readdirSync(machine.claudeDir), [], 'the Claude directory is as empty as it was');
  assert.deepEqual(fs.readdirSync(machine.home).filter(name => name !== '.claude'), [], 'nothing else appeared in HOME');
  assert.equal(executions(pkg).length, 0);
  assert.equal(fs.existsSync(path.join(run.project, '.great_cto')), false, 'init stopped before bootstrapping the project');
});

test('unparseable settings.json: init refuses by name before anything is written', t => {
  const machine = newMachine(t); seedHost(machine);
  const p = paths(machine), pkg = buildPackage(machine, { version: '3.72.0' });
  fs.writeFileSync(p.settings, '{ not json');
  const before = snapshot(machine.claudeDir, { times: true });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 1, tail(run.output));
  assert.match(run.output, /settings-unparseable/);
  assert.match(run.output, /"enabledPlugins": \{ "great_cto@local": true \}/, 'the refusal names the one key to add by hand');
  assert.deepEqual(snapshot(machine.claudeDir, { times: true }), before);
  assert.equal(executions(pkg).length, 0);
  fs.writeFileSync(p.settings, '{}\n');
  assert.equal(runInit(machine, pkg).status, 0, 'a refusal leaves no lock or pending recovery behind');
});

test('same version, different bytes in the cache directory: refused, the directory is not rewritten', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  assert.equal(runInit(machine, pkg).status, 0);
  const tampered = path.join(versionDir(machine, '3.72.0'), 'packages', 'board', 'server.mjs');
  fs.writeFileSync(tampered, '// not what was signed\n');
  const before = snapshot(machine.claudeDir, { times: true });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 1, tail(run.output));
  assert.match(run.output, /cache-version-conflict/);
  assert.match(run.output, /Move that directory away/);
  assert.deepEqual(snapshot(machine.claudeDir, { times: true }), before);
  assert.equal(fs.readFileSync(tampered, 'utf8'), '// not what was signed\n', 'the existing directory is a conflict, not something to overwrite');
});

test('a great_cto registration from another marketplace is reported and left untouched, known_marketplaces.json included', t => {
  const machine = newMachine(t); seedHost(machine);
  const p = paths(machine), pkg = buildPackage(machine, { version: '3.72.0' });
  const registry = JSON.parse(fs.readFileSync(p.registry, 'utf8'));
  registry.plugins['great_cto@great-cto'] = [{ scope: 'user', installPath: '/somewhere/else/great_cto/3.70.1', version: '3.70.1', gitCommitSha: 'c'.repeat(40) }];
  fs.writeFileSync(p.registry, JSON.stringify(registry, null, 2) + '\n');
  fs.writeFileSync(p.knownMarketplaces, JSON.stringify({ 'great-cto': { source: { source: 'github', repo: 'avelikiy/great_cto' } } }, null, 2) + '\n');
  const known = { bytes: fs.readFileSync(p.knownMarketplaces), mtimeMs: fs.statSync(p.knownMarketplaces).mtimeMs };

  const run = runInit(machine, pkg);
  assert.equal(run.status, 0, tail(run.output));
  assert.match(run.output, /also registered as great_cto@great-cto/);
  assert.match(run.output, /\/somewhere\/else\/great_cto\/3\.70\.1/);
  assert.match(run.output, /without a signature check/);
  const after = JSON.parse(fs.readFileSync(p.registry, 'utf8'));
  assert.deepEqual(after.plugins['great_cto@great-cto'], registry.plugins['great_cto@great-cto'], 'the other registration is reported, not modified');
  assert.equal(after.plugins[PLUGIN_KEY][0].version, '3.72.0');
  assert.ok(fs.readFileSync(p.knownMarketplaces).equals(known.bytes));
  assert.equal(fs.statSync(p.knownMarketplaces).mtimeMs, known.mtimeMs, 'known_marketplaces.json was not written');
});

test('a planted verifier under a plugin cache and CLAUDE_PLUGIN_ROOT is never imported', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const marker = path.join(machine.markers, 'planted.log');
  const plant = (root) => {
    for (const dist of [path.join(root, 'packages', 'cli', 'dist'), path.join(root, 'dist')]) {
      fs.mkdirSync(dist, { recursive: true });
      for (const name of ['release-trust.mjs', 'plugin-activation.mjs', 'release-transaction.mjs', 'release-archive.mjs', 'state-home.mjs', 'main.js']) {
        fs.writeFileSync(path.join(dist, name), `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(path.join(dist, name))} + '\\n');\n`);
      }
    }
  };
  const cached = path.join(paths(machine).cacheRoot, '9.9.9'), rooted = path.join(machine.root, 'planted-root');
  plant(cached); plant(rooted);
  const run = runInit(machine, pkg, { env: { CLAUDE_PLUGIN_ROOT: rooted } });
  assert.equal(run.status, 0, tail(run.output));
  assert.equal(fs.existsSync(marker), false, 'a module planted where the plugin lives was evaluated');
  assert.equal(readHost(machine).registry.plugins[PLUGIN_KEY][0].version, '3.72.0', 'the genuine verifier admitted the genuine set');
});

test('neither companion on PATH: init completes, names both, installs neither', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const missing = spawnSync('bd', ['--version'], { env: { PATH: `${machine.bin}:/usr/bin:/bin` } });
  assert.equal(missing.error?.code, 'ENOENT', 'precondition: this test needs a PATH without bd');
  const run = runInit(machine, pkg);
  assert.equal(run.status, 0, tail(run.output));
  assert.match(run.output, /beads/i);
  assert.match(run.output, /superpowers/i);
  assert.match(run.output, /Both are optional and installed by you, not by great_cto/);
  const named = Object.keys(snapshot(machine.home)).map(key => key.split('/').pop()).filter(name => /^(beads|superpowers)([-_.]|$)/i.test(name));
  assert.deepEqual(named, [], 'nothing for either companion appeared under HOME');
  assert.deepEqual(fs.readdirSync(path.join(paths(machine).plugins, 'cache')), ['local']);
  assert.ok(fs.existsSync(path.join(run.project, '.great_cto', 'PROJECT.md')), 'init completed without them');
});

// Claude Code may never have run on a new machine. `init` creates ~/.claude itself, private (0700),
// and activates; it does not fail on the missing directory.
test('a machine with no ~/.claude yet: init creates it private and activates', t => {
  const machine = newMachine(t, { claudeDir: false }), pkg = buildPackage(machine, { version: '3.72.0' });
  const run = runInit(machine, pkg);
  assert.equal(run.status, 0, tail(run.output));
  assert.equal(fs.statSync(machine.claudeDir).mode & 0o777, 0o700, '~/.claude is created owner-only');
  assert.deepEqual(inventoryOf(versionDir(machine, '3.72.0')), pkg.set.inventory.files);
});
