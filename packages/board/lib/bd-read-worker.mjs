// A read's process-group lifetime must not depend on the HTTP event loop.
// Forked into a newly owned group; ordinary module imports do not start work.
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(import.meta.url);
export function spawnBdRead(binary, { readDeadlineMs = 20250, ...options }) {
  return fork(entry, [binary, String(readDeadlineMs)], { ...options, silent: true });
}
if (process.argv[1] === entry) {
  const grouped = process.platform !== 'win32';
  let child;
  function killOwnedGroup() {
    // POSIX fork is detached: the worker PID is exclusively this read's PGID.
    if (grouped) {
      try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); }
    } else {
      try { child?.kill('SIGKILL'); } catch { /* already gone */ }
      process.exit(1);
    }
  }
  process.on('disconnect', killOwnedGroup);
  process.on('SIGTERM', () => {}); // keep the independent KILL deadline alive
  process.stdout.on('error', killOwnedGroup);
  process.stderr.on('error', killOwnedGroup);
  // Independent upper bound even if the parent's event loop is stalled.
  const budget = Number(process.argv[3]);
  if (!Number.isFinite(budget) || budget < 1 || budget > 20250) process.exit(2);
  setTimeout(killOwnedGroup, budget);
  let completing = false;
  function complete(code) {
    if (completing) return;
    completing = true;
    // A successful leader can leave descendants with closed/ignored pipes.
    // Flush the result over IPC before killing the whole owned group. Keep
    // the independent deadline alive until cleanup, even if IPC stalls.
    if (!process.connected) return killOwnedGroup();
    // child 'close' means its pipes ended, not that this worker's output
    // queues reached the parent. Flush before announcing success or KILL
    // can truncate an otherwise valid snapshot under pipe backpressure.
    try { process.stdout.write('', stdoutError => {
      if (stdoutError) return killOwnedGroup();
      process.stderr.write('', stderrError => {
        if (stderrError || !process.connected) return killOwnedGroup();
        try { process.send({ type: 'bd-read-result', code }, () => killOwnedGroup()); }
        catch { killOwnedGroup(); }
      });
    }); }
    catch { killOwnedGroup(); }
  }
  try {
    child = spawn(process.argv[2], ['list', '--json', '--all', '--include-gates'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    child.on('error', () => complete(1));
    child.on('close', code => {
      // No background descendants are part of a completed read contract.
      // Wait for inherited pipes too: exiting on leader 'exit' would remove
      // the IPC watchdog while a descendant was still holding those pipes.
      complete(Number.isInteger(code) ? code : 1);
    });
  } catch { complete(1); }
}
