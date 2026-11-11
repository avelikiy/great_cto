// The share relay: a paused report is not shown, a report cannot touch the site
// that hosts it, and only the board that published a report can change it.
//
// The worker that owns greatcto.systems/r/* was read from the deployment on
// 2026-11-11; its source was not in the repository. Reading it showed:
//
//   - "paused" returned the stored page with `{{PAUSED}}` replaced by `true`, but
//     the board substitutes that placeholder before it publishes, so pausing a
//     report changed nothing a visitor could see;
//   - pause and resume needed only the report's id, which is in its public URL;
//   - the page was served from the product's own origin with no policy at all;
//   - an expired report stopped being served and stayed in the bucket;
//   - every republish (one per approved gate) made a new public URL and left the
//     previous report up for 30 days.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import worker, { REPORT_CSP } from './cloudflare-worker/share-worker.js';
import { shareStateForPage } from './lib/share.mjs';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); TMP.push(d); return d; };

// ── the relay ──────────────────────────────────────────────────────────────

function fakeEnv(extra = {}) {
  const objects = new Map();
  return {
    objects,
    SHARE_BUCKET: {
      get: async (k) => (objects.has(k) ? { text: async () => objects.get(k) } : null),
      put: async (k, v) => { objects.set(k, String(v)); },
      delete: async (k) => { objects.delete(k); },
    },
    ...extra,
  };
}
const PAGE = '<!doctype html><title>report</title><p>SHIPPED-CONTENT</p>';
const call = (env, path, { method = 'POST', body, key } = {}) => worker.fetch(new Request(`https://share.test${path}`, {
  method,
  headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);
async function published(env, html = PAGE) {
  const r = await call(env, '/r/', { body: { html, manage: true } });
  assert.equal(r.status, 200);
  return r.json();
}
const view = (env, hash) => call(env, `/r/${hash}`, { method: 'GET' });

test('publishing returns a manage key once and stores only its hash', async () => {
  const env = fakeEnv();
  const p = await published(env);
  assert.match(p.manage_key, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(p.url, new RegExp(`/r/${p.hash}$`));
  const stored = [...env.objects.values()].join('\n');
  assert.doesNotMatch(stored, new RegExp(p.manage_key));
  assert.match(JSON.parse(env.objects.get(`r/${p.hash}/state.json`)).key_hash, /^[0-9a-f]{64}$/);
});

test('a report is served sandboxed, uncached and unindexed', async () => {
  const env = fakeEnv();
  const p = await published(env);
  const r = await view(env, p.hash);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /SHIPPED-CONTENT/);
  const csp = r.headers.get('content-security-policy');
  assert.equal(csp, REPORT_CSP);
  assert.match(csp, /(^|; )sandbox /, 'sandboxed');
  assert.doesNotMatch(csp, /allow-same-origin/, 'in an opaque origin: no cookies or storage of the hosting site');
  assert.doesNotMatch(csp, /allow-forms/, 'no form can be submitted from it');
  assert.match(csp, /default-src 'none'/, 'and nothing is loaded from the network');
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('a paused report is not shown, whatever the stored page contains', async () => {
  const env = fakeEnv();
  const p = await published(env);
  const pause = await call(env, `/r/${p.hash}`, { body: { enabled: false }, key: p.manage_key });
  assert.equal(pause.status, 200);
  const r = await view(env, p.hash);
  assert.equal(r.status, 410);
  assert.doesNotMatch(await r.text(), /SHIPPED-CONTENT/, 'the old worker served the full report here');

  await call(env, `/r/${p.hash}`, { body: { enabled: true }, key: p.manage_key });
  assert.equal((await view(env, p.hash)).status, 200, 'and resuming brings it back');
});

test('changing a report needs its key', async () => {
  const env = fakeEnv();
  const p = await published(env);
  for (const body of [{ enabled: false }, { enabled: true }, { html: PAGE.replace('SHIPPED', 'REPLACED') }, { delete: true }]) {
    const none = await call(env, `/r/${p.hash}`, { body });
    assert.equal(none.status, 401, JSON.stringify(body));
    assert.equal((await none.json()).error, 'manage_key_required');
    const wrong = await call(env, `/r/${p.hash}`, { body, key: 'x'.repeat(43) });
    assert.equal(wrong.status, 401, JSON.stringify(body));
  }
  assert.match(await (await view(env, p.hash)).text(), /SHIPPED-CONTENT/, 'nothing changed');
  const other = await published(env);
  const cross = await call(env, `/r/${p.hash}`, { body: { enabled: false }, key: other.manage_key });
  assert.equal(cross.status, 401, 'another report’s key is not this one’s');
});

test('the holder of the key can replace the report in place and delete it', async () => {
  const env = fakeEnv();
  const p = await published(env);
  const replaced = await call(env, `/r/${p.hash}`, { body: { html: PAGE.replace('SHIPPED', 'REPLACED'), enabled: true }, key: p.manage_key });
  assert.equal(replaced.status, 200);
  assert.match(await (await view(env, p.hash)).text(), /REPLACED-CONTENT/, 'same link, new content');

  const gone = await call(env, `/r/${p.hash}`, { body: { delete: true }, key: p.manage_key });
  assert.equal(gone.status, 200);
  assert.equal((await view(env, p.hash)).status, 404);
  assert.equal(env.objects.size, 0, 'nothing of it is left in the bucket');
});

test('a report published before keys existed can be paused by its id, and nothing more', async () => {
  const seed = (env) => {
    env.objects.set('r/legacyreport1/index.html', PAGE);
    env.objects.set('r/legacyreport1/state.json', JSON.stringify({ enabled: true, expires_at: new Date(Date.now() + 86400e3).toISOString() }));
  };
  const env = fakeEnv(); seed(env);
  for (const body of [{ enabled: true }, { html: PAGE }, { delete: true }, { enabled: false, html: PAGE }]) {
    assert.equal((await call(env, '/r/legacyreport1', { body })).status, 401, JSON.stringify(body));
  }
  assert.equal((await call(env, '/r/legacyreport1', { body: { enabled: false } })).status, 200, 'installed boards can still turn sharing off');
  assert.equal((await view(env, 'legacyreport1')).status, 410);

  const strict = fakeEnv({ REQUIRE_MANAGE_KEY: '1' }); seed(strict);
  assert.equal((await call(strict, '/r/legacyreport1', { body: { enabled: false } })).status, 401);
});

test('a board from before keys publishes and pauses as it always did', async () => {
  const env = fakeEnv();
  const p = await (await call(env, '/r/', { body: { html: PAGE } })).json();
  assert.equal(p.manage_key, undefined, 'no key is issued to a publisher that would drop it');
  assert.equal((await call(env, `/r/${p.hash}`, { body: { enabled: false } })).status, 200, 'so it can still turn its report off');
  assert.equal((await view(env, p.hash)).status, 410);
});

test('an expired report is removed from the bucket when it is asked for', async () => {
  const env = fakeEnv();
  const p = await published(env);
  const state = JSON.parse(env.objects.get(`r/${p.hash}/state.json`));
  env.objects.set(`r/${p.hash}/state.json`, JSON.stringify({ ...state, expires_at: new Date(Date.now() - 1000).toISOString() }));
  const r = await view(env, p.hash);
  assert.equal(r.status, 410);
  assert.doesNotMatch(await r.text(), /SHIPPED-CONTENT/);
  assert.equal(env.objects.size, 0);
});

test('oversized, empty and malformed uploads are refused; a lifetime is capped at 30 days', async () => {
  const env = fakeEnv();
  assert.equal((await call(env, '/r/', { body: { html: '' } })).status, 400);
  assert.equal((await call(env, '/r/', { body: { html: 'x'.repeat(512_001) } })).status, 413);
  assert.equal((await worker.fetch(new Request('https://share.test/r/', { method: 'POST', body: '{' }), env)).status, 400);
  const p = await (await call(env, '/r/', { body: { html: PAGE, ttl: 10 * 365 * 86400 } })).json();
  assert.ok(new Date(p.expires_at) - Date.now() <= 30 * 86400e3 + 5000);
});

// ── the board ──────────────────────────────────────────────────────────────

test('the manage key is never part of what the page is given', () => {
  assert.deepEqual(shareStateForPage({ enabled: true, url: 'u', hash: 'h', manage_key: 'secret' }), { enabled: true, url: 'u', hash: 'h' });
  assert.deepEqual(shareStateForPage({ error: 'x' }), { error: 'x' });
});

test('the board keeps the key private, republishes in place, and says so when pausing fails', async () => {
  const seen = [];
  let pauseStatus = 200;
  const relay = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      seen.push({ url: req.url, auth: req.headers.authorization || null, keys: Object.keys(payload).sort(), manage: payload.manage });
      const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.url === '/r/') return reply(200, { url: 'https://share.test/r/abc12345', hash: 'abc12345', manage_key: 'm'.repeat(43) });
      if (payload.enabled === false) return reply(pauseStatus, pauseStatus === 200 ? { hash: 'abc12345', enabled: false } : { error: 'bad_manage_key' });
      return reply(200, { hash: 'abc12345', enabled: true });
    });
  });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const project = tmp('gcto-share-proj-'); const home = tmp('gcto-share-home-');
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  writeFileSync(join(project, '.great_cto', 'tasks.md'), '# Tasks\n');
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: project,
    env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1', GREATCTO_SHARE_URL: `http://127.0.0.1:${relay.address().port}/r/` },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  const post = (payload) => fetch(`http://127.0.0.1:${port}/api/share`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const stateFile = () => { const dir = join(home, '.great_cto'); return join(dir, readdirSync(dir).find((f) => f.startsWith('share-'))); };
  try {
    const on = await post({ enabled: true });
    const onText = await on.text();
    assert.equal(JSON.parse(onText).url, 'https://share.test/r/abc12345', onText);
    assert.doesNotMatch(onText, /m{43}/, 'the page never receives the key');
    assert.equal(seen[0].manage, true, 'this board asks for a manage key');
    assert.equal(JSON.parse(readFileSync(stateFile(), 'utf8')).manage_key, 'm'.repeat(43));
    assert.equal(statSync(stateFile()).mode & 0o777, 0o600);
    assert.doesNotMatch(await (await fetch(`http://127.0.0.1:${port}/api/share`)).text(), /m{43}/);

    const again = await post({ enabled: true, force: true });
    assert.equal((await again.json()).url, 'https://share.test/r/abc12345', 'the link does not change');
    const republish = seen.at(-1);
    assert.equal(republish.url, '/r/abc12345', 'replaced in place, not published as a second public report');
    assert.equal(republish.auth, `Bearer ${'m'.repeat(43)}`);
    assert.ok(republish.keys.includes('html'));

    pauseStatus = 401;
    const failed = await (await post({ enabled: false })).json();
    assert.match(failed.error, /still public/i, 'a pause the relay refused is not reported as off');
    assert.equal(JSON.parse(readFileSync(stateFile(), 'utf8')).enabled, true, 'and the board does not record it as off');

    pauseStatus = 200;
    const off = await (await post({ enabled: false })).json();
    assert.equal(off.enabled, false);
    assert.equal(off.error, undefined);
    assert.equal(seen.at(-1).auth, `Bearer ${'m'.repeat(43)}`);
  } finally {
    await reap(proc);
    await new Promise((r) => relay.close(r));
  }
});
