import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installLocalCache } from '../../scripts/lib/local-install-cache.mjs';
import { registerLocalPlugin } from '../../scripts/lib/local-install-registry.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));

// Execute the real install preflight/sync section with fixture paths, never HOME.
function fixture(t, version) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-install-target-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const cache = path.join(root, 'cache');
  const marker = path.join(root, 'rsync-called');
  fs.mkdirSync(path.join(source, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'scripts/lib'), { recursive: true });
  fs.writeFileSync(path.join(source, '.claude-plugin/plugin.json'), JSON.stringify({ version }));
  for (const name of ['local-install-target.mjs', 'local-install-cache.mjs', 'local-install-registry.mjs']) {
    fs.copyFileSync(path.join(repo, 'scripts/lib', name), path.join(source, 'scripts/lib', name));
  }
  for (const name of ['skills/great_cto/ARCHETYPES.md', 'skills/great_cto/SKILL.md',
    'agents/architect.md', 'scripts/hooks/auto-attach-reviewers.mjs', 'commands/start.md']) {
    fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    fs.writeFileSync(path.join(source, name), 'fixture\n');
  }
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=avelikiy', '-c', 'user.email=avelikiy@users.noreply.github.com', 'commit', '-qm', 'fixture');
  const registry = path.join(root, 'installed_plugins.json');
  fs.writeFileSync(registry, JSON.stringify({ version: 2, plugins: {} }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  for (const command of ['rsync', 'lsof', 'claude', 'codex']) {
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh\nprintf called > '${marker}'\nexit 1\n`, { mode: 0o755 });
  }
  const script = fs.readFileSync(path.join(repo, 'scripts/install-local.sh'), 'utf8')
    .replace(/^ROOT=.*$/m, `ROOT='${source}'`)
    .replace(/^CACHE_ROOT=.*$/m, `CACHE_ROOT='${cache}'`)
    .replace(/^REG=.*$/m, `REG='${registry}'`);
  const run = (args = ['--no-register']) => spawnSync('bash', ['-c', script, 'install-fixture', ...args], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { root, source, cache, registry, marker, run, git };
}

for (const version of ['', '../..', '.', '/tmp/escape', '3.48.0/../../escape',
  undefined, null, 348, {}, '01.2.3', '3.48', '3.48.0\n', '3.48.0-01', 'v3.48.0']) {
  test(`installer refuses unsafe version ${JSON.stringify(version)} before writes`, (t) => {
    const f = fixture(t, version);
    const result = f.run();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(f.cache), false, 'must not create cache');
    assert.equal(fs.existsSync(f.marker), false, 'must not call rsync');
  });
}

for (const version of ['3.48.0', '3.48.1-rc.1+build.42']) {
  test(`installer accepts safe version ${version}`, (t) => {
    const f = fixture(t, version);
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.statSync(path.join(f.cache, version)).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(f.cache, version, '.great-cto-local-install.json')), true);
  });
}

for (const target of ['cache', 'destination', 'dangling-destination', 'file-destination']) {
  test(`installer refuses ${target} redirection before sync`, (t) => {
    const f = fixture(t, '3.48.0');
    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'unchanged');
    if (target === 'cache') fs.symlinkSync(outside, f.cache);
    else {
      fs.mkdirSync(f.cache);
      const dest = path.join(f.cache, '3.48.0');
      if (target === 'file-destination') fs.writeFileSync(dest, 'not a directory');
      else fs.symlinkSync(target === 'destination' ? outside : path.join(f.root, 'absent'), dest);
    }
    const result = f.run();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(f.marker), false);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'unchanged');
  });
}

for (const manifest of ['missing', 'malformed']) {
  test(`installer refuses ${manifest} manifest before writes`, (t) => {
    const f = fixture(t, '3.48.0');
    const file = path.join(f.source, '.claude-plugin/plugin.json');
    if (manifest === 'missing') fs.unlinkSync(file);
    else fs.writeFileSync(file, '{broken');
    assert.notEqual(f.run().status, 0);
    assert.equal(fs.existsSync(f.cache), false);
    assert.equal(fs.existsSync(f.marker), false);
  });
}

test('existing incomplete version is refused without mutation', (t) => {
  const f = fixture(t, '3.48.0');
  fs.mkdirSync(path.join(f.cache, '3.48.0'), { recursive: true });
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(f.cache, '3.48.0')), []);
});

test('new cache publishes checked files, repeated install is immutable and idempotent', (t) => {
  const f = fixture(t, '3.48.0');
  assert.equal(f.run().status, 0);
  const dest = path.join(f.cache, '3.48.0');
  const before = fs.statSync(path.join(dest, 'agents/architect.md')).mtimeMs;
  const second = f.run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /unchanged/);
  assert.equal(fs.statSync(path.join(dest, 'agents/architect.md')).mtimeMs, before);
  fs.writeFileSync(path.join(f.source, 'agents/architect.md'), 'changed\n');
  const conflict = f.run();
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /same version has different files/);
  assert.equal(fs.readFileSync(path.join(dest, 'agents/architect.md'), 'utf8'), 'fixture\n');
  assert.deepEqual(fs.readdirSync(f.cache), ['3.48.0']);
});

test('local secrets and untracked files are never copied', (t) => {
  const f = fixture(t, '3.48.0');
  for (const name of ['.env', '.env.production', '.env.example', 'secrets.key', '.claude/settings.local.json']) {
    fs.mkdirSync(path.dirname(path.join(f.source, name)), { recursive: true });
    fs.writeFileSync(path.join(f.source, name), 'fixture-secret');
    f.git('add', '-f', name);
  }
  fs.writeFileSync(path.join(f.source, 'untracked.txt'), 'not shipped');
  assert.equal(f.run().status, 0);
  const dest = path.join(f.cache, '3.48.0');
  for (const name of ['.env', '.env.production', 'secrets.key', '.claude/settings.local.json', 'untracked.txt']) {
    assert.equal(fs.existsSync(path.join(dest, name)), false, name);
  }
  assert.equal(fs.existsSync(path.join(dest, '.env.example')), true);
});

test('missing required tracked file and source symlink leave no version published', (t) => {
  for (const kind of ['missing', 'symlink']) {
    const f = fixture(t, '3.48.0');
    const file = path.join(f.source, 'agents/architect.md');
    fs.unlinkSync(file);
    if (kind === 'symlink') fs.symlinkSync(path.join(f.source, 'commands/start.md'), file);
    else f.git('rm', '--cached', 'agents/architect.md');
    assert.notEqual(f.run().status, 0);
    assert.equal(fs.existsSync(path.join(f.cache, '3.48.0')), false);
  }
});

test('an existing install lock is preserved and prevents publication', (t) => {
  const f = fixture(t, '3.48.0');
  const lock = path.join(f.cache, '.local-install-lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'owner'), 'other installer');
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(path.join(lock, 'owner'), 'utf8'), 'other installer');
  assert.equal(fs.existsSync(path.join(f.cache, '3.48.0')), false);
});

test('registration is atomic, backed up and preserves non-user entries', (t) => {
  const f = fixture(t, '3.48.0');
  const installed = installLocalCache({ source: f.source, cacheRoot: f.cache });
  const project = { scope: 'project', installPath: '/fixture/project', projectPath: '/fixture' };
  const before = { version: 2, plugins: { 'great_cto@local': [project], 'other@market': [{ scope: 'user' }] } };
  fs.writeFileSync(f.registry, JSON.stringify(before));
  const r = registerLocalPlugin({ registry: f.registry, dest: installed.dest, version: installed.version });
  assert.deepEqual(JSON.parse(fs.readFileSync(r.backup, 'utf8')), before);
  const after = JSON.parse(fs.readFileSync(f.registry, 'utf8'));
  assert.deepEqual(after.plugins['great_cto@local'][0], project);
  assert.deepEqual(after.plugins['other@market'], before.plugins['other@market']);
  assert.match(after.plugins['great_cto@local'][1].gitCommitSha, /^[a-f0-9]{40}$/);
  assert.match(after.plugins['great_cto@local'][1].localContentSha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(f.registry).mode & 0o777, 0o600);
  assert.equal(registerLocalPlugin({ registry: f.registry, dest: installed.dest, version: installed.version }).state, 'unchanged');
});

test('bad/missing registry fails before cache writes and never claims DONE', (t) => {
  for (const value of ['broken', 'missing', 'schema']) {
    const f = fixture(t, '3.48.0');
    if (value === 'missing') fs.unlinkSync(f.registry);
    else fs.writeFileSync(f.registry, value === 'schema' ? '{}' : '{broken');
    const r = f.run(['--no-agents']);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /INSTALL-LOCAL: DONE/);
    assert.equal(fs.existsSync(f.cache), false);
  }
});

test('managed-helper failure propagates without changing host registration', (t) => {
  const f = fixture(t, '3.48.0');
  fs.writeFileSync(path.join(f.source, 'scripts/lib/sync-managed.mjs'), 'process.exit(1);\n');
  f.git('add', 'scripts/lib/sync-managed.mjs');
  const before = fs.readFileSync(f.registry, 'utf8');
  const r = f.run([]);
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /INSTALL-LOCAL: DONE/);
  assert.equal(fs.readFileSync(f.registry, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(f.cache, '3.48.0')), true, 'immutable staged cache can remain after later failure');
});

test('local installer has no implicit board or marketplace side effects', (t) => {
  const script = fs.readFileSync(path.join(repo, 'scripts/install-local.sh'), 'utf8');
  assert.doesNotMatch(script, /board_stop|board_start|marketplace upgrade|marketplace update|rsync/);
  const f = fixture(t, '3.48.0');
  assert.equal(f.run().status, 0);
  assert.equal(fs.existsSync(f.marker), false, 'host commands and board owner probes must not run');
});

test('strict managed sync propagates missing source while SessionStart stays advisory', () => {
  const script = path.join(repo, 'scripts/lib/sync-managed.mjs');
  const base = ['--plugin-dir', '/nonexistent/great-cto-test-plugin'];
  assert.equal(spawnSync(process.execPath, [script, ...base]).status, 0);
  assert.equal(spawnSync(process.execPath, [script, ...base, '--strict']).status, 1);
});

test('cache-only publication cannot request destructive pruning of the previous selection', (t) => {
  const f = fixture(t, '3.48.0');
  const before = fs.readFileSync(f.registry, 'utf8');
  const result = f.run(['--no-register', '--prune']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be combined/);
  assert.equal(fs.existsSync(f.cache), false);
  assert.equal(fs.readFileSync(f.registry, 'utf8'), before);
});

test('strict sync reports partial side effects after a later write fails', (t) => {
  const f = fixture(t, '3.48.0');
  const home = path.join(f.root, 'managed-home');
  const agents = path.join(home, '.claude/agents');
  fs.mkdirSync(path.join(agents, 'great_cto-architect.md'), { recursive: true });
  const retired = path.join(agents, 'great_cto-retired.md');
  fs.writeFileSync(retired, '# old\n<!-- great_cto-managed -->\n');
  const helper = path.join(repo, 'scripts/lib/sync-managed.mjs');
  const url = new URL(`file://${helper}`).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import os from 'node:os';import {syncBuiltinESMExports} from 'node:module';
    os.homedir=()=>${JSON.stringify(home)};syncBuiltinESMExports();
    process.argv=[process.execPath,${JSON.stringify(helper)},'--plugin-dir',${JSON.stringify(f.source)},'--strict'];
    await import(${JSON.stringify(url)});
  `], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /partial copies or retirements may remain/);
  assert.equal(fs.existsSync(retired), false, 'reproduce a retirement before the write error');
});
