// Start something on a free port, and retry when the port was taken in between.
//
// `freePort()` asks the kernel for a port, closes the listener, and returns the
// number. That removed the 1-in-100 collision of the old random-range picker,
// but it cannot remove the window between that close and the caller's own bind.
// Anything on the machine can take the number in that gap: another test file
// (`node --test` runs files concurrently), another project's pre-push gate, a
// board left running from a previous session.
//
// free-port.mjs has said "and the retry closes the rest" since it was written.
// There was no retry — in the helper or in any of the six test files that spawn
// a board. What those files had instead was a hand-written throw,
// `board did not start on port 62394`, which names a single port and says
// nothing about a race, so the flake read as "the board is broken".
//
// Only EADDRINUSE is retried. Retrying anything else would turn a genuine fault
// — a syntax error in the server, a bad CLI flag — into a slow timeout, which
// is strictly worse than failing fast and saying why.
import { freePort } from './free-port.mjs';

/** Is this the race we are here for, rather than a real fault? */
function isPortCollision(e) {
  if (!e) return false;
  if (e.code === 'EADDRINUSE') return true;
  return /EADDRINUSE|address already in use/i.test(String(e.message || e));
}

/**
 * Call `start(port)` on a kernel-assigned free port, retrying on collision.
 *
 * @param {(port:number)=>Promise<any>} start  must reject with EADDRINUSE if the
 *   port turned out to be taken; anything else is treated as a real fault
 * @param {{attempts?:number, delayMs?:number}} [opts]
 * @returns whatever `start` resolved to
 */
