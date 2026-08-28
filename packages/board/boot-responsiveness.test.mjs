// The board bound its port and then answered NOTHING for as long as the boot
// warm-up's `bd list` took — `bd()`'s spawnSync blocks the WHOLE process, not
// just the request that needed the data. Reproduced here against a real slow
// `bd` fixture, so on the old code this test hangs/times out; it must not.
//
// A second, related defect (the alert cron's 5-minute sweep doing the same
// synchronous cold read once per registered project) is covered at the unit
// level in beads-warm-async.test.mjs — the cron only fires on a 5-minute
// timer, which isn't practical to exercise end-to-end here.
//
// This asserts a PROPERTY (the server answers WHILE the fill is still in
// flight), not a wall-clock threshold. A fixed "<1.5s" cutoff is exactly the
// kind of check that passes on a fast machine and goes red on a loaded one —
// real `bd`/Dolt startup alone was observed to vary 3.8s-14.3s run to run on
// one machine. The fixture's delay is set far larger than any plausible
// Node-startup jitter (10s), and the assertion is a before/after ordering
// against the fixture's own log output — never an absolute ms figure tuned
// to today's hardware.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, 'server.mjs');
const FAKE_BD = path.join(HERE, 'fixtures', 'fake-bd-slow.sh');
const FIXTURE_DELAY_SECS = 10; // comfortably larger than Node-startup jitter

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function getStatus(port, pathname, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/** Poll `pathname` every `stepMs` until `stopFn()` is true or `deadlineMs` elapses. Returns every status seen. */
async function pollUntil(port, pathname, stopFn, { stepMs = 200, deadlineMs = 20_000 } = {}) {
  const results = [];
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline && !stopFn()) {
    results.push(await getStatus(port, pathname));
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return results;
}

function startBoard({ cwd }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-home-'));
  return freePort().then((port) => {
    const child = spawn(process.execPath, [SERVER, '--no-open'], {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
        HOME: home,
        GREAT_CTO_BD_BIN: FAKE_BD,
        FAKE_BD_DELAY_SECS: String(FIXTURE_DELAY_SECS),
        GREAT_CTO_NO_UPDATE_CHECK: '1',
      },
      stdio: 'pipe',
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    return { child, port, getOut: () => out };
  });
}

async function waitForListening(getOut, deadlineMs = 10_000) {
  const deadline = Date.now() + deadlineMs;
  while (!/great_cto board →/.test(getOut()) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.match(getOut(), /great_cto board →/, `server did not report listening in time. Output so far:\n${getOut()}`);
}

test('the board answers an unrelated endpoint WHILE the boot warm-up fill is still in flight', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-cwd-'));
  const { child, port, getOut } = await startBoard({ cwd });

  try {
    await waitForListening(getOut);

    // Poll /api/version — nothing to do with bd — until the fixture's fill
    // completes (the "warmed" log line appears) or we time out. The property
    // under test: at least one 200 must land BEFORE the fill finishes. On the
    // old synchronous code, every poll before the fill finishes returns null
    // (connection accepted, never answered), because the same call that
    // fills the cache is the call blocking the response.
    const stillFilling = () => /task cache warmed|could not warm/.test(getOut());
    const statuses = await pollUntil(port, '/api/version', stillFilling, { stepMs: 150, deadlineMs: (FIXTURE_DELAY_SECS + 5) * 1000 });

    assert.ok(stillFilling(), 'the fixture must still be filling when we stop polling — otherwise this proves nothing about "while in flight"');
    assert.ok(statuses.includes(200),
      `expected at least one 200 while the fill was still in flight; got: ${JSON.stringify(statuses)}`);
  } finally {
    child.kill('SIGKILL');
  }
});
