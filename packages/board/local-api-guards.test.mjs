// What a page on another origin, and a board bound beyond loopback, may do.
//
// Two gaps, both found by reading the server rather than by an incident:
//
//   1. Every response carried `Access-Control-Allow-Origin: *`, and reads were
//      never checked against the Origin. Any page open in the same browser could
//      fetch http://localhost:<port>/api/... and read tasks, verdicts and costs.
//      The Host allowlist does not help: the request is addressed to localhost.
//
//   2. `--host 0.0.0.0` started a board with no authentication at all, and the log
//      said operators "authenticate via invite links". The board has no invites.
//
// Now a cross-origin request to /api/* is refused and gets no CORS header, and a
// bind beyond loopback is refused unless the operator states that authentication
// sits in front of the board.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
import { freePort } from '../../tests/helpers/free-port.mjs';
import { corsOriginFor, crossSiteRead } from './lib/util.mjs';
import { bindHostFrom, bindRefusal, PORT } from './lib/config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TMP_DIRS.push(d); return d; };
const req = (headers) => ({ headers });

// ── the rules ──────────────────────────────────────────────────────────────

test('a CORS origin is echoed only for the board’s own origins', () => {
  assert.equal(corsOriginFor(req({ origin: `http://localhost:${PORT}` })), `http://localhost:${PORT}`);
  assert.equal(corsOriginFor(req({ origin: `http://127.0.0.1:${PORT}` })), `http://127.0.0.1:${PORT}`);
  assert.equal(corsOriginFor(req({ origin: 'https://example.org' })), null);
  assert.equal(corsOriginFor(req({ origin: 'http://localhost:5173' })), null, 'another local port is another origin');
  assert.equal(corsOriginFor(req({ origin: 'null' })), null);
  assert.equal(corsOriginFor(req({})), null, 'no Origin, no CORS header');
});

test('a read is cross-site when the browser says so or names a foreign origin', () => {
  assert.equal(crossSiteRead(req({ origin: 'https://example.org' })), true);
  assert.equal(crossSiteRead(req({ referer: 'https://example.org/page' })), true, 'an <img> or a link carries a Referer');
  assert.equal(crossSiteRead(req({ 'sec-fetch-site': 'cross-site' })), true, 'even with Referer stripped');
  assert.equal(crossSiteRead(req({ origin: 'http://localhost:5173' })), true);
  assert.equal(crossSiteRead(req({ origin: `http://localhost:${PORT}`, 'sec-fetch-site': 'same-origin' })), false);
  assert.equal(crossSiteRead(req({ 'sec-fetch-site': 'none' })), false, 'typed into the address bar');
  assert.equal(crossSiteRead(req({})), false, 'curl, the CLI, the MCP server, hooks');
});

test('the bind host ignores GREAT_CTO_HOST when it names an agent host, not an address', () => {
  assert.equal(bindHostFrom(['node', 'server.mjs'], {}), '127.0.0.1');
  assert.equal(bindHostFrom(['node', 'server.mjs'], { GREAT_CTO_HOST: 'codex' }), '127.0.0.1',
    'hooks set GREAT_CTO_HOST=codex for their children; that is not a bind address');
  assert.equal(bindHostFrom(['node', 'server.mjs'], { GREAT_CTO_HOST: 'claude-code' }), '127.0.0.1');
  assert.equal(bindHostFrom(['node', 'server.mjs'], { GREAT_CTO_HOST: '0.0.0.0' }), '0.0.0.0', 'the legacy variable still binds an address');
  assert.equal(bindHostFrom(['node', 'server.mjs'], { GREAT_CTO_HOST: '127.0.0.1' }), '127.0.0.1');
  assert.equal(bindHostFrom(['node', 'server.mjs'], { GREAT_CTO_BOARD_HOST: '192.168.1.5', GREAT_CTO_HOST: 'codex' }), '192.168.1.5');
  assert.equal(bindHostFrom(['node', 'server.mjs', '--host', '::'], { GREAT_CTO_BOARD_HOST: '10.0.0.1' }), '::', 'the flag wins');
});

