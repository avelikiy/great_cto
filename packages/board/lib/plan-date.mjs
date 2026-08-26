/**
 * plan-date — when a plan was written, as opposed to when its file was touched.
 *
 * The defect
 * ----------
 * Both cost readers dated a plan by `statSync(fp).mtime`. mtime is not a fact
 * about the plan; it is a fact about the filesystem, and everything ordinary
 * changes it — a reformat, a checkout, a copy, a `sed -i` over the directory.
 *
 * `git clone` is the case that turns it from imprecise into wrong. Clone writes
 * every file at clone time, so on a fresh checkout of this repository all 41
 * plans carry today's date: THIRTEEN distinct dates collapse into ONE. The
 * 30-day cost window then selects every plan ever written, and reports the
 * project's entire history as the last month. Measured, both ways:
 *
 *     fresh clone     30-day window → 41 plans, $150 human   ← identical to
 *                     all time      → 41 plans, $150 human      all-time
 *     this checkout   30-day window → 13 plans
 *                     all time      → 41 plans
 *
 * Nobody would read "$150 in the last 30 days" as suspicious. That is the shape
 * of the whole defect class: a number that is wrong in a way that looks normal.
 *
 * Where the date actually lives
 * -----------------------------
 * Measured over this repository's 41 plans rather than assumed:
 *
 *     21  the filename — `PLAN-2026-08-17-gate-fail-closed.md`
 *     20  nowhere in the file at all
 *      0  front-matter (supported anyway; it is the one an author can correct)
 *
 * So git is not a nicety, it is the only honest source for half of them: the
 * first commit that added the file is when the plan appeared. One batched
 * `git log` covers the whole directory in 0.27s, against 1.47s for one call per
 * file, so the cheap way is also the correct way.
 *
 * Three states, and the third is the point
 * ----------------------------------------
 * When no source but mtime exists the date is still returned — dropping the plan
 * would silently shrink the window, which is a different wrong answer. It is
 * returned with `reliable: false`, and callers report how many of those went
 * into a figure. A total assembled partly from filesystem timestamps should say
 * so rather than present itself as measured.
 */

import { statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ISO_DAY = /(\d{4}-\d{2}-\d{2})/;

/** `date:` in YAML front-matter, if the file opens with a front-matter block. */
export function frontMatterDate(text) {
  const m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const d = m[1].match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
  return d ? d[1] : null;
}

/** `YYYY-MM-DD` anywhere in the basename. */
export function fileNameDate(file) {
  const m = path.basename(file).match(ISO_DAY);
  return m ? m[1] : null;
}

/**
 * One `git log` for a whole directory: relative path → date the file was ADDED.
 *
 * Returns an empty Map when git is absent, the directory is untracked, or the
 * project is not a repository at all. That is not an error — it is a project
 * without this source, and the caller falls through to the next one.
 */
export function gitAddedIndex(root, dir) {
  const out = new Map();
  let res;
  try {
    res = spawnSync('git', ['log', '--diff-filter=A', '--name-only',
                            '--format=%x00%ad', '--date=short', '--', dir],
                    { cwd: root, encoding: 'utf8', timeout: 15_000 });
  } catch { return out; }
  if (!res || res.status !== 0 || !res.stdout) return out;

  let current = null;
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('\0')) { current = line.slice(1).trim(); continue; }
    const rel = line.trim();
    // git log walks newest-first, so the LAST assignment for a path is its
    // oldest add — a file added, deleted and re-added should date from the
    // first time it appeared, not the most recent.
    if (rel && current) out.set(rel, current);
  }
  return out;
}

/**
 * @returns {{date: string|null, source: 'front-matter'|'filename'|'git'|'mtime'|'none', reliable: boolean}}
 */
export function planDate(absPath, { root = process.cwd(), gitIndex = null, readText = null } = {}) {
  let text = '';
  try { text = readText ? readText(absPath) : readFileSync(absPath, 'utf8').slice(0, 2000); } catch { /* unreadable */ }

  const fm = frontMatterDate(text);
  if (fm) return { date: fm, source: 'front-matter', reliable: true };

  const fn = fileNameDate(absPath);
  if (fn) return { date: fn, source: 'filename', reliable: true };

  if (gitIndex && gitIndex.size) {
    const rel = path.relative(root, absPath);
    const g = gitIndex.get(rel);
    if (g) return { date: g, source: 'git', reliable: true };
  }

  try {
    return { date: statSync(absPath).mtime.toISOString().slice(0, 10), source: 'mtime', reliable: false };
  } catch {
    return { date: null, source: 'none', reliable: false };
  }
}

/**
 * Date every `.md` in a directory in one pass, with one git call for all of them.
 *
 * @returns {{dates: Map<string,{date,source,reliable}>, unreliable: number, total: number}}
 */
export function datePlans(files, { root = process.cwd(), dir = 'docs/plans' } = {}) {
  const gitIndex = gitAddedIndex(root, dir);
  const dates = new Map();
  let unreliable = 0;
  for (const f of files) {
    const d = planDate(f, { root, gitIndex });
    dates.set(f, d);
    if (!d.reliable) unreliable += 1;
  }
  return { dates, unreliable, total: files.length };
}
