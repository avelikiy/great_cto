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
import * as fsMod from 'node:fs';
import * as osMod from 'node:os';
import * as cpMod from 'node:child_process';

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

/**
 * Sweep leftovers from runs that never reached their teardown.
 *
 * `finally` is not a guarantee. It runs when a test throws; it does not run
 * when the runner itself is killed — Ctrl-C, a harness timeout, a closed
 * terminal. Every such interruption leaves a detached board holding a port and
 * a temp tree behind it, and nothing ever comes back for them.
 *
 * They accumulated for days without a symptom anyone would connect to a test:
 * six live board servers from five days earlier, and 346 temp directories.
 * Found while investigating something else — which is the actual cost, because
 * the machine had been running them the whole time.
 *
 * So the suite stops depending on the previous run having ended tidily and
 * starts each run by clearing what the last one left. It reports what it swept
 * rather than doing it quietly: debris is evidence that a run was interrupted,
 * and silently erasing evidence is how the accumulation went unnoticed in the
 * first place.
 *
 * Scoped by the mkdtemp prefix — it can only ever match this suite's own temp
 * directories, never a developer's work.
 *
 * @param {string} prefix mkdtemp prefix, e.g. 'gcto-gate-'
 * @returns {{processes: number, dirs: number}} what was actually reclaimed
 */
export function sweepStrays(prefix) {
  const { readdirSync } = nodeFs();
  const { tmpdir } = nodeOs();
  const { execFileSync } = nodeChildProcess();

  let processes = 0;
  // A stray is identified by its working directory, not its command line. The
  // command line is `node .../server.mjs --port <n>` for the real board too;
  // the temp cwd is what makes it unambiguously ours to kill.
  //
  // Deliberately NOT scoped with `+D <tmpdir>`: that makes lsof walk the whole
  // temp tree, and it then reports the pid and the fd but omits the name line
  // the match needs — a filter that silently returns nothing matchable, which
  // is how the first version of this swept 2 directories and 0 processes while
  // the process it was aimed at kept running. Listing every cwd and matching
  // here is both faster and actually answers the question.
  let lsof = '';
  try {
    lsof = execFileSync('lsof', ['-d', 'cwd', '-Fpn'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
  } catch (e) { lsof = e?.stdout || ''; }   // lsof exits non-zero on any denied pid

  let pid = null;
  for (const line of lsof.split('\n')) {
    if (line.startsWith('p')) { pid = Number(line.slice(1)); continue; }
    if (!line.startsWith('n') || !pid) continue;
    const cwd = line.slice(1);
    const victim = pid;
    pid = null;                                    // one cwd per pid; never carry it forward
    if (!cwd.includes(`/${prefix}`)) continue;
    if (victim === process.pid || victim === process.ppid) continue;
    try { process.kill(victim, 'SIGKILL'); processes += 1; } catch { /* already gone */ }
  }

  let dirs = 0;
  const base = tmpdir();
  for (const name of (() => { try { return readdirSync(base); } catch { return []; } })()) {
    if (!name.startsWith(prefix)) continue;
    rmTemp(`${base}/${name}`);
    dirs += 1;
  }

  if (processes || dirs) {
    console.error(`  swept ${processes} stray process(es) and ${dirs} temp dir(s) ` +
                  `left by an interrupted run (prefix ${prefix}*)`);
  }
  return { processes, dirs };
}

// Imported lazily so this module stays usable from contexts that only want reap().
function nodeFs() { return fsMod; }
function nodeOs() { return osMod; }
function nodeChildProcess() { return cpMod; }
