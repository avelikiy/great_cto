#!/usr/bin/env node
/**
 * review-range — what a re-review has to read: only what changed since the last
 * review of this branch, or the whole diff when there is no usable marker.
 *
 * Why this exists
 * ---------------
 * code-reviewer ended 6 of 28 runs at its turn cap on the projects measured on
 * 2026-09-21, most of them in one project where it was dispatched 35 times — the
 * same branch, re-read from the top after every fix. The second review needs the
 * fix, not the whole feature again. Method from fynnfluegge/agtx (Apache-2.0),
 * which records a reviewed-at marker and re-reviews `marker..HEAD`; written here.
 *
 * The marker lives in .great_cto/review-marker.json, per branch. It is used only
 * when it is an ancestor of HEAD: after a rebase or a force-push the marked commit
 * is not in the history any more, and a range from it would silently skip or
 * double-count work — then the answer is a full review, with the reason.
 *
 * Usage:
 *   node scripts/lib/review-range.mjs [--cwd DIR] [--json]   what to review now
 *   node scripts/lib/review-range.mjs --record [--cwd DIR]    after writing the verdict
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = (cwd) => join(cwd, '.great_cto', 'review-marker.json');

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 20_000 });
  return { code: r.status, out: (r.stdout || '').trim() };
}

function readMarkers(cwd) {
  try { return JSON.parse(readFileSync(MARKER(cwd), 'utf8')) || {}; } catch { return {}; }
}

/**
 * @returns {{mode:'incremental'|'full'|'nothing-new', branch:string|null, head:string|null,
 *   range?:string, since?:string, uncommitted:string[], reason?:string}}
 */
export function reviewRange({ cwd = process.cwd() } = {}) {
  const head = git(cwd, ['rev-parse', 'HEAD']).out || null;
  const branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']).out || null;
  const uncommitted = git(cwd, ['status', '--short']).out.split('\n').filter(Boolean);
  const base = { branch, head, uncommitted };
  if (!head) return { ...base, mode: 'full', reason: 'no commit to anchor a range' };
  const m = branch ? readMarkers(cwd)[branch] : null;
  if (!m?.sha) return { ...base, mode: 'full', reason: branch ? `no review marker for ${branch}` : 'detached HEAD' };
  if (git(cwd, ['merge-base', '--is-ancestor', m.sha, head]).code !== 0) {
    return { ...base, mode: 'full', reason: `the reviewed commit ${m.sha.slice(0, 8)} is no longer in this branch's history (rebased or force-pushed)` };
  }
  if (m.sha === head && !uncommitted.length) return { ...base, mode: 'nothing-new', since: m.ts, reason: 'no commit and no change since the last review' };
  return { ...base, mode: 'incremental', range: `${m.sha}..HEAD`, since: m.ts };
}

/** Record HEAD as reviewed for the current branch. */
export function recordReview({ cwd = process.cwd(), now = new Date() } = {}) {
  const head = git(cwd, ['rev-parse', 'HEAD']).out;
  const branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']).out;
  if (!head || !branch) return null;
  const all = readMarkers(cwd);
  all[branch] = { sha: head, ts: now.toISOString() };
  mkdirSync(join(cwd, '.great_cto'), { recursive: true });
  writeFileSync(MARKER(cwd), `${JSON.stringify(all, null, 2)}\n`);
  return all[branch];
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--cwd');
  const cwd = i >= 0 ? a[i + 1] : process.cwd();
  if (a.includes('--record')) {
    const r = recordReview({ cwd });
    process.stdout.write(r ? `review-range: recorded ${r.sha.slice(0, 8)}\n` : 'review-range: nothing recorded (no commit or detached HEAD)\n');
    process.exit(0);
  }
  const r = reviewRange({ cwd });
  if (a.includes('--json')) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else {
    process.stdout.write(`review-range: ${r.mode}${r.range ? ` — git diff ${r.range}` : ''}${r.reason ? ` (${r.reason})` : ''}\n`);
    if (r.uncommitted.length) process.stdout.write(`  plus ${r.uncommitted.length} uncommitted: git status --short\n`);
  }
  process.exit(0);
}
