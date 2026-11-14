// great_cto share reports — Cloudflare Worker (`great-cto-share`), R2-backed.
//
//   POST /r/          publish a report        → { url, hash, expires_at, manage_key }
//   POST /r/<hash>    pause / resume / replace / delete — needs the report's manage key
//   GET  /r/<hash>    serve the report
//
// Bindings: SHARE_BUCKET (R2). Optional var: REQUIRE_MANAGE_KEY ("1").
//
// This file is the source of the worker that owns greatcto.systems/r/*. Until
// 2026-11-11 that source lived only in the deployed worker. Three things changed
// when it was brought here:
//
//   1. A paused report is no longer served. The worker used to return the stored
//      page with `{{PAUSED}}` replaced by `true`, but the board substitutes that
//      placeholder before publishing, so a "paused" link showed the full report.
//   2. A report is served inside a CSP sandbox. It is HTML uploaded by whoever
//      called POST /r/, on the product's own domain: sandboxed, it runs in an
//      opaque origin, cannot read this site's cookies or storage, submit forms,
//      navigate the top window or load anything from the network.
//   3. Changing a report needs the key returned when it was published. Before,
//      anyone who had the link could pause it. Reports published before keys
//      existed can still be paused (the harmless direction) by their id alone,
//      unless REQUIRE_MANAGE_KEY=1; they cannot be resumed, replaced or deleted.
//
// An expired report is deleted from the bucket the first time it is asked for.
// A lifecycle rule on the bucket should remove the ones nobody asks for.

const MAX_HTML = 512_000;
const MAX_TTL_SEC = 30 * 24 * 60 * 60;
const HASH_RE = /^\/r\/([a-zA-Z0-9_-]{8,32})\/?$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// What a served report may do. `sandbox` without allow-same-origin gives it an
// opaque origin; the rest closes the network.
export const REPORT_CSP = [
  // user-activated top navigation: the page's own links must work when clicked
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': REPORT_CSP,
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});
const fail = (error, status) => json({ error }, status);

function notice(message, status) {
  const body = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#0a0d12;color:#64748b;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:12px;margin:0;padding:24px;text-align:center}</style></head><body><div style="font-size:20px;color:#e2e8f0">${message}</div><div style="font-size:13px">Powered by <a href="https://greatcto.systems" style="color:#3b82f6">great_cto</a></div></body></html>`;
  return new Response(body, { status, headers: PAGE_HEADERS });
}

function randomToken(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sameDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearerOf(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  return m ? m[1] : '';
}

const pageKey = (hash) => `r/${hash}/index.html`;
const stateKey = (hash) => `r/${hash}/state.json`;

async function readState(env, hash) {
  const obj = await env.SHARE_BUCKET.get(stateKey(hash));
  if (!obj) return null;
  try { return JSON.parse(await obj.text()); } catch { return null; }
}

const writeState = (env, hash, state) => env.SHARE_BUCKET.put(stateKey(hash), JSON.stringify(state), {
  httpMetadata: { contentType: 'application/json' },
});

const writePage = (env, hash, html, expiresAt) => env.SHARE_BUCKET.put(pageKey(hash), html, {
  httpMetadata: { contentType: 'text/html; charset=utf-8' },
  customMetadata: { expires_at: expiresAt },
});

async function remove(env, hash) {
  await env.SHARE_BUCKET.delete(pageKey(hash));
  await env.SHARE_BUCKET.delete(stateKey(hash));
}

const expired = (state) => Boolean(state.expires_at) && new Date(state.expires_at) < new Date();

function ttlOf(body) {
  const n = Number(body?.ttl);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_TTL_SEC) : MAX_TTL_SEC;
}

function htmlProblem(html) {
  if (!html || typeof html !== 'string') return ['html required', 400];
  if (html.length > MAX_HTML) return ['html too large (max 500KB)', 413];
  return null;
}

async function publish(request, env) {
  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON', 400); }
  const problem = htmlProblem(body?.html);
  if (problem) return fail(...problem);

  const hash = randomToken(12);
  const expires_at = new Date(Date.now() + ttlOf(body) * 1000).toISOString();
  const state = { enabled: true, published_at: new Date().toISOString(), expires_at };
  const reply = { url: `${new URL(request.url).origin}/r/${hash}`, hash, expires_at };
  // A key only for a publisher that asks for one. A board from before keys would
  // drop the key it was handed and could then never pause its own report.
  if (body.manage === true) {
    reply.manage_key = randomToken(32);
    // Returned once and never stored: only its hash is.
    state.key_hash = await sha256Hex(reply.manage_key);
  }
  await writePage(env, hash, body.html, expires_at);
  await writeState(env, hash, state);
  return json(reply);
}

async function serve(hash, env) {
  const state = await readState(env, hash);
  if (!state) return notice('Report not found.', 404);
  if (expired(state)) {
    await remove(env, hash);
    return notice('This report has expired.', 410);
  }
  // Never the stored page: a paused report is not shown.
  if (!state.enabled) return notice('Report paused by owner.', 410);
  const page = await env.SHARE_BUCKET.get(pageKey(hash));
  if (!page) return notice('Report not found.', 404);
  return new Response((await page.text()).replace('{{PAUSED}}', 'false'), { headers: PAGE_HEADERS });
}

async function manage(hash, request, env) {
  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON', 400); }
  const state = await readState(env, hash);
  if (!state) return fail('Report not found', 404);

  const key = bearerOf(request);
  const keyed = Boolean(state.key_hash);
  const authorized = keyed && key !== '' && sameDigest(await sha256Hex(key), state.key_hash);
  if (!authorized) {
    const pauseOnly = body?.enabled === false && body.html === undefined && body.delete === undefined;
    const legacyPause = !keyed && pauseOnly && env.REQUIRE_MANAGE_KEY !== '1';
    if (!legacyPause) return fail(keyed ? (key ? 'bad_manage_key' : 'manage_key_required') : 'report_has_no_key', 401);
  }

  if (body.delete === true) {
    await remove(env, hash);
    return json({ hash, deleted: true });
  }
  if (body.html !== undefined) {
    const problem = htmlProblem(body.html);
    if (problem) return fail(...problem);
    state.expires_at = new Date(Date.now() + ttlOf(body) * 1000).toISOString();
    state.published_at = new Date().toISOString();
    await writePage(env, hash, body.html, state.expires_at);
  }
  if (body.enabled !== undefined) state.enabled = Boolean(body.enabled);
  state.updated_at = new Date().toISOString();
  await writeState(env, hash, state);
  return json({ hash, enabled: state.enabled, expires_at: state.expires_at });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { method } = request;
    if (method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (method === 'POST' && url.pathname === '/r/') return publish(request, env);
    const match = url.pathname.match(HASH_RE);
    if (!match) return new Response('Not found', { status: 404 });
    if (method === 'GET') return serve(match[1], env);
    if (method === 'POST') return manage(match[1], request, env);
    return new Response('Method not allowed', { status: 405 });
  },
};
