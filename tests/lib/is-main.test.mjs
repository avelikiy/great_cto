// great_cto-hu2l: a CLI started through a symlinked path must still run.
//
// The old guards compared process.argv[1] with import.meta.url as strings. Node
// resolves the module URL through symlinks and leaves argv[1] as typed, so a
// script reached through /var → /private/var, /tmp → /private/tmp or a plugin
// cache link did nothing and exited 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainModule } from '../../scripts/lib/is-main.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A directory whose path differs from its real path: a link to the repo, made
// under the temp dir (itself a link on macOS, which only widens the gap).
function linkedRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-is-main-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const link = path.join(dir, 'repo');
  fs.symlinkSync(ROOT, link, 'dir');
  assert.notEqual(link, fs.realpathSync(link), 'the test needs a path that goes through a link');
  return { dir, link };
}

const run = (file, args, env = {}) => spawnSync(process.execPath, [file, ...args], {
  encoding: 'utf8', timeout: 20_000, env: { ...process.env, ...env },
});

test('isMainModule: the same file through a symlink is the main module', (t) => {
  const { link } = linkedRepo(t);
  const real = path.join(ROOT, 'scripts/lib/is-main.mjs');
  const viaLink = path.join(link, 'scripts/lib/is-main.mjs');
  assert.equal(isMainModule(pathToFileURL(real).href, viaLink), true);
  assert.equal(isMainModule(pathToFileURL(viaLink).href, real), true);
  assert.equal(isMainModule(pathToFileURL(real).href, real), true);
});

test('isMainModule: another file, a missing path or no argv[1] is not', () => {
  const url = pathToFileURL(path.join(ROOT, 'scripts/lib/is-main.mjs')).href;
  assert.equal(isMainModule(url, path.join(ROOT, 'scripts/lib/release-lease.mjs')), false);
  assert.equal(isMainModule(url, path.join(ROOT, 'scripts/lib/no-such-file.mjs')), false, 'a failed realpath is false, not a string guess');
  assert.equal(isMainModule(pathToFileURL(path.join(ROOT, 'nope.mjs')).href, path.join(ROOT, 'nope.mjs')), false);
  assert.equal(isMainModule(url, undefined), false);
  assert.equal(isMainModule(url, ''), false);
});

test('a CLI started through a symlinked path runs and prints its answer', (t) => {
  const { link } = linkedRepo(t);
  const r = run(path.join(link, 'scripts/lib/approval-level.mjs'), ['auto', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.trim(), 'the CLI printed nothing: its main guard did not see itself');
  assert.equal(JSON.parse(r.stdout).level, 'auto');
});

test('release-lease status through a symlinked path answers, not exit 0 with nothing', (t) => {
  const { dir, link } = linkedRepo(t);
  const r = run(path.join(link, 'scripts/lib/release-lease.mjs'), ['status', '--version', '9.9.9'],
    { GREAT_CTO_HOME: path.join(dir, 'home') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).state, 'FREE');
});

test('the old string guard does nothing through the same link (the test reproduces the bug)', (t) => {
  const { dir } = linkedRepo(t);
  const realDir = path.join(dir, 'real');
  fs.mkdirSync(realDir);
  fs.symlinkSync(realDir, path.join(dir, 'via'), 'dir');
  const body = (guard) => `${guard ? 'import { isMainModule } from ' + JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts/lib/is-main.mjs')).href) + ';\n' : ''}`
    + `if (${guard ? 'isMainModule(import.meta.url)' : 'import.meta.url === `file://${process.argv[1]}`'}) console.log('ran');\n`;
  fs.writeFileSync(path.join(realDir, 'old.mjs'), body(false));
  fs.writeFileSync(path.join(realDir, 'new.mjs'), body(true));
  assert.equal(run(path.join(dir, 'via', 'old.mjs'), []).stdout, '', 'old guard: silently skipped, exit 0');
  assert.equal(run(path.join(dir, 'via', 'new.mjs'), []).stdout.trim(), 'ran');
});
