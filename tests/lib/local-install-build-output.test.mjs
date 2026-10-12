// The installed plugin's CLI could not start since the tracked-only snapshot
// (f94c9f2c): packages/cli/dist is a build output, ignored by Git, so it never
// reached the cache — `great-cto: dist/main.js not found`, and every pipeline
// suite step that runs the installed CLI went red (great_cto-6j5j).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installLocalCache } from '../../scripts/lib/local-install-cache.mjs';

function plugin(t, { cli = true, built = true, stale = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'install-dist-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const source = path.join(root, 'source');
  const write = (name, body = 'fixture\n') => { fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true }); fs.writeFileSync(path.join(source, name), body); };
  write('.claude-plugin/plugin.json', JSON.stringify({ version: '9.9.9' }));
  for (const name of ['skills/great_cto/ARCHETYPES.md', 'skills/great_cto/SKILL.md', 'agents/architect.md',
    'scripts/hooks/auto-attach-reviewers.mjs', 'commands/start.md']) write(name);
  if (cli) { write('packages/cli/index.mjs'); write('packages/cli/src/main.ts'); }
  fs.writeFileSync(path.join(source, '.gitignore'), 'packages/cli/dist/\n.env\n');
  if (cli && built) {
    write('packages/cli/dist/main.js', 'console.log("cli")\n');
    write('packages/cli/dist/lib/util.js');
  }
  write('.env', 'SECRET=1\n');
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' });
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=avelikiy', '-c', 'user.email=avelikiy@users.noreply.github.com', 'commit', '-qm', 'fixture');
  if (stale) {
    const past = new Date(Date.now() - 3600_000);
    for (const f of ['main.js', 'lib/util.js']) fs.utimesSync(path.join(source, 'packages/cli/dist', f), past, past);
  }
  return { source, cacheRoot: path.join(root, 'cache', 'great_cto') };
}

test('a built CLI reaches the installed plugin; secrets still do not', (t) => {
  const f = plugin(t);
  const r = installLocalCache(f);
  assert.equal(r.state, 'published');
  assert.ok(fs.existsSync(path.join(r.dest, 'packages/cli/dist/main.js')), 'dist/main.js installed');
  assert.ok(fs.existsSync(path.join(r.dest, 'packages/cli/dist/lib/util.js')), 'nested build files installed');
  assert.equal(fs.existsSync(path.join(r.dest, '.env')), false, 'ignored secrets are still not copied');
  const receipt = JSON.parse(fs.readFileSync(path.join(r.dest, '.great-cto-local-install.json'), 'utf8'));
  assert.ok(receipt.entries.some(e => e.path === 'packages/cli/dist/main.js'), 'the build output is in the receipt');
});

test('a plugin that ships a CLI is refused when the CLI is not built', (t) => {
  const f = plugin(t, { built: false });
  assert.throws(() => installLocalCache(f), /CLI is not built.*npm run build/);
  assert.equal(fs.existsSync(path.join(f.cacheRoot, '9.9.9')), false, 'nothing published');
});

test('a CLI build older than its source is refused', (t) => {
  const f = plugin(t, { stale: true });
  assert.throws(() => installLocalCache(f), /older than packages\/cli\/src/);
});

test('a plugin without a CLI installs as before', (t) => {
  const f = plugin(t, { cli: false });
  assert.equal(installLocalCache(f).state, 'published');
});

test('a symlink inside the build output is refused', (t) => {
  const f = plugin(t);
  fs.symlinkSync('/etc/hosts', path.join(f.source, 'packages/cli/dist/link.js'));
  assert.throws(() => installLocalCache(f), /symlink refused/);
});
