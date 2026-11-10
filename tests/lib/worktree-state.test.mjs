// senior-dev implemented a library in a git worktree on 2026-08-07: 381 lines
// plus 394 of tests, thirty passing. Its verdict went to the worktree's own
// .great_cto/ too, so the main tree saw an empty log and the pipeline read "no
// verdict recorded". The work was found because a `cp` happened to say "files
// are identical" — luck, not a mechanism, and worktrees are removed when the
// agent is done with them.
//
// The main tree looking clean reads as "the agent produced nothing" rather than
// "the agent produced something you cannot see". From the pipeline's side those
// are the same picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { worktreeChanges, worktreesWithChanges, unmergedCommits, explainWorktrees, WORKTREE_DIR } from '../../scripts/lib/worktree-state.mjs';

function repoWith(names) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-wt-'));
  for (const n of names) fs.mkdirSync(path.join(root, WORKTREE_DIR, n), { recursive: true });
  return root;
}
const clean = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} };

// ── reading one worktree ───────────────────────────────────────────────────

test('a dirty worktree reports its changes', () => {
  const changes = worktreeChanges('/x', { exec: () => ' M scripts/lib/a.mjs\n?? tests/lib/a.test.mjs\n' });
  assert.deepEqual(changes, ['M scripts/lib/a.mjs', '?? tests/lib/a.test.mjs']);
});

test('a clean worktree reports nothing', () => {
  assert.equal(worktreeChanges('/x', { exec: () => '\n' }), null);
  assert.equal(worktreeChanges('/x', { exec: () => '' }), null);
});

test('a directory git refuses to answer about is not evidence of work', () => {
  // A stale directory left behind by a removed worktree is not a git worktree
  // at all — this repo has one. Guessing would report phantom work every stop.
  assert.equal(worktreeChanges('/x', { exec: () => { throw new Error('not a git repository'); } }), null);
});

// ── scanning ───────────────────────────────────────────────────────────────

test('only worktrees holding changes are reported', () => {
  const root = repoWith(['dirty', 'clean']);
  try {
    const found = worktreesWithChanges(root, { exec: (_c, args) => (args[1].endsWith('dirty') ? ' M a.mjs\n' : '') });
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'dirty');
  } finally { clean(root); }
});

test('an old worktree is a cleanup task, not a stage that just stopped', () => {
  // Reporting last week's abandoned worktree on every subagent stop would train
  // people to ignore the message.
  const root = repoWith(['old']);
  try {
    const dir = path.join(root, WORKTREE_DIR, 'old');
    const past = new Date(Date.now() - 48 * 3600_000);
    fs.utimesSync(dir, past, past);
    assert.deepEqual(worktreesWithChanges(root, { exec: () => ' M a.mjs\n' }), []);
  } finally { clean(root); }
});

test('a repo with no worktree directory is not an error', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-wt-'));
  try {
    assert.deepEqual(worktreesWithChanges(root, { exec: () => ' M a.mjs\n' }), []);
    assert.deepEqual(worktreesWithChanges('/nonexistent', { exec: () => ' M a.mjs\n' }), []);
  } finally { clean(root); }
});

// ── the message ────────────────────────────────────────────────────────────

test('the message names the files and why silence is the failure', () => {
  const out = explainWorktrees([{ name: 'w', dir: '/r/.claude/worktrees/w', changes: ['M a.mjs', '?? b.mjs'], ageMs: 0 }]);
  assert.match(out, /a\.mjs/);
  assert.match(out, /produced something you cannot see/);
  assert.match(out, /removed when the agent is done/, 'the urgency is that the evidence disappears');
});

test('a long change list is summarised rather than dumped', () => {
  const changes = Array.from({ length: 12 }, (_, i) => `M file${i}.mjs`);
  const out = explainWorktrees([{ name: 'w', dir: '/d', changes, ageMs: 0 }]);
  assert.match(out, /\+7 more/);
});

test('nothing unlanded says nothing', () => {
  assert.equal(explainWorktrees([]), null);
  assert.equal(explainWorktrees(null), null);
});

// ── committed but not merged (great_cto-ldws.6, ADR-047 §3) ────────────────

function realRepo(branch = 'main') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-wt-real-'));
  const git = (args, cwd = root) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init', '-q', '-b', branch]);
  git(['commit', '-q', '--allow-empty', '-m', 'init']);
  return { root, git };
}

test('a clean worktree with a commit nobody merged is reported, and stops once it is merged', () => {
  const { root, git } = realRepo();
  try {
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const dir = path.join(root, WORKTREE_DIR, 'feat');
    git(['worktree', 'add', '-q', '-b', 'feat', dir]);
    git(['commit', '-q', '--allow-empty', '-m', 'the work'], dir);

    const found = worktreesWithChanges(root);
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].changes, []);
    assert.deepEqual(found[0].unmerged, { count: 1, ref: 'origin/main' });
    assert.match(explainWorktrees(found), /1 commit not on origin\/main/);

    git(['update-ref', 'refs/remotes/origin/main', 'feat']);
    assert.deepEqual(worktreesWithChanges(root), [], 'merged and clean: nothing to land');
  } finally { clean(root); }
});

test('dirty files and unmerged commits are named together', () => {
  const text = explainWorktrees([{ dir: 'wt', changes: ['M a.mjs'], unmerged: { count: 2, ref: 'origin/main' }, ageMs: 0 }]);
  assert.match(text, /wt: a\.mjs; 2 commits not on origin\/main/);
});

test('no integration branch to compare with: says nothing rather than guessing', () => {
  const { root } = realRepo('trunk');
  try { assert.equal(unmergedCommits(root), null); } finally { clean(root); }
});

test('only "not an ancestor" counts as unmerged: any other git failure is not evidence of work', () => {
  const failing = (status) => (_c, args) => {
    if (args.includes('symbolic-ref')) return 'refs/remotes/origin/main\n';
    if (args.includes('merge-base')) throw Object.assign(new Error('git'), { status });
    return '3\n';
  };
  assert.deepEqual(unmergedCommits('/x', { exec: failing(1) }), { count: 3, ref: 'origin/main' });
  assert.equal(unmergedCommits('/x', { exec: failing(128) }), null);
});
