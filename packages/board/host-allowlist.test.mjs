// The board only answers requests addressed to it by a name it knows (great_cto-xq9h).
//
// "Same origin" used to mean: the browser's Origin equals the Host this request
// arrived with. A page on a domain the attacker points at 127.0.0.1 (DNS rebinding)
// sends exactly that — Origin http://evil.test:PORT and Host evil.test:PORT — so it
// passed the CSRF guard. It could read every GET the board serves and POST state
// changes, gate approvals included. The bind address was loopback the whole time;
// that does not help, because the requests come from the user's own browser.
//
// Now the Host must be one the board was told about: loopback names on its port,
// the configured bind host, or an entry in GREAT_CTO_ALLOWED_HOSTS. Checked for
// every request, before routing — reads too, not only state changes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
import { hostAllowed, originAllowed } from './lib/util.mjs';
import { PORT } from './lib/config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TMP_DIRS.push(d); return d; };

// ── the rule ───────────────────────────────────────────────────────────────

test('loopback names on the board’s own port are allowed', () => {
  for (const h of ['localhost:3141', '127.0.0.1:3141', '[::1]:3141']) {
    assert.equal(hostAllowed(h, { port: 3141, bindHost: '127.0.0.1', extra: [] }), true, h);
  }
});

test('a rebinding name, a wrong port and a missing Host are refused', () => {
  const opts = { port: 3141, bindHost: '127.0.0.1', extra: [] };
  assert.equal(hostAllowed('evil.test:3141', opts), false);
  assert.equal(hostAllowed('localhost:9999', opts), false, 'the port is part of the name');
  assert.equal(hostAllowed('localhost.evil.test:3141', opts), false);
  assert.equal(hostAllowed('', opts), false);
  assert.equal(hostAllowed(undefined, opts), false);
});

test('a concrete bind host is allowed; a wildcard bind is not a name', () => {
  assert.equal(hostAllowed('10.0.0.5:3141', { port: 3141, bindHost: '10.0.0.5', extra: [] }), true);
  assert.equal(hostAllowed('0.0.0.0:3141', { port: 3141, bindHost: '0.0.0.0', extra: [] }), false);
});

test('hosts listed for a tunnel are allowed, with or without a port', () => {
  const opts = { port: 3141, bindHost: '0.0.0.0', extra: ['console.example.com', 'board.internal:8443'] };
  assert.equal(hostAllowed('console.example.com', opts), true);
  assert.equal(hostAllowed('board.internal:8443', opts), true);
  assert.equal(hostAllowed('board.internal:9000', opts), false, 'a listed port is exact');
  assert.equal(hostAllowed('CONSOLE.example.com', opts), true, 'host names are case-insensitive');
});

// The Origin check stands on its own too. The server refuses an unknown Host
// first, so the rebinding test above cannot tell whether originAllowed() still
// trusts the request's own Host — this can.
test('an Origin is same-origin only when it names an allowed host, never because it matches Host', () => {
  const req = (headers) => ({ headers });
  const evil = `evil.test:${PORT}`;
  assert.equal(originAllowed(req({ host: evil, origin: `http://${evil}` })), false,
    'Origin equal to a rebinding Host is not same-origin');
  assert.equal(originAllowed(req({ host: evil, referer: `http://${evil}/` })), false, 'nor is its Referer');
  assert.equal(originAllowed(req({ host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}` })), true);
  assert.equal(originAllowed(req({ host: `localhost:${PORT}`, referer: `http://localhost:${PORT}/board` })), true);
  assert.equal(originAllowed(req({ host: `127.0.0.1:${PORT}` })), true, 'no Origin — curl, the CLI — is still allowed');
  assert.equal(originAllowed(req({ host: `127.0.0.1:${PORT}`, origin: 'null' })), false, 'an opaque origin is not ours');
  assert.equal(originAllowed(req({ host: `127.0.0.1:${PORT}`, origin: `file://127.0.0.1:${PORT}` })), false);
});

// ── the running server ─────────────────────────────────────────────────────

function request(port, { method = 'GET', path = '/api/projects', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; if (headers.Accept === 'text/event-stream') { req.destroy(); resolve({ status: res.statusCode, body: data }); } });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? resolve({ status: 0, body: '' }) : reject(e)));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: -1, body: 'timeout' }); });
    if (body) req.write(body);
    req.end();
  });
}

async function startBoard(extraEnv = {}) {
  const project = tmp('gcto-hosts-proj-');
  const home = tmp('gcto-hosts-home-');
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  // BOARD_PORT, not PORT: config reads BOARD_PORT first, so an inherited one would win.
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: project,
    env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1', ...extraEnv },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  return { board: proc, port };
}

test('the server refuses a rebinding Host for reads, the event stream and a gate approval', async () => {
  const { board, port } = await startBoard();
  try {
    const evil = `evil.test:${port}`;
    const read = await request(port, { headers: { Host: evil } });
    assert.equal(read.status, 403, 'GET must not answer a name the board does not know');

    const sse = await request(port, { path: '/api/sse', headers: { Host: evil, Accept: 'text/event-stream' } });
    assert.equal(sse.status, 403, 'the event stream is a read too');

    const approve = await request(port, {
      method: 'POST', path: '/api/gates/g-1',
      headers: { Host: evil, Origin: `http://${evil}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(approve.status, 403, 'a matching Origin and Host on a rebinding name is not same-origin');

    const ok = await request(port, { headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(ok.status, 200, 'the board still answers on its own name');
    const okLocal = await request(port, { headers: { Host: `localhost:${port}` } });
    assert.equal(okLocal.status, 200);
  } finally {
    await reap(board);
  }
});

test('a host listed in GREAT_CTO_ALLOWED_HOSTS is served, and same-origin state changes from it pass', async () => {
  const { board, port } = await startBoard({ GREAT_CTO_ALLOWED_HOSTS: 'console.example.com' });
  try {
    const read = await request(port, { headers: { Host: 'console.example.com' } });
    assert.equal(read.status, 200);
    const post = await request(port, {
      method: 'POST', path: '/api/gates/does-not-exist',
      headers: { Host: 'console.example.com', Origin: 'https://console.example.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.notEqual(post.status, 403, 'not refused as cross-origin — whatever the route then decides about the gate');
    const foreign = await request(port, {
      method: 'POST', path: '/api/gates/does-not-exist',
      headers: { Host: 'console.example.com', Origin: 'https://evil.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(foreign.status, 403, 'an allowed Host does not make a foreign Origin same-origin');
  } finally {
    await reap(board);
  }
});
