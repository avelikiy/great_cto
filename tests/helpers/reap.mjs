// Killing a process is not the same as the work having stopped.
//
// Every board-spawning test in this suite did the same two things in the same
// order: SIGKILL the process group, then `rmSync` the temp directories it ran
// out of. That pair is a race. SIGKILL is delivered asynchronously, so between
// the signal and the removal the board can still finish a write into its temp
// HOME — and `rmSync` fails with ENOTEMPTY on a directory that just gained a
// file. `maxRetries` does not fix it: a retry re-reads the directory and can
// find another new file.
//
// Twenty-eight call sites, none of them waiting, is why "run it again" became
// the response to a red suite. A gate people re-run instead of read has stopped
// being a gate.
//
// The subtlety that decides the implementation: `great-cto board` is a
// LAUNCHER. It exits as soon as the server is up, and the server is a
// GRANDCHILD holding the port and the file handles. So the direct child's
// `exit` proves nothing at all — the thing racing `rmSync` is the grandchild,
// and the only honest signal is the process GROUP going empty.
//
//   process.kill(-pid, 0)  →  throws ESRCH once no member of the group is left.
//
// That is what this waits on.

import { rmSync } from 'node:fs';

/** True while any member of the group is still alive. */
function groupAlive(pgid) {
  try { process.kill(-pgid, 0); return true; }
  catch (e) { return e?.code === 'EPERM'; }   // EPERM: alive but not ours. ESRCH: gone.
}

/**
 * Kill a detached child's whole group and WAIT until nothing in it is left.
 *
 * @returns {Promise<'reaped'|'timeout'|'no-group'>} what actually happened, so a
 *   caller that cares can assert on it rather than assume it worked.
 */
export async function reap(child, { timeoutMs = 5000, pollMs = 25 } = {}) {
  if (!child || !child.pid) return 'no-group';
  const pgid = child.pid;

  try { process.kill(-pgid, 'SIGKILL'); } catch { /* group already gone */ }
  try { child.kill('SIGKILL'); } catch { /* child already gone */ }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupAlive(pgid)) return 'reaped';
    await new Promise((r) => setTimeout(r, pollMs));
  }
  // A group that will not die must not hang the suite. Say so rather than
  // pretending the wait succeeded — the caller's cleanup may now fail, and it
  // should fail with a reason someone can read.
  return 'timeout';
}

/**
 * Remove temp directories after their process group is gone.
 *
 * Retries stay as a second line — a filesystem can hold a handle briefly after
 * exit — but they are no longer the whole strategy.
 */
export function rmTemp(...dirs) {
  for (const d of dirs) {
    if (!d) continue;
    try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch { /* a temp dir the OS will clear; throwing here would mask the real assertion */ }
  }
}

/** Kill, wait for the group, then remove — the whole teardown in the order that works. */
export async function reapAndClean(child, ...dirs) {
  await reap(child);
  rmTemp(...dirs);
}
