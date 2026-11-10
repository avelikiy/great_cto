// The board as a user gets it: `npm pack` the CLI, install the tarball into an
// empty prefix, start the board from node_modules, and run the browser and
// contract tests against THAT copy instead of the source tree.
//
// The source tree has every file; the tarball has only what `files` and the
// prepack bundler (packages/cli/scripts/bundle-board.mjs) put in it. A module the
// bundle forgot, an asset outside `files`, a path that resolves only inside the
// repository — each works in every other test and breaks for every user. The
// stranger-install test checks the shape of the build; this one starts it.
//
// Runs in the full gate (--e2e). npm and a built CLI (packages/cli/dist) are
// required; the package has no runtime dependencies, so nothing is downloaded.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'packages', 'cli');
// Tests that start a board through the shared helpers, which honour BOARD_SERVER_ENTRY.
const SUITES = ['tests/e2e/controls-wired.e2e.test.mjs', 'packages/board/openapi-contract.test.mjs'];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-installed-'));
after(() => fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

// A test run inside `node --test` must start the child as a top-level run.
const childEnv = (extra) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };

test('the board installed from the npm tarball starts, wires every control and keeps its HTTP contract', { timeout: 900000 }, (t) => {
  if (!fs.existsSync(path.join(CLI, 'dist', 'main.js'))) return t.skip('packages/cli is not built — not checked, not passed');
  const home = path.join(work, 'home'); fs.mkdirSync(home);
  const prefix = path.join(work, 'prefix'); fs.mkdirSync(prefix);
  const npm = (args, cwd) => spawnSync('npm', args, { cwd, encoding: 'utf8', env: childEnv({ HOME: home, npm_config_cache: path.join(work, 'npm-cache'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' }), timeout: 300000 });

  const pack = npm(['pack', '--json', '--pack-destination', work], CLI);
  assert.equal(pack.status, 0, `npm pack failed:\n${pack.stderr.slice(-2000)}`);
  const tarball = path.join(work, JSON.parse(pack.stdout.slice(pack.stdout.indexOf('[')))[0].filename);

  const install = npm(['install', '--prefix', prefix, '--offline', '--no-save', tarball], work);
  assert.equal(install.status, 0, `npm install of the tarball failed:\n${install.stderr.slice(-2000)}`);
  const entry = path.join(prefix, 'node_modules', 'great-cto', 'board', 'packages', 'board', 'server.mjs');
  assert.ok(fs.existsSync(entry), `the installed package has no board at ${path.relative(prefix, entry)}`);

  const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...SUITES], {
    cwd: ROOT, encoding: 'utf8', env: childEnv({ BOARD_SERVER_ENTRY: entry }), timeout: 600000,
  });
  const out = `${run.stdout}\n${run.stderr}`;
  console.log(out.split('\n').filter((l) => /^[✔✖﹣ℹ]|skipped|controls checked/.test(l.trim())).join('\n'));
  assert.equal(run.status, 0, `tests against the installed board failed:\n${out.slice(-4000)}`);
  assert.doesNotMatch(out, /ℹ skipped [1-9]/, 'a suite skipped against the installed board — not checked, not passed');
});
