// The alert relay sends mail only for the board that verified the address.
//
// `POST /notify` used to need nothing but a verified address in the body: anyone who
// knew (or guessed) one could send up to 100 emails a day to it, with any title and
// body, from the product's own sender. `/notify/status?to=` told anyone whether an
// address was registered.
//
// Confirming the 6-digit code now returns a send key, once. The relay stores only
// its hash; the board keeps the key in a 0600 file and never hands it to the page.
// Addresses verified before this have no key: they keep working until the operator
// sets REQUIRE_SEND_KEY=1 on the worker, and then must verify again.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import worker from './cloudflare-worker/worker.js';
import { relayHeaders } from './lib/alerts.mjs';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); TMP.push(d); return d; };

// ── the relay ──────────────────────────────────────────────────────────────

function fakeEnv(extra = {}) {
  const store = new Map();
  return {
    store,
    RESEND_API_KEY: 'test-not-a-real-key',
    STATE: {
      get: async (k) => (store.has(k) ? store.get(k) : null),
      put: async (k, v) => { store.set(k, v); },
      delete: async (k) => { store.delete(k); },
    },
    ...extra,
  };
}

/** Run `fn` with outbound mail stubbed; returns what would have been sent. */
async function withMailStub(fn) {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 'stub' }), { status: 200 });
  };
  try { return { result: await fn(), sent }; } finally { globalThis.fetch = real; }
}