export async function startOnFreePort(start, { attempts = 3, delayMs = 120 } = {}) {
  const failures = [];
  for (let i = 1; i <= attempts; i++) {
    const port = await freePort();
    try {
      return await start(port);
    } catch (e) {
      // Fail fast on anything that is not the race. The point of a retry is to
      // absorb a known, narrow, self-correcting condition — not to paper over
      // whatever went wrong, which is the habit this repository is removing.
      if (!isPortCollision(e)) throw e;
      failures.push(`attempt ${i} on :${port} — ${e.code || e.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // The message carries the attempt count and every reason, so an exhausted
  // retry cannot be mistaken for a board that will not start.
  throw new Error(
    `could not start on a free port after ${attempts} attempts:\n  ${failures.join('\n  ')}`,
  );
}

// ── Starting an actual board ────────────────────────────────────────────────
//
// `startOnFreePort` can only retry a collision it is TOLD about, and the board
// is a child process: its bind failure lands on stderr and never becomes an
// exception in the parent. Every test file's hand-written wait loop therefore
// polled a dead port until its deadline and threw
// `board did not start on port <n>` — the same message whether the port was
// taken, the server crashed on boot, or the machine was simply slow. One message
// for three causes is why this was re-run through as a "known flake" instead of
// being read.
//
// So the wait watches stderr as well as the socket, and says which of the three
// happened.
import { spawn } from 'node:child_process';

/**
 * Spawn a board and wait until it answers, or fail with the reason.
 *
 * @param {{cliEntry:string, project:string, home?:string, args?:string[],
 *          env?:object, timeoutMs?:number, attempts?:number}} opts
 * @returns {Promise<{port:number, proc:import('node:child_process').ChildProcess}>}
 */
export function startBoard({ cliEntry, project, home, args = [], env = {}, timeoutMs = 8000, attempts = 3 }) {
  return startOnFreePort(async (port) => {
    const proc = spawn('node', [cliEntry, 'board', '--port', String(port), '--no-open', ...args], {
      cwd: project,
      // GREAT_CTO_NO_UPDATE_CHECK and friends come through `env`. The update
      // check in particular matters: the CLI spawns a DETACHED, unref'd process
      // that queries the npm registry and writes $HOME/.great_cto/update-check.json.
      // It is not in the board's process group, so `reap` never sees it; under
      // full-suite load the write lands after the temp HOME was deleted and
      // rmSync fails ENOTEMPTY.
      env: { ...process.env, ...(home ? { HOME: home } : {}), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let stderr = '';
    proc.stderr?.on('data', (b) => { stderr += String(b); });
    let exited = null;
    proc.once('exit', (code, signal) => { exited = { code, signal }; });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // A collision is knowable before the deadline, and knowing it early is
      // what makes the retry cheap instead of costing a full timeout each go.
      if (/EADDRINUSE|address already in use/i.test(stderr)) {
        await reapQuietly(proc);
        throw Object.assign(new Error(`board hit EADDRINUSE on :${port}`), { code: 'EADDRINUSE' });
      }
      // A NON-ZERO exit is a real fault: retrying it would hide the stderr that
      // explains it behind a timeout.
      //
      // A ZERO exit is not. The board CLI daemonises — it spawns the server and
      // the process we hold exits 0 immediately, while the socket comes up
      // afterwards in a process we never see. Treating that as a crash failed
      // all three resume tests with `board exited (code=0)` on a board that was
      // starting perfectly well. If a zero exit really did leave nothing
      // listening, the deadline below says so.
      if (exited && exited.code !== 0) {
        await reapQuietly(proc);
        throw new Error(
          `board exited (code=${exited.code} signal=${exited.signal}) before answering on :${port}\n` +
          `stderr:\n${stderr.trim() || '(empty)'}`,
        );
      }
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
        if (r.ok || r.status === 404) return { port, proc };
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 150));
    }

    await reapQuietly(proc);
    throw new Error(
      `board did not answer on :${port} within ${timeoutMs}ms (it was still running)\n` +
      `stderr:\n${stderr.trim() || '(empty)'}`,
    );
  }, { attempts });
}

/** Best-effort teardown of a half-started board; never masks the real error. */
async function reapQuietly(proc) {
  try {
    const { reap } = await import('./reap.mjs');
    await reap(proc);
  } catch { try { proc.kill('SIGKILL'); } catch { /* already gone */ } }
}

/**
 * Start any server script on a free port, retrying a collision.
 *
 * The board CLI variant above passes `--port`; this one is for scripts that read
 * the port from the environment (`packages/board/server.mjs` does). Same retry,
 * same three-way distinction between collision, crash and slow.
 *
 * @param {{entry:string, env?:object, cwd?:string, readyPath?:string,
 *          timeoutMs?:number, attempts?:number, portEnv?:string}} opts
 */
export function startServerOnFreePort({
  entry, env = {}, cwd, readyPath = '/', timeoutMs = 20000, attempts = 3, portEnv = 'PORT',
}) {
  return startOnFreePort(async (port) => {
    const proc = spawn('node', [entry, '--no-open'], {
      cwd, env: { ...process.env, ...env, [portEnv]: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let stderr = '';
    proc.stderr?.on('data', (b) => { stderr += String(b); });
    let exited = null;
    proc.once('exit', (code, signal) => { exited = { code, signal }; });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (/EADDRINUSE|address already in use/i.test(stderr)) {
        await reapQuietly(proc);
        throw Object.assign(new Error(`server hit EADDRINUSE on :${port}`), { code: 'EADDRINUSE' });
      }
      if (exited && exited.code !== 0) {
        await reapQuietly(proc);
        throw new Error(
          `server exited (code=${exited.code}) before answering on :${port}\nstderr:\n${stderr.trim() || '(empty)'}`,
        );
      }
      try {
        const r = await fetch(`http://127.0.0.1:${port}${readyPath}`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) return { port, proc };
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    await reapQuietly(proc);
    // Returned rather than thrown is NOT an option here: the caller decides
    // whether "did not come up" is a skip or a failure, and it can only decide
    // that if it is told which of the three happened.
    throw new Error(
      `server did not answer on :${port} within ${timeoutMs}ms (still running)\nstderr:\n${stderr.trim() || '(empty)'}`,
    );
  }, { attempts });
}
