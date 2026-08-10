// The privacy guard was installed, executable, current — and never ran.
//
// `core.hooksPath` pointed at `~/development/great_cto/.git/hooks`, the place
// this repository lived before it moved under `Personal/`. Git honours that
// setting even when the directory is gone, so it ran no hooks at all. Three
// private project names reached a public remote, and the only evidence anyone
// had was an installer that had once printed "installed pre-push hook".
//
// Every test here is about the same property: not installed and passed must not
// produce the same answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { effectiveHooksDir, prePushStatus } from './hook-install.mjs';

function repo({ hooksPath = null, hook = null, mode = 0o755 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-hookcheck-'));
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { stdio: 'ignore' });
  if (hooksPath) execFileSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: dir, stdio: 'ignore' });
  if (hook !== null) {
    const hooks = hooksPath && path.isAbsolute(hooksPath) ? hooksPath : path.join(dir, hooksPath || '.git/hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, 'pre-push'), hook);
    fs.chmodSync(path.join(hooks, 'pre-push'), mode);
  }
  // A source to compare against, so "stale" is distinguishable from "current".
  fs.mkdirSync(path.join(dir, 'scripts', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts', 'hooks', 'pre-push.sh'), '#!/usr/bin/env bash\necho guard\n');
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

test('a hooksPath pointing at a directory that is gone is reported, not ignored', () => {
  // The exact failure. Nothing about the hook file is wrong; git is simply
  // looking somewhere else.
  const dir = repo({ hooksPath: '/nonexistent/elsewhere/hooks' });
  try {
    const s = prePushStatus(dir);
    assert.equal(s.state, 'unreachable');
    assert.match(s.why, /does not exist/);
    assert.match(s.remedy, /core\.hooksPath/, 'and it must say how to fix it');
  } finally { clean(dir); }
});

test('a repository with no hook at all says missing, not ok', () => {
  const dir = repo();
  try { assert.equal(prePushStatus(dir).state, 'missing'); } finally { clean(dir); }
});

test('a hook that is not executable is skipped by git, so it is not ok either', () => {
  const dir = repo({ hook: '#!/usr/bin/env bash\necho guard\n', mode: 0o644 });
  try {
    const s = prePushStatus(dir);
    assert.equal(s.state, 'not-executable');
    assert.match(s.why, /silently/);
  } finally { clean(dir); }
});

test('a hook that has drifted from the source is stale, which is its own answer', () => {
  // It runs. It enforces the rules of whenever it was copied.
  const dir = repo({ hook: '#!/usr/bin/env bash\necho an older guard\n' });
  try { assert.equal(prePushStatus(dir).state, 'stale'); } finally { clean(dir); }
});

test('the current hook in the place git reads is ok', () => {
  const dir = repo({ hook: '#!/usr/bin/env bash\necho guard\n' });
  try {
    const s = prePushStatus(dir);
    assert.equal(s.state, 'ok', s.why);
  } finally { clean(dir); }
});

test('a hooksPath that exists and holds the hook is honoured', () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-hooks-elsewhere-'));
  const dir = repo({ hooksPath: elsewhere, hook: '#!/usr/bin/env bash\necho guard\n' });
  try {
    assert.equal(effectiveHooksDir(dir), elsewhere, 'the configured path wins over .git/hooks');
    assert.equal(prePushStatus(dir).state, 'ok');
  } finally { clean(dir); clean(elsewhere); }
});

test('a directory that is not a repository is not a failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-plain-'));
  try { assert.equal(prePushStatus(dir).state, 'not-a-repo'); } finally { clean(dir); }
});
