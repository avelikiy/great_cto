#!/usr/bin/env node
/**
 * merge-preflight — may a lane's branch be merged into the checkout, and would it
 * merge cleanly? Answers without touching the working tree, the index or any ref.
 *
 * Why this exists
 * ---------------
 * Parallel work in this repository shares one working tree more often than not,
 * and "help" at merge time is what destroys work: a stash or a checkout to make a
 * merge possible takes the other session's uncommitted edits with it, and they are
 * in no commit and no reflog (session-coordination rule, 03.09). lane-diff.mjs
 * proves a packet stayed inside its write zone; nothing proved the merge that
 * follows is safe to attempt. Method from fynnfluegge/agtx's `merge_task_branch`
 * (Apache-2.0), written here:
 *
 *   refused-dirty        the checkout has tracked changes — refuse, never stash
 *   refused-not-on-base  the checkout is not on the base branch — refuse, never switch
 *   nothing-to-merge     the branch has no commits the base lacks — not a success:
 *                        a lane that "finished" with an empty branch did its work
 *                        somewhere else, or not at all
 *   conflict             `git merge-tree --write-tree` reports conflicts — the files
 *                        are named; the branch goes back to its owner
 *   clean                a virtual merge succeeds — merging is safe to attempt
 *   not-checked          git too old for --write-tree, or the refs do not resolve
 *
 * Usage: node scripts/lib/merge-preflight.mjs <branch> [--base main] [--cwd DIR] [--json]
 * Exit:  0 clean · 1 refused / nothing-to-merge / conflict · 2 usage · 3 not checked
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const EXIT = Object.freeze({ CLEAN: 0, NO: 1, USAGE: 2, NOT_CHECKED: 3 });

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/**
 * @returns {{state:string, branch:string, base:string, ahead?:number, conflicts?:string[], tree?:string, detail?:string}}
 */
export function mergePreflight({ cwd = process.cwd(), branch, base = 'main' } = {}) {
  const r = { branch, base };
  for (const ref of [base, branch]) {
    if (git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).code !== 0) {
      return { ...r, state: 'not-checked', detail: `ref does not resolve: ${ref}` };
    }
  }
  const dirty = git(cwd, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty.code !== 0) return { ...r, state: 'not-checked', detail: dirty.err || 'git status failed' };
  if (dirty.out) {
    return { ...r, state: 'refused-dirty', detail: `${dirty.out.split('\n').length} tracked file(s) changed in the checkout — commit or hand them back; never stash another session's work` };
  }
  const head = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']).out;
  if (head !== base) return { ...r, state: 'refused-not-on-base', detail: `checkout is on ${head || 'a detached HEAD'}, not ${base} — never switch branches under another session` };
  const ahead = Number(git(cwd, ['rev-list', '--count', `${base}..${branch}`]).out || 0);
  if (ahead === 0) return { ...r, state: 'nothing-to-merge', ahead: 0, detail: `${branch} has no commit ${base} lacks — the lane's work is not on its branch` };
  const m = git(cwd, ['merge-tree', '--write-tree', '--name-only', base, branch]);
  if (m.code === 0) return { ...r, state: 'clean', ahead, tree: m.out.split('\n')[0] };
  if (m.code === 1) {
    // Output: tree id, the conflicted paths, a blank line, then messages.
    const lines = m.out.split('\n');
    const end = lines.indexOf('', 1);
    const conflicts = lines.slice(1, end === -1 ? undefined : end).filter(Boolean);
    return { ...r, state: 'conflict', ahead, conflicts };
  }
  return { ...r, state: 'not-checked', ahead, detail: m.err.split('\n')[0] || `git merge-tree exited ${m.code} (needs git ≥ 2.38)` };
}

export function exitFor(state) {
  if (state === 'clean') return EXIT.CLEAN;
  if (state === 'not-checked') return EXIT.NOT_CHECKED;
  return EXIT.NO;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const branch = a.find((x, i) => !x.startsWith('--') && !['--base', '--cwd'].includes(a[i - 1]));
  if (!branch) { process.stderr.write('Usage: merge-preflight.mjs <branch> [--base main] [--cwd DIR] [--json]\n'); process.exit(EXIT.USAGE); }
  const r = mergePreflight({ cwd: opt('--cwd', process.cwd()), branch, base: opt('--base', 'main') });
  if (a.includes('--json')) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else {
    process.stdout.write(`merge-preflight ${branch} → ${r.base}: ${r.state}${r.ahead != null ? ` (${r.ahead} commit(s))` : ''}\n`);
    if (r.detail) process.stdout.write(`  ${r.detail}\n`);
    for (const f of r.conflicts || []) process.stdout.write(`  conflict: ${f}\n`);
  }
  process.exit(exitFor(r.state));
}