const call = (env, path, { method = 'POST', body, key } = {}) => worker.fetch(new Request(`https://relay.test${path}`, {
  method,
  headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);

async function verified(env, to = 'owner@example.com', extra = { keyed: true }) {
  await withMailStub(() => call(env, '/notify/verify', { body: { to } }));
  const code = env.store.get(`code:${to}`);
  const r = await call(env, '/notify/confirm', { body: { to, code, ...extra } });
  return { to, body: await r.json(), status: r.status };
}

const alert = (to) => ({ to, title: 'A gate is waiting', body: 'x', event: 'gate.stale' });

test('confirming the code returns a send key once, and the relay keeps only its hash', async () => {
  const env = fakeEnv();
  const { to, body, status } = await verified(env);
  assert.equal(status, 200);
  assert.match(body.send_key, /^[A-Za-z0-9_-]{40,}$/);
  const record = JSON.parse(env.store.get(`verified:${to}`));
  assert.match(record.key_hash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(env.store.get(`verified:${to}`), new RegExp(body.send_key), 'the key itself is not stored');
});

test('an alert for a keyed address needs that key', async () => {
  const env = fakeEnv();
  const { to, body } = await verified(env);

  const none = await withMailStub(() => call(env, '/notify', { body: alert(to) }));
  assert.equal(none.result.status, 401);
  assert.equal((await none.result.json()).error, 'send_key_required');
  assert.equal(none.sent.length, 0, 'nothing is mailed');

  const wrong = await withMailStub(() => call(env, '/notify', { body: alert(to), key: 'x'.repeat(43) }));
  assert.equal(wrong.result.status, 401);
  assert.equal(wrong.sent.length, 0);

  const ok = await withMailStub(() => call(env, '/notify', { body: alert(to), key: body.send_key }));
  assert.equal(ok.result.status, 200);
  assert.equal(ok.sent.length, 1);
});

test('one address’s key does not send for another', async () => {
  const env = fakeEnv();
  const a = await verified(env, 'a@example.com');
  const b = await verified(env, 'b@example.com');
  const r = await withMailStub(() => call(env, '/notify', { body: alert(b.to), key: a.body.send_key }));
  assert.equal(r.result.status, 401);
  assert.equal(r.sent.length, 0);
});

test('an address verified before keys existed keeps working until the operator enforces keys', async () => {
  const legacy = () => JSON.stringify({ verified_at: 1, last_send_at: 0, count_24h: 0 });

  const open = fakeEnv(); open.store.set('verified:old@example.com', legacy());
  const sent = await withMailStub(() => call(open, '/notify', { body: alert('old@example.com') }));
  assert.equal(sent.result.status, 200, 'warn-then-enforce: existing installs are not cut off by a deploy');

  const strict = fakeEnv({ REQUIRE_SEND_KEY: '1' }); strict.store.set('verified:old@example.com', legacy());
  const refused = await withMailStub(() => call(strict, '/notify', { body: alert('old@example.com') }));
  assert.equal(refused.result.status, 401);
  assert.equal((await refused.result.json()).error, 'reverify_required');
  assert.equal(refused.sent.length, 0);
});

test('a board from before keys verifies and sends as it always did', async () => {
  const env = fakeEnv();
  const { to, body } = await verified(env, 'old-board@example.com', {});
  assert.equal(body.send_key, undefined, 'no key is issued to a board that would drop it');
  const r = await withMailStub(() => call(env, '/notify', { body: alert(to) }));
  assert.equal(r.result.status, 200, 'so its alerts are not silently refused after a relay deploy');
});

test('verifying again replaces the key', async () => {
  const env = fakeEnv();
  const first = await verified(env);
  env.store.delete(`code_sent:${first.to}`);
  const second = await verified(env);
  assert.notEqual(second.body.send_key, first.body.send_key);
  const old = await withMailStub(() => call(env, '/notify', { body: alert(first.to), key: first.body.send_key }));
  assert.equal(old.result.status, 401, 'the previous key stops working: re-verifying is how a leaked key is revoked');
});

test('status does not say whether a keyed address is registered without its key', async () => {
  const env = fakeEnv();
  const { to, body } = await verified(env);
  const anon = await (await call(env, `/notify/status?to=${encodeURIComponent(to)}`, { method: 'GET' })).json();
  assert.deepEqual(anon, { verified: false });
  const own = await (await call(env, `/notify/status?to=${encodeURIComponent(to)}`, { method: 'GET', key: body.send_key })).json();
  assert.equal(own.verified, true);
});

// ── the board ──────────────────────────────────────────────────────────────

test('the board sends its key as a bearer token, and nothing when it has none', () => {
  assert.deepEqual(relayHeaders({ send_key: 'abc' }), { 'Content-Type': 'application/json', Authorization: 'Bearer abc' });
  assert.deepEqual(relayHeaders({}), { 'Content-Type': 'application/json' });
  assert.deepEqual(relayHeaders({ send_key: 42 }), { 'Content-Type': 'application/json' });
});

test('the board keeps the key in a private file, off the page, and uses it to send', async () => {
  const seen = [];
  const relay = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization || null, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(req.url === '/notify/confirm' ? { ok: true, send_key: 'k'.repeat(43) } : { ok: true }));
    });
  });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const project = tmp('gcto-key-proj-'); const home = tmp('gcto-key-home-');
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: project,
    env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1', GREATCTO_NOTIFY_URL: `http://127.0.0.1:${relay.address().port}` },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  const post = (payload) => fetch(`http://127.0.0.1:${port}/api/notifications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  try {
    const confirm = await post({ action: 'confirm', to: 'owner@example.com', code: '123456' });
    assert.equal(confirm.status, 200);
    assert.doesNotMatch(await confirm.text(), /k{43}/, 'the page never receives the key');

    const file = join(home, '.great_cto', 'notifications.json');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).send_key, 'k'.repeat(43));
    assert.equal(statSync(file).mode & 0o777, 0o600, 'the file that holds the key is private');

    const state = await (await fetch(`http://127.0.0.1:${port}/api/notifications`)).text();
    assert.doesNotMatch(state, /k{43}/, 'nor does reading the settings return it');

    const sent = await post({ action: 'test' });
    assert.equal(sent.status, 200);
    assert.equal(seen.find((s) => s.url === '/notify')?.auth, `Bearer ${'k'.repeat(43)}`);
    assert.equal(JSON.parse(seen.find((s) => s.url === '/notify/confirm').body).keyed, true, 'this board asks for a key');
  } finally {
    await reap(proc);
    await new Promise((r) => relay.close(r));
  }
});
