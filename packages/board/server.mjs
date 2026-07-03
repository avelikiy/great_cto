#!/usr/bin/env node
/**
 * great_cto board server
 * Serves Kanban + CTO Dashboard on localhost:3141
 * Data source: bd list --json (Beads), verdicts/*.log, docs/
 *
 * Usage: node server.mjs [--port 3141] [--no-open]
 */

import http from 'http';
// The build board. (The separate operator-console runtime lives in its own repo.)
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { PORT, PUBLIC, HOST } from './lib/config.mjs';
import { originAllowed, isInsideDir } from './lib/util.mjs';
import { discoverProjects, resolveProjectInfo } from './lib/projects.mjs';
import { startAlertCron } from './lib/alerts.mjs';
import { watchBeads, watchVerdicts } from './lib/watchers.mjs';
import { dispatch } from './lib/routes.mjs';

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── HTTP router ────────────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB — board payloads are tiny; cap guards against unbounded `body += c` accumulation.
const server = http.createServer(async (req, res) => {
  // Single-point body-size guard: every route reads `body += c`, so cap cumulative
  // request bytes here and kill the socket on overflow rather than buffering forever.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    let _seen = 0;
    req.on('data', (c) => {
      _seen += c.length;
      if (_seen > MAX_BODY_BYTES && !res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
      }
    });
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const proj = url.searchParams.get('project');
  // BH-5 fix: surface project resolution as a response header. Previously
  // ?project=<unknown> silently returned cwd's data — user thought they
  // were viewing projectX but saw projectY. Now: X-Project-Fallback header
  // tells the client what happened.
  const projInfo = resolveProjectInfo(proj);
  const cwd = projInfo.cwd;
  if (projInfo.resolved === 'fallback') {
    res.setHeader('X-Project-Fallback', `requested='${projInfo.requested}' served='cwd'`);
    res.setHeader('X-Project-Resolved', 'fallback');
  } else {
    res.setHeader('X-Project-Resolved', projInfo.resolved);
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Expose our debug headers to browsers (CORS hides custom headers by default)
  res.setHeader('Access-Control-Expose-Headers', 'X-Project-Fallback, X-Project-Resolved');

  // ── CSRF guard (BH-31) ──────────────────────────────────────────────────────
  // The board binds 127.0.0.1, but a page the user visits in their browser can still
  // issue *simple* cross-origin POSTs to localhost (no preflight). Every state-changing
  // request must therefore be SAME-ORIGIN — otherwise a malicious page could approve an
  // autopilot gate (→ run an irreversible write), approve a dev gate, or mutate tasks.
  // (originAllowed() permits requests with no Origin — curl, the CLI, server-to-server —
  // and rejects a foreign browser Origin.)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !originAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'cross-origin request blocked — the board only accepts same-origin state changes' }));
    return;
  }

  // Try all /api/* routes + /api/sse first.
  if (await dispatch(req, res, url, cwd)) return;

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC, filePath);
  // Path-traversal guard (mirrors the /api/doc containment check in lib/routes.mjs):
  // the joined path must resolve to somewhere inside PUBLIC. Without this, a decoded
  // pathname like /..%2F..%2Fetc%2Fpasswd can escape the public/ directory via
  // path.join's ".." collapsing. Reject with 404 (same as the generic static 404
  // below) so a traversal attempt is indistinguishable from a missing file — no
  // signal to a prober about what exists outside PUBLIC.
  if (isInsideDir(PUBLIC, fullPath) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    // HTML must never cache — board UI is iterated daily and stale layouts
    // hide new features (period selector, push toggle, etc.) until hard refresh
    const headers = { 'Content-Type': mime[ext] || 'text/plain' };
    if (ext === '.html' || ext === '.js') headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    res.writeHead(200, headers);
    res.end(fs.readFileSync(fullPath));
    return;
  }

  // API requests get a JSON 404 so frontends can JSON.parse() the response
  // without crashing. Static-file 404s stay plain text.
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname, hint: 'Endpoint missing — restart the board after a great-cto update.' }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`great_cto board → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log(`  ⚠ bound to ${HOST} — reachable beyond this machine. Operators authenticate via invite`);
    console.log(`    links; put your reverse-proxy auth in front for anything admin-grade.`);
  }
  // Discover all great_cto projects on disk asynchronously — don't block
  // the listening event so /api/tasks is available immediately.
  discoverProjects().then(n => {
    if (n > 0) console.log(`  → discovered ${n} project${n === 1 ? '' : 's'} with .great_cto/PROJECT.md`);
  }).catch(() => {}); // non-fatal
  watchBeads();
  startAlertCron();
  watchVerdicts();

  // Auto-open browser unless --no-open
  if (!process.argv.includes('--no-open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawnSync(opener, [`http://localhost:${PORT}`], { detached: true });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use — board already running at http://localhost:${PORT}`);
  } else {
    console.error(e);
  }
  process.exit(0);
});
