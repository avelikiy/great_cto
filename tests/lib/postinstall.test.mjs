// great-cto ships as two things — an npm package and a Claude Code plugin —
// that update through different channels. `npm i -g great-cto` moves one and
// nothing moves the other, so a user upgrades, sees a new version, and runs a
// pipeline whose agents are three releases behind. Nothing errors: the board
// opens, the agents run, the verdicts get written, by the old code.
//
// The hook that was supposed to notice was five lines of comment and a no-op.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cmpVersion, newestPluginVersion, compare, message }
  from '../../packages/cli/postinstall.mjs';

const HOOK = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'cli', 'postinstall.mjs');

function cache(layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-pi-'));
  for (const [marketplace, versions] of Object.entries(layout)) {
    for (const v of versions) {
      fs.mkdirSync(path.join(root, marketplace, 'great_cto', v), { recursive: true });
    }
  }
  return root;
}

test('versions compare numerically, not as strings', () => {
  // The bug this exists to prevent: '3.9.0' > '3.10.0' as strings, so the
  // machine reports itself up to date one minor release before it is.
  assert.ok(cmpVersion('3.10.0', '3.9.0') > 0);
  assert.ok(cmpVersion('3.14.0', '3.2.0') > 0);
  assert.equal(cmpVersion('3.14.0', '3.14.0'), 0);
});

test('the newest version is found across every marketplace, not just `local`', () => {
  // Someone who installed the plugin from their own marketplace has a working
  // setup. Looking only in `local` would report them as having no plugin and
  // tell them to install one they already have.
  const root = cache({ local: ['3.13.0', '3.9.0'], acme: ['3.14.0'] });
  assert.equal(newestPluginVersion(root), '3.14.0');
});

test('a directory that is not a version is not a version', () => {
  const root = cache({ local: ['3.13.0', 'node_modules', '.DS_Store'] });
  assert.equal(newestPluginVersion(root), '3.13.0');
});

test('three states, and only one of them is worth saying out loud', () => {
  assert.equal(compare({ cli: '3.15.0', plugin: '3.14.0' }).state, 'stale');
  assert.equal(compare({ cli: '3.14.0', plugin: '3.14.0' }).state, 'current');

  // A plugin NEWER than the CLI is `current`, not a second warning. It happens
  // between a plugin update and the npm install that follows it, and shouting
  // about a state that resolves itself in thirty seconds is how a notice gets
  // ignored when it matters.
  assert.equal(compare({ cli: '3.14.0', plugin: '3.15.0' }).state, 'current');

  // No plugin at all is a correct CLI-only installation. Telling that user to
  // update a plugin they never installed is the false alarm that teaches
  // people to stop reading installer output.
  assert.equal(compare({ cli: '3.14.0', plugin: null }).state, 'no-plugin');
});

test('the message names both versions and the one command that fixes it', () => {
  const m = message({ cli: '3.15.0', plugin: '3.14.0' });
  assert.match(m, /3\.15\.0/);
  assert.match(m, /3\.14\.0/);
  assert.match(m, /\/plugin update great_cto/);
});

test('a missing home, an unreadable cache, and CI all exit 0 and say nothing', () => {
  // A postinstall hook that throws fails `npm i`. Whatever is wrong with the
  // machine, the install must complete.
  const run = (env) => execFileSync(process.execPath, [HOOK], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(run({ HOME: path.join(os.tmpdir(), 'gcto-nonexistent-home') }).trim(), '');
  assert.equal(run({ CI: '1' }).trim(), '');
  assert.equal(run({ GREAT_CTO_QUIET_POSTINSTALL: '1' }).trim(), '');
});

test('a stale plugin is actually reported when the hook runs for real', () => {
  // The whole point, end to end: the hook must print when it should, or every
  // test above is asserting on machinery nothing reaches.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-home-'));
  const pkg = JSON.parse(fs.readFileSync(
    path.join(path.dirname(HOOK), 'package.json'), 'utf8'));
  // One below whatever this package currently is, so the fixture cannot go
  // stale the next time the version is bumped.
  const older = (() => { const p = pkg.version.split('.'); p[1] = String(Math.max(0, Number(p[1]) - 1)); return p.join('.'); })();
  fs.mkdirSync(path.join(home, '.claude/plugins/cache/local/great_cto', older), { recursive: true });

  const out = execFileSync(process.execPath, [HOOK], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CI: '', GREAT_CTO_QUIET_POSTINSTALL: '' },
  });
  assert.match(out, new RegExp(older.replace(/\./g, '\\.')));
  assert.match(out, /\/plugin update great_cto/);
});
