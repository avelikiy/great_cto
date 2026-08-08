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

/**
 * Worktrees holding unlanded changes.
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
    if (changes) out.push({ name, dir, changes, ageMs: now - mtime });
  }
  return out.sort((a, b) => a.ageMs - b.ageMs);
}

/** One operator-facing line, or null when there is nothing unlanded. */
export function explainWorktrees(list) {
  if (!list || !list.length) return null;
  const parts = list.map((w) => {
    const shown = w.changes.slice(0, 5).map((c) => c.replace(/^\S+\s+/, ''));
    const more = w.changes.length > shown.length ? ` (+${w.changes.length - shown.length} more)` : '';
    return `${w.dir}: ${shown.join(', ')}${more}`;
  });
  return `work is sitting in a worktree and has not been landed — ${parts.join(' | ')}. `
    + 'The main tree looks clean, which reads as "the agent produced nothing" rather than '
    + '"the agent produced something you cannot see". Land it or say why not; worktrees are removed when the agent is done with them.';
}
