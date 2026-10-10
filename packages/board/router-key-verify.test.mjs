// The board's judge-key line said "not verified" for every key, forever. These pin the
// live check on the real server: POST /api/router-key/verify asks OpenRouter (a local
// stub here), and GET /api/router-key carries that answer — for the checked key only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP = [];
// maxRetries: the board's bd is still flushing .beads/eventsData into the temp
// home when the suite ends; a plain rmdir then fails ENOTEMPTY (3.58.0 publish).
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); TMP.push(d); return d; };
const KEY = ['sk', 'or', 'v1', 'abcdefghijklmnopqrstuvwxyz01'].join('-');

async function stub(code) {
  const srv = createServer((req, res) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: { limit: null, usage: 0 } })); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

async function board(openrouterBase, entry = SERVER) {
  const home = tmp('gcto-keyverify-home-');
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  writeFileSync(join(home, '.great_cto', 'secrets.env'), `OPENROUTER_API_KEY=${KEY}\n`);
  const cwd = tmp('gcto-keyverify-proj-');
  mkdirSync(join(cwd, '.great_cto'), { recursive: true });
  writeFileSync(join(cwd, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  const { port, proc } = await startServerOnFreePort({
    entry, cwd,
    env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1', OPENROUTER_API_KEY: '', GREAT_CTO_OPENROUTER_BASE: openrouterBase },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  return { port, proc, home };
}

test('verify asks OpenRouter; GET then reports the answer, and never the key', async t => {
  const or = await stub(200);
  t.after(() => or.close());
  const { port, proc } = await board(or.base);
  try {
    const before = await (await fetch(`http://127.0.0.1:${port}/api/router-key`)).json();
    assert.equal(before.state, 'present');
    assert.equal(before.verification, null, 'nothing checked yet — GET itself makes no request');

    const v = await fetch(`http://127.0.0.1:${port}/api/router-key/verify`, {
      method: 'POST', headers: { Origin: `http://127.0.0.1:${port}` },
    });
    assert.equal(v.status, 200);
    assert.equal((await v.json()).state, 'verified');

    const text = await (await fetch(`http://127.0.0.1:${port}/api/router-key`)).text();
    assert.equal(JSON.parse(text).verification.state, 'verified');
    assert.equal(text.includes(KEY), false, 'GET never carries the key');
  } finally { proc.kill(); }
});

test('a rejected key is reported as rejected', async t => {
  const or = await stub(401);
  t.after(() => or.close());
  const { port, proc } = await board(or.base);
  try {
    const v = await fetch(`http://127.0.0.1:${port}/api/router-key/verify`, {
      method: 'POST', headers: { Origin: `http://127.0.0.1:${port}` },
    });
    assert.equal((await v.json()).state, 'rejected');
  } finally { proc.kill(); }
});

test('another origin cannot make the board spend the key', async t => {
  const or = await stub(200);
  t.after(() => or.close());
  const { port, proc } = await board(or.base);
  try {
    const v = await fetch(`http://127.0.0.1:${port}/api/router-key/verify`, {
      method: 'POST', headers: { Origin: 'https://evil.example' },
    });
    assert.equal(v.status, 403);
  } finally { proc.kill(); }
});

test('the page shows the check, not a permanent "not verified"', () => {
  const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');
  assert.equal(html.includes('· not verified'), false);
  assert.match(html, /· verified</);
  assert.match(html, /rejected by OpenRouter/);
  assert.match(html, /could not check/);
});

test('failed board startup still tears down its local provider stub', async t => {
  const or = await stub(200);
  t.after(() => or.close());
  await assert.rejects(board(or.base, join(HERE, 'nonexistent-fixture-server.mjs')), /server exited|Cannot find module/);
});
