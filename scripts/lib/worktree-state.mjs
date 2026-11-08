#!/usr/bin/env node
/**
 * worktree-state — is there work sitting in a worktree that nobody landed?
 *
 * Why this exists
 * ---------------
 * On 2026-08-07 senior-dev implemented a library in a git worktree: 381 lines
 * plus 394 lines of tests, thirty passing. Its verdict went to the worktree's
 * own `.great_cto/` too, so the main tree saw an empty log and the pipeline
 * read "no verdict recorded". The work was found because a `cp` happened to say
 * "files are identical" — luck, not a mechanism. Worktrees are removed when the
 * agent is done with them.
 *
 * Nothing anywhere notices. The main tree looks clean, which reads as "the agent
 * produced nothing" rather than "the agent produced something you cannot see",
 * and those are the same picture from the pipeline's side.
 *
 * This reports; it does not block. A worktree with changes is the normal state
 * while an agent is working, and several may be live at once during a parallel
 * fan-out. The failure is silence at the moment one stops, not the existence of
 * uncommitted work.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Where Claude Code puts agent worktrees, relative to the repo root. */
export const WORKTREE_DIR = join('.claude', 'worktrees');

/** Changes in one worktree, or null when it is clean or unreadable. */
export function worktreeChanges(dir, { exec = execFileSync } = {}) {
  let out;
  try {
    out = exec('git', ['-C', dir, 'status', '--porcelain'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    // Not a git worktree, or git refused. A directory we cannot ask about is not
    // evidence of work — say nothing rather than guess.
    return null;
  }
  const lines = String(out).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : null;
}

/** The branch work lands on, as a full ref, or null when none can be named. */
function integrationRef(git) {
  const head = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (head) return head;
  for (const ref of ['refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master']) {
    if (git(['rev-parse', '--verify', '--quiet', ref])) return ref;
  }
  return null;
}

/**
 * Commits in a worktree that the integration branch does not have, as
 * { count, ref }, or null when there are none or git cannot say. A clean status
 * proves nothing here: committed work leaves `git status` empty.
 */
export function unmergedCommits(dir, { exec = execFileSync } = {}) {
  const opts = { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] };
  const git = (args) => {
    try { return String(exec('git', ['-C', dir, ...args], opts)).trim(); } catch { return ''; }
  };
  const ref = integrationRef(git);
  if (!ref) return null;
  try {
    exec('git', ['-C', dir, 'merge-base', '--is-ancestor', 'HEAD', ref], opts);
    return null; // landed
  } catch (e) {
    // Exit 1 is the answer "not an ancestor"; anything else is git failing to answer.
    if (e.status !== 1) return null;
  }
  const count = Number(git(['rev-list', '--count', `${ref}..HEAD`]));
  return count > 0 ? { count, ref: ref.replace(/^refs\/(remotes\/|heads\/)/, '') } : null;
}

/**
 * Worktrees holding unlanded changes: uncommitted, or committed and not merged.
 *
 * `maxAgeMs` bounds it to worktrees touched recently: an abandoned one from last
 * week is a cleanup task, not a stage that just stopped, and reporting it on
 * every subagent stop would train people to ignore the message.
 */
export function worktreesWithChanges(root = process.cwd(), { maxAgeMs = 6 * 60 * 60 * 1000, now = Date.now(), exec } = {}) {
  const base = join(root, WORKTREE_DIR);
  if (!existsSync(base)) return [];
  let names;
  try { names = readdirSync(base); } catch { return []; }

  const out = [];
  for (const name of names) {
    const dir = join(base, name);
    let mtime;
    try {
      const st = statSync(dir);
      if (!st.isDirectory()) continue;
      mtime = st.mtimeMs;
    } catch { continue; }
    if (now - mtime > maxAgeMs) continue;
    const changes = worktreeChanges(dir, { exec });
    const unmerged = unmergedCommits(dir, { exec });
    if (changes || unmerged) out.push({ name, dir, changes: changes || [], unmerged, ageMs: now - mtime });
  }
  return out.sort((a, b) => a.ageMs - b.ageMs);
}

/** One operator-facing line, or null when there is nothing unlanded. */
export function explainWorktrees(list) {
  if (!list || !list.length) return null;
  const parts = list.map((w) => {
    const shown = w.changes.slice(0, 5).map((c) => c.replace(/^\S+\s+/, ''));
    const more = w.changes.length > shown.length ? ` (+${w.changes.length - shown.length} more)` : '';
    const held = [];
    if (shown.length) held.push(`${shown.join(', ')}${more}`);
    if (w.unmerged) held.push(`${w.unmerged.count} commit${w.unmerged.count === 1 ? '' : 's'} not on ${w.unmerged.ref}`);
    return `${w.dir}: ${held.join('; ')}`;
  });
  return `work is sitting in a worktree and has not been landed — ${parts.join(' | ')}. `
    + 'The main tree looks clean, which reads as "the agent produced nothing" rather than '
    + '"the agent produced something you cannot see". Land it or say why not; worktrees are removed when the agent is done with them.';
}
