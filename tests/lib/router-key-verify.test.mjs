// "Judge key stored" was all the board could say — a key OpenRouter rejects looked
// the same as one it accepts. verifyKey() asks OpenRouter, once, for free.
//
// Every case runs against a local stub: no request here leaves the machine, and the
// key the stub receives is asserted, so a check that sent the wrong thing would fail.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyKey, status } from '../../scripts/lib/router-key.mjs';

const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });
const cwd = () => { const d = mkdtempSync(join(tmpdir(), 'gcto-keyverify-')); TMP.push(d); return d; };

// Assembled rather than written: a literal is indistinguishable from a real key to a scanner.
const KEY = ['sk', 'or', 'v1', 'abcdefghijklmnopqrstuvwxyz01'].join('-');

async function stub(handler) {
  const seen = [];
  const srv = createServer((req, res) => { seen.push({ url: req.url, auth: req.headers.authorization }); handler(req, res); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, seen, close: () => new Promise((r) => srv.close(r)) };
}
const env = (base, extra = {}) => ({ OPENROUTER_API_KEY: KEY, GREAT_CTO_OPENROUTER_BASE: base, ...extra });

test('a key OpenRouter accepts is verified, with its limit and usage, and the key is not returned', async () => {
  const s = await stub((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: { limit: null, usage: 0.25 } })); });
  try {
    const r = await verifyKey({ cwd: cwd(), env: env(s.base) });
    assert.equal(r.state, 'verified');
    assert.equal(r.usage, 0.25);
    assert.equal(r.limit, null);
    assert.equal(r.fingerprint, status({ cwd: cwd(), env: env(s.base) }).fingerprint);
    assert.deepEqual(s.seen, [{ url: '/api/v1/key', auth: `Bearer ${KEY}` }], 'one request, to the key endpoint, carrying the key');
    assert.equal(JSON.stringify(r).includes(KEY), false, 'the result never carries the key');
  } finally { await s.close(); }
});

test('401 and 403 are rejected', async () => {
  for (const code of [401, 403]) {
    const s = await stub((req, res) => { res.writeHead(code); res.end('{}'); });
    try {
      const r = await verifyKey({ cwd: cwd(), env: env(s.base) });
      assert.equal(r.state, 'rejected', String(code));
      assert.equal(r.http, code);
    } finally { await s.close(); }
  }
});

test('a server error, no answer, or a timeout is unreachable — never rejected', async () => {
  const s500 = await stub((req, res) => { res.writeHead(502); res.end(); });
  try {
    const r = await verifyKey({ cwd: cwd(), env: env(s500.base) });
    assert.equal(r.state, 'unreachable');
    assert.equal(r.http, 502);
  } finally { await s500.close(); }

  const closed = await stub(() => {});
  const base = closed.base;
  await closed.close();
  assert.equal((await verifyKey({ cwd: cwd(), env: env(base) })).state, 'unreachable', 'connection refused');

  const hang = await stub(() => { /* never answers */ });
  try {
    const r = await verifyKey({ cwd: cwd(), env: env(hang.base), timeoutMs: 200 });
    assert.equal(r.state, 'unreachable');
    assert.equal(r.reason, 'timed out');
  } finally { hang.close(); }
});

test('no key is absent, and nothing is sent', async () => {
  const s = await stub((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    // An explicit empty home: without it the real ~/.great_cto/secrets.env is found.
    const r = await verifyKey({ cwd: cwd(), home: cwd(), env: { GREAT_CTO_OPENROUTER_BASE: s.base } });
    assert.equal(r.state, 'absent');
    assert.equal(s.seen.length, 0);
  } finally { await s.close(); }
});
