// tests/hooks/pre-push.test.mjs — Integration tests for scripts/hooks/pre-push.sh
//
// Verifies the v2.37.1 range fix: a new branch that descends from already-pushed
// history must scan ONLY its new commits, not the entire history. A private term
// in an OLD (already-pushed) commit must NOT block; a term in a NEW commit must.
//
// Run: node --test tests/hooks/pre-push.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = join(__dirname, '..', '..', 'scripts', 'hooks', 'pre-push.sh');

function git(cwd, args, env = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

/**
 * Build a work repo + bare remote. `home` isolates the hook's stats writes.
 * Returns { work, bare, home }.
 */
function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), 'prepush-'));
  const home = join(root, 'home');
  const bare = join(root, 'remote.git');
  const work = join(root, 'work');
  mkdirSync(home, { recursive: true });
  spawnSync('git', ['init', '--bare', bare], { encoding: 'utf8' });
  spawnSync('git', ['init', '-b', 'main', work], { encoding: 'utf8' });
  const cfg = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' };
  git(work, ['config', 'user.email', 't@e.x']);
  git(work, ['config', 'user.name', 'T']);
  git(work, ['remote', 'add', 'origin', bare]);
  return { root, home, bare, work, cfg };
}

function commit(work, cfg, file, content, msg) {
  writeFileSync(join(work, file), content);
  git(work, ['add', '-A'], cfg);
  return git(work, ['commit', '-m', msg], cfg);
}

function installHook(work) {
  const dest = join(work, '.git', 'hooks', 'pre-push');
  copyFileSync(HOOK_SRC, dest);
  chmodSync(dest, 0o755);
}

// Push runs the local pre-push hook; HOME is isolated so its stats writes don't leak.
function push(work, home, ref) {
  return git(work, ['push', 'origin', ref], { HOME: home });
}

test('new branch: private term only in already-pushed history → PUSH ALLOWED (the fix)', () => {
  const { home, work, cfg } = setupRepo();

  // A: contains a private term, pushed to origin/main BEFORE the hook exists.
  commit(work, cfg, 'a.txt', 'hello', 'feat: wire up <private-project> sync');
  assert.equal(push(work, home, 'main').status, 0, 'baseline push should succeed (no hook yet)');

  // Now install the hook and branch off the pushed history with a CLEAN commit.
  installHook(work);
  git(work, ['checkout', '-b', 'feature/clean'], cfg);
  commit(work, cfg, 'b.txt', 'clean content', 'feat: add unrelated clean feature');

  const res = push(work, home, 'feature/clean');
  assert.equal(res.status, 0,
    `Expected ALLOWED (history must not be scanned). stdout+stderr:\n${res.stdout}\n${res.stderr}`);
  assert.ok(!/LEAK DETECTED/.test(res.stdout + res.stderr), 'must not flag the historical term');
});

test('new branch: private term in a NEW commit → PUSH BLOCKED (still catches real leaks)', () => {
  const { home, work, cfg } = setupRepo();

  commit(work, cfg, 'a.txt', 'hello', 'init clean');
  assert.equal(push(work, home, 'main').status, 0);

  installHook(work);
  git(work, ['checkout', '-b', 'feature/leak'], cfg);
  commit(work, cfg, 'c.txt', 'clean body', 'feat: integrate <private-project> engine'); // leak in NEW commit msg

  const res = push(work, home, 'feature/leak');
  assert.notEqual(res.status, 0, 'Expected BLOCKED for a new private-term commit');
  assert.ok(/LEAK DETECTED/.test(res.stdout + res.stderr), 'must report the leak');
});

test('new branch: private term in NEW diff content → PUSH BLOCKED', () => {
  const { home, work, cfg } = setupRepo();

  commit(work, cfg, 'a.txt', 'hello', 'init clean');
  assert.equal(push(work, home, 'main').status, 0);

  installHook(work);
  git(work, ['checkout', '-b', 'feature/diff-leak'], cfg);
  commit(work, cfg, 'd.txt', 'connecting to <private-project> backend', 'feat: clean message');

  const res = push(work, home, 'feature/diff-leak');
  assert.notEqual(res.status, 0, 'Expected BLOCKED for private term in diff');
  assert.ok(/LEAK DETECTED/.test(res.stdout + res.stderr));
});
