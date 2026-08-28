// The board bound its port and then answered NOTHING for the full duration of
// a slow `bd list` at boot — the port was open, but every accepted connection
// queued behind a synchronous spawnSync in the boot warm-up, unrelated
// endpoints included. Reproduced here by spawning the REAL server.mjs as a
// child process with a real (fixture) slow `bd`, and polling /api/version —
// a plain readdirSync, nothing to do with bd — while the fixture is still
// sleeping. On the old code this test times out; it must not.
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

function getStatus(port, pathname, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

test('the board answers an unrelated endpoint while a slow bd list is still filling the boot cache', async () => {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-home-'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-cwd-'));

  const child = spawn(process.execPath, [SERVER, '--no-open'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      HOME: home,
      GREAT_CTO_BD_BIN: FAKE_BD,
      FAKE_BD_DELAY_SECS: '3',
      GREAT_CTO_NO_UPDATE_CHECK: '1',
    },
    stdio: 'pipe',
  });

  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });

  try {
    // Wait for the port to actually be listening (the log line), not a fixed
    // sleep — startup speed varies by machine.
    const deadline = Date.now() + 10_000;
    while (!/great_cto board →/.test(out) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.match(out, /great_cto board →/, `server did not report listening in time. Output so far:\n${out}`);

    // The fixture is sleeping for 3s right now (the boot warm-up kicked it
    // off synchronously or asynchronously — that's exactly what this proves).
    // Poll an endpoint with nothing to do with bd; on the OLD code this hangs
    // until the fixture wakes up.
    const status = await getStatus(port, '/api/version', 1500);
    assert.equal(status, 200, '/api/version must answer while the boot bd-list fill is still in flight');
  } finally {
    child.kill('SIGKILL');
  }
});
