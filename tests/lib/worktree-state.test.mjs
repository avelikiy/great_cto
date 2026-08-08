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
import { worktreeChanges, worktreesWithChanges, explainWorktrees, WORKTREE_DIR } from '../../scripts/lib/worktree-state.mjs';

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