test('a bind beyond loopback is refused until the operator says authentication is in front', () => {
  for (const h of ['127.0.0.1', 'localhost', '::1', '[::1]']) assert.equal(bindRefusal(h, {}, []), null, h);
  for (const h of ['0.0.0.0', '::', '192.168.1.5']) {
    const why = bindRefusal(h, {}, []);
    assert.match(why, /no authentication/i, h);
    assert.match(why, /GREAT_CTO_BOARD_BEHIND_AUTH=1/, 'the message names the way out');
    assert.doesNotMatch(why, /invite/i, 'the board has no invites; the message must not promise them');
  }
  assert.equal(bindRefusal('0.0.0.0', { GREAT_CTO_BOARD_BEHIND_AUTH: '1' }, []), null);
  assert.equal(bindRefusal('0.0.0.0', {}, ['--behind-auth']), null);
  assert.match(bindRefusal('0.0.0.0', { GREAT_CTO_BOARD_BEHIND_AUTH: '0' }, []), /no authentication/i);
});

// ── the running server ─────────────────────────────────────────────────────

function request(port, { method = 'GET', path = '/api/projects', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; if (headers.Accept === 'text/event-stream') { r.destroy(); resolve({ status: res.statusCode, headers: res.headers, body: data }); } });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', (e) => (e.code === 'ECONNRESET' ? resolve({ status: 0, headers: {}, body: '' }) : reject(e)));
    r.setTimeout(5000, () => { r.destroy(); resolve({ status: -1, headers: {}, body: 'timeout' }); });
    r.end();
  });
}

function fixture() {
  const project = tmp('gcto-guards-proj-');
  const home = tmp('gcto-guards-home-');
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  return { project, home };
}

test('a page on another origin cannot read the API, the event stream, or get a CORS header', async () => {
  const { project, home } = fixture();
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: project,
    env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1' },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  try {
    const foreign = await request(port, { headers: { Origin: 'https://example.org' } });
    assert.equal(foreign.status, 403, 'a cross-origin read is refused');
    assert.equal(foreign.headers['access-control-allow-origin'], undefined, 'and nothing lets the page read the refusal');

    const otherPort = await request(port, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(otherPort.status, 403, 'another local port is another origin');

    const img = await request(port, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(img.status, 403, 'a no-cors request with no Origin is still cross-site');

    const sse = await request(port, { path: '/api/sse', headers: { Origin: 'https://example.org', Accept: 'text/event-stream' } });
    assert.equal(sse.status, 403, 'the event stream is a read too');

    const own = await request(port, { headers: { Origin: `http://localhost:${port}`, 'Sec-Fetch-Site': 'same-origin' } });
    assert.equal(own.status, 200, 'the board’s own page still reads');
    assert.equal(own.headers['access-control-allow-origin'], `http://localhost:${port}`);
    assert.match(String(own.headers.vary || ''), /origin/i, 'an echoed origin must vary the cache');

    const tool = await request(port);
    assert.equal(tool.status, 200, 'the CLI, hooks and the MCP server send no Origin and still read');
    assert.equal(tool.headers['access-control-allow-origin'], undefined);

    const link = await request(port, { path: '/', headers: { Referer: 'https://mail.example.org/', 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(link.status, 200, 'a link from an alert email still opens the page itself');
  } finally {
    await reap(proc);
  }
});

test('the server exits instead of binding beyond loopback with no authentication', async () => {
  const { project, home } = fixture();
  const port = await freePort();
  const env = { ...process.env, HOME: home, BOARD_PORT: String(port), GREAT_CTO_NO_UPDATE_CHECK: '1' };
  delete env.GREAT_CTO_HOST; delete env.GREAT_CTO_BOARD_HOST; delete env.GREAT_CTO_BOARD_BEHIND_AUTH;
  const r = spawnSync(process.execPath, [SERVER, '--no-open', '--host', '0.0.0.0'], { cwd: project, env, encoding: 'utf8', timeout: 8000 });
  assert.equal(r.status, 1, `expected a refusal, got status ${r.status} signal ${r.signal}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /no authentication/i);
  assert.match(r.stdout + r.stderr, /GREAT_CTO_BOARD_BEHIND_AUTH=1/);
});
