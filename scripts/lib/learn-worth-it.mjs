import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Is this session end worth spending a paid agent run on?
 *
 * `continuous-learner` is opt-in behind GREAT_CTO_AUTO_LEARN=1 and off by
 * default — a deliberate choice, documented in session-end.mjs as avoiding a
 * surprise for existing users. That is why lessons.md has never been written
 * here, and it is not the declared-and-unreachable defect it resembles.
 *
 * Turning it on as written spawns `claude --agent continuous-learner` at EVERY
 * session end, including the one that answered a question in thirty seconds. The
 * project's own /save skill already refuses to update brain.md for a trivial
 * session; this is the same rule, for the case that costs money.
 *
 * The inputs are already computed by captureGitState() before this is called, so
 * the guard is free.
 *
 * Unknown state runs the learner rather than skipping it: skipping would drop a
 * lesson every time git is unreadable, and deliver "I could not tell" as "there
 * was nothing to learn". One unnecessary run is cheaper than a loop that stops
 * without saying so.
 */

/**
 * @param {{commitsToday: number, uncommitted: number}|null} git
 * @returns {{run: boolean, reason: string}}
 */
export function learnWorthIt(git) {
  if (!git || typeof git !== 'object') return { run: true, reason: 'substance-unknown' };
  const commits = Number(git.commitsToday) || 0;
  const dirty = Number(git.uncommitted) || 0;
  if (commits === 0 && dirty === 0) return { run: false, reason: 'nothing-changed' };
  return { run: true, reason: commits > 0 ? `${commits}-commits` : `${dirty}-uncommitted` };
}

/**
 * Is auto-learn on? `GREAT_CTO_AUTO_LEARN=1`, or `"auto_learn": true` in
 * ~/.great_cto/config.json. The file exists because the env var alone reached
 * nobody: set in a shell rc, it is invisible to sessions the desktop app starts,
 * and on the measuring machine it was set in exactly one of 28 projects' sessions.
 * An explicit `GREAT_CTO_AUTO_LEARN=0` turns it off whatever the file says.
 */
export function autoLearnEnabled(env = process.env, home = homedir()) {
  if (env.GREAT_CTO_AUTO_LEARN === '1') return true;
  if (env.GREAT_CTO_AUTO_LEARN === '0') return false;
  try { return JSON.parse(readFileSync(join(home, '.great_cto', 'config.json'), 'utf8')).auto_learn === true; } catch { return false; }
}
