/**
 * The retry that free-port.mjs has always promised and never had.
 *
 * `freePort()` asks the kernel for a port, closes the listener, and hands the
 * number back. That killed the 1-in-100 collision the old random-range picker
 * had, but it leaves a window: between the close and the board's own bind, any
 * other process on the machine — another test file, another project's gate, a
 * board left running from yesterday — can take the number. The comment in
 * free-port.mjs says "and the retry closes the rest".
 *
 * There is no retry. Not in the helper, not in any of the six test files that
 * spawn a board. The only `retry` in the whole tree is `rmSync maxRetries`,
 * which is about deleting directories. So the window stayed open and the
 * symptom is the message every one of those files throws by hand:
 * `board did not start on port 62394` — seen again in the full gate today.
 *
 * A promise in a comment is the same defect this repository keeps finding in
 * its guards: the words are there, the behaviour is not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startOnFreePort } from './board-start.mjs';

/** Hold a port so the next binder loses the race, deterministically. */
function occupy(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

test('a port taken between pick and bind costs a retry, not the run', async (t) => {
  const seen = [];
  let squatter = null;
  // Registered as teardown, not written after the asserts: an open server is an
  // open handle, so a failing assert would leave the test runner unable to exit
  // and turn one bad assumption into a hung suite. That is the flake this file
  // exists to remove, so it must not be reintroduced by the file itself.
  t.after(() => (squatter ? new Promise((r) => squatter.close(r)) : undefined));

  const res = await startOnFreePort(async (port) => {
    seen.push(port);
    // First attempt: something else already holds it.
    if (seen.length === 1) {
      squatter = await occupy(port);
      throw Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    }
    return { port };
  }, { attempts: 3 });

  assert.equal(seen.length, 2, 'exactly one retry');
  assert.notEqual(seen[0], seen[1], 'the retry must pick a DIFFERENT port');
  assert.equal(res.port, seen[1]);
});

test('a first-attempt success does not retry and does not sleep', async () => {
  let calls = 0;
  const t0 = Date.now();
  const res = await startOnFreePort(async (port) => { calls++; return { port }; }, { attempts: 3 });
  assert.equal(calls, 1);
  assert.ok(typeof res.port === 'number' && res.port > 0);
  assert.ok(Date.now() - t0 < 1000, 'no backoff on the happy path');
});

test('exhausted attempts say how many were made, and why each failed', async () => {
  // `board did not start on port 62394` is what the test files throw today. It
  // names one port and hides that anything was retried, which is why the flake
  // read as "the board is broken" rather than "the port was taken".
  await assert.rejects(
    () => startOnFreePort(async () => {
      throw Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    }, { attempts: 3, delayMs: 1 }),
    (e) => {
      assert.match(e.message, /3 attempt/, 'the attempt count must be in the message');
      assert.match(e.message, /EADDRINUSE/, 'and the reason');
      return true;
    },
  );
});

test('an error that is NOT a port collision fails immediately', async () => {
  // Retrying a genuine fault turns a clear failure into a slow, confusing one —
  // and would hide a broken board behind a timeout.
  let calls = 0;
  await assert.rejects(
    () => startOnFreePort(async () => {
      calls++;
      throw new Error('SyntaxError: unexpected token in server.mjs');
    }, { attempts: 5, delayMs: 1 }),
    /SyntaxError/,
  );
  assert.equal(calls, 1, 'a real fault must not be retried');
});

test('the helper is what free-port promises, so free-port points at it', async () => {
  // Keeping the comment honest: if the retry ever leaves again, this fails.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./free-port.mjs', import.meta.url), 'utf8');
  assert.match(src, /board-start/, 'free-port.mjs must name where the retry lives');
});

test('a collision reported only as text still retries', async () => {
  // The real caller spawns the board as a child process. A child's bind failure
  // arrives as a line on stderr — "Error: listen EADDRINUSE: address already in
  // use 127.0.0.1:62394" — wrapped in an Error the parent built by hand, with
  // no `code` property on it. Matching on `code` alone would fail fast on
  // exactly the case this helper exists for.
  //
  // Found by mutation: deleting the text branch left every test passing.
  const seen = [];
  const res = await startOnFreePort(async (port) => {
    seen.push(port);
    if (seen.length === 1) throw new Error('board exited: listen EADDRINUSE: address already in use 127.0.0.1:' + port);
    return { port };
  }, { attempts: 3, delayMs: 1 });
  assert.equal(seen.length, 2, 'the text form must be recognised as a collision');
  assert.equal(res.port, seen[1]);
});

// ── startBoard: the three causes told apart ─────────────────────────────────
import { startBoard } from './board-start.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A stand-in for the CLI that behaves however the test needs. */
function fakeCli(body) {
  const dir = mkdtempSync(join(tmpdir(), 'gc-fakecli-'));
  const p = join(dir, 'cli.mjs');
  writeFileSync(p, body);
  return p;
}

test('a child that reports EADDRINUSE is retried, not timed out', async () => {
  // The whole point: the collision arrives on the CHILD's stderr, so the parent
  // has to be watching it. Before this, the parent polled a dead port for the
  // full 8s and then blamed the board.
  const marker = join(mkdtempSync(join(tmpdir(), 'gc-mark-')), 'n');
  const cli = fakeCli(`
    import { writeFileSync, readFileSync, existsSync } from 'node:fs';
    import http from 'node:http';
    const m = ${JSON.stringify(marker)};
    const n = existsSync(m) ? Number(readFileSync(m, 'utf8')) : 0;
    writeFileSync(m, String(n + 1));
    const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
    if (n === 0) { process.stderr.write('Error: listen EADDRINUSE: address already in use 127.0.0.1:' + port + '\\n'); process.exit(1); }
    http.createServer((_q, s) => { s.writeHead(200, {'content-type':'application/json'}); s.end('[]'); }).listen(port, '127.0.0.1');
  `);
  const { port, proc } = await startBoard({ cliEntry: cli, project: process.cwd(), timeoutMs: 6000 });
  try {
    assert.ok(port > 0);
    const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
    assert.equal(r.status, 200, 'the second attempt actually serves');
  } finally { try { proc.kill('SIGKILL'); } catch {} }
});

test('a board that crashes on boot fails fast WITH its stderr, not as a timeout', async () => {
  // Three causes used to share one message. This is the one that must never be
  // retried: retrying a crash hides the reason behind an 8-second wait.
  const cli = fakeCli(`process.stderr.write('SyntaxError: bad server\\n'); process.exit(1);`);
  const t0 = Date.now();
  await assert.rejects(
    () => startBoard({ cliEntry: cli, project: process.cwd(), timeoutMs: 8000 }),
    (e) => {
      assert.match(e.message, /exited/, 'says it exited');
      assert.match(e.message, /SyntaxError: bad server/, 'and carries the stderr that explains why');
      return true;
    },
  );
  assert.ok(Date.now() - t0 < 6000, `must not burn the timeout; took ${Date.now() - t0}ms`);
});

test('a CLI that daemonises and exits 0 is not a crash', async () => {
  // The board CLI does exactly this: it starts the server in a process we never
  // hold and exits 0 at once. An earlier version of startBoard called that a
  // crash and failed all three resume tests against a board that was coming up
  // normally — a detector strict enough to reject the real thing.
  const cli = fakeCli(`
    import { spawn } from 'node:child_process';
    import http from 'node:http';
    const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
    if (process.env.GC_CHILD) {
      http.createServer((_q, s) => { s.writeHead(200, {'content-type':'application/json'}); s.end('[]'); }).listen(port, '127.0.0.1');
    } else {
      spawn(process.execPath, [process.argv[1], '--port', String(port), '--no-open'],
        { env: { ...process.env, GC_CHILD: '1' }, detached: true, stdio: 'ignore' }).unref();
      process.exit(0);
    }
  `);
  const { port, proc } = await startBoard({ cliEntry: cli, project: process.cwd(), timeoutMs: 8000 });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
    assert.equal(r.status, 200, 'the daemonised server must be reached');
  } finally { try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch {} } }
});
