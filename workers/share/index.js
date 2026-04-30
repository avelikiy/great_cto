/**
 * great_cto share worker — Cloudflare Worker + R2
 *
 * Routes:
 *   POST /r/          { html, ttl? }  → { url, hash }
 *   GET  /r/{hash}                    → renders HTML (or "paused" page)
 *   POST /r/{hash}    { enabled }     → toggle on/off
 *
 * R2 bucket: SHARE_BUCKET (bound as env.SHARE_BUCKET)
 * Objects:   r/{hash}/index.html  (TTL via metadata)
 *            r/{hash}/state.json  { enabled, published_at }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { method } = request;

    // Preflight
    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    // POST /r/ — publish new report
    if (method === 'POST' && url.pathname === '/r/') {
      return handlePublish(request, env);
    }

    const match = url.pathname.match(/^\/r\/([a-zA-Z0-9_-]{8,32})\/?$/);
    if (!match) return new Response('Not found', { status: 404 });
    const hash = match[1];

    // GET /r/{hash} — serve report
    if (method === 'GET') return handleServe(hash, env);

    // POST /r/{hash} — toggle enabled
    if (method === 'POST') return handleToggle(hash, request, env);

    return new Response('Method not allowed', { status: 405 });
  },
};

// ── Publish ────────────────────────────────────────────────────────────────────
async function handlePublish(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { html, ttl = 2592000 } = body;
  if (!html || typeof html !== 'string') return jsonError('html required', 400);
  if (html.length > 512_000) return jsonError('html too large (max 500KB)', 413);

  const hash = await randomHash();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const state = { enabled: true, published_at: new Date().toISOString(), expires_at: expiresAt };

  await env.SHARE_BUCKET.put(`r/${hash}/index.html`, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: { expires_at: expiresAt },
  });
  await env.SHARE_BUCKET.put(`r/${hash}/state.json`, JSON.stringify(state), {
    httpMetadata: { contentType: 'application/json' },
  });

  const reportUrl = `${new URL(request.url).origin}/r/${hash}`;
  return jsonOk({ url: reportUrl, hash, expires_at: expiresAt });
}

// ── Serve ──────────────────────────────────────────────────────────────────────
async function handleServe(hash, env) {
  const stateObj = await env.SHARE_BUCKET.get(`r/${hash}/state.json`);
  if (!stateObj) return new Response('Report not found', { status: 404 });

  const state = JSON.parse(await stateObj.text());

  // Expired
  if (state.expires_at && new Date(state.expires_at) < new Date()) {
    return new Response(pausedPage('This report has expired.'), {
      status: 410, headers: { 'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex' },
    });
  }

  // Paused
  if (!state.enabled) {
    const htmlObj = await env.SHARE_BUCKET.get(`r/${hash}/index.html`);
    const html = htmlObj ? (await htmlObj.text()).replace('{{PAUSED}}', 'true') : pausedPage('Report paused by owner.');
    return new Response(html, {
      status: 200, headers: { 'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex' },
    });
  }

  const htmlObj = await env.SHARE_BUCKET.get(`r/${hash}/index.html`);
  if (!htmlObj) return new Response('Report not found', { status: 404 });

  return new Response((await htmlObj.text()).replace('{{PAUSED}}', 'false'), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...CORS,
    },
  });
}

// ── Toggle ─────────────────────────────────────────────────────────────────────
async function handleToggle(hash, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const stateObj = await env.SHARE_BUCKET.get(`r/${hash}/state.json`);
  if (!stateObj) return jsonError('Report not found', 404);

  const state = JSON.parse(await stateObj.text());
  state.enabled = !!body.enabled;
  state.updated_at = new Date().toISOString();

  await env.SHARE_BUCKET.put(`r/${hash}/state.json`, JSON.stringify(state), {
    httpMetadata: { contentType: 'application/json' },
  });

  return jsonOk({ hash, enabled: state.enabled });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function randomHash() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
}
function jsonError(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function pausedPage(msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0a0d12;color:#64748b;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:12px}</style></head><body><div style="font-size:20px;color:#e2e8f0">${msg}</div><div style="font-size:13px">Powered by <a href="https://greatcto.systems" style="color:#3b82f6">great_cto</a></div></body></html>`;
}
