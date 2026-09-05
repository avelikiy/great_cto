// The SessionStart hook copies shared/orchestrator.toml and shared/pipeline.toml
// out of the installed plugin into the project, so every project runs the current
// contract. In a consumer project that is right. In THIS repository those files
// are the originals, and the copy overwrote them with whatever the plugin cache
// last held.
//
// It cost a change and hid while doing it. A multi-gate pipeline map was written,
// committed, and then reverted in the working tree by a session refresh — showing
// up as an ordinary uncommitted modification, which reads as "I edited this",
// not as "something overwrote this". The same modification was sitting there
// unexplained at the start of the session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const refreshCmd = manifest.hooks.SessionStart[0].hooks[0].command;

function runIn(dir) {
  execFileSync('bash', ['-c', refreshCmd], { cwd: dir, stdio: 'ignore' });
}

test('the refresh hook is the one that copies the shared contracts', () => {
  // If this moves to another hook entry, the guard below is testing nothing.
  assert.match(refreshCmd, /shared\/pipeline\.toml/);
  assert.match(refreshCmd, /shared\/orchestrator\.toml/);
});

test('a consumer project gets the contract refreshed from the plugin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-consumer-'));
  try {
    fs.mkdirSync(path.join(dir, 'shared'));
    fs.writeFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'stale\n');
    runIn(dir);
    const after = fs.readFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'utf8');
    assert.notEqual(after.trim(), 'stale', 'a project must receive the current pipeline map');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the plugin source tree is never overwritten with its own cached copy', () => {
  // The marker is the manifest: a directory holding .claude-plugin/plugin.json
  // named great_cto owns these files rather than consuming them.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-source-'));
  try {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
    // The REAL name from the shipped manifest, not a literal. This test wrote
    // `great_cto` while the plugin itself was renamed to kebab-case (ca0af925),
    // so the guard kept passing against a name nothing uses — while the hook,
    // which greps for the old spelling, quietly overwrote this repository's own
    // contracts on every session start. Nine times in one day before it was
    // traced: the file reverts, git status shows an ordinary modification, and
    // that reads as "I edited this".
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: manifest.name }, null, 2));
    const mine = '# edited in the source tree, not yet installed\n';
    fs.writeFileSync(path.join(dir, 'shared', 'pipeline.toml'), mine);
    runIn(dir);
    assert.equal(fs.readFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'utf8'), mine,
      'an uninstalled edit to the source of truth must survive a session start');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a project that merely has a plugin.json for something else is still refreshed', () => {
  // The guard keys on the plugin NAME, not on the file existing: a user
  // developing their own Claude Code plugin still consumes great_cto's contract.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-other-'));
  try {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'someone-elses-plugin' }));
    fs.writeFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'stale\n');
    runIn(dir);
    assert.notEqual(fs.readFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'utf8').trim(), 'stale');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
