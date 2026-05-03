/**
 * great_cto telemetry worker — anonymous install pings → Cloudflare D1.
 *
 * Routes:
 *   POST /api/install   { install_id, cli_version, archetype, node_version, platform, arch, ts }
 *                       → { ok: true }
 *   GET  /api/stats     → { last_24h, last_7d, last_30d, all_time, by_archetype, by_version }
 *   GET  /api/stats/widget  → tiny inline JSON for landing-page badge
 *
 * D1 schema (run once via `wrangler d1 execute great-cto-telemetry --file schema.sql`):
 *   CREATE TABLE installs (
 *     install_id TEXT NOT NULL,
 *     cli_version TEXT NOT NULL,
 *     archetype TEXT,
 *     node_version TEXT,
 *     platform TEXT,
 *     arch TEXT,
 *     country TEXT,
 *     ts INTEGER NOT NULL,
 *     PRIMARY KEY (install_id, ts)
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_installs_ts ON installs(ts);
 *
 * Privacy:
 *   - install_id is a random UUID generated client-side, not a user id
 *   - country is derived from CF edge headers (no IP stored)
 *   - no path, code, repo name, or user-agent details are accepted
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ALLOWED_ARCHETYPES = new Set([
  'web-service', 'browser-extension', 'mobile-app', 'desktop-app', 'cli-tool',
  'library', 'data-platform', 'ai-system', 'agent-product', 'commerce',
  'fintech', 'healthcare', 'iot-embedded', 'web3-defi', 'enterprise',
  'regulated', 'unknown',
]);

const ALLOWED_PLATFORMS = new Set(['darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'sunos', 'aix']);
const ALLOWED_ARCHES = new Set(['x64', 'arm64', 'arm', 'ia32', 's390x', 'ppc64', 'mips', 'mipsel']);

function sanitize(s, max = 32) {
  if (typeof s !== 'string') return null;
  const t = s.trim().slice(0, max);
  return /^[a-zA-Z0-9._\-+]+$/.test(t) ? t : null;
}

function sanitizeUuid(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t.toLowerCase() : null;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // ── POST /api/install ─────────────────────────────────────────────────
    if (pathname === '/api/install' && req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }

      const install_id = sanitizeUuid(body?.install_id);
      const cli_version = sanitize(body?.cli_version, 24);
      const archetype = sanitize(body?.archetype, 32);
      const node_version = sanitize(body?.node_version, 24);
      const platform = sanitize(body?.platform, 16);
      const arch = sanitize(body?.arch, 16);

      if (!install_id || !cli_version) return json({ error: 'install_id + cli_version required' }, 400);
      if (archetype && !ALLOWED_ARCHETYPES.has(archetype)) return json({ error: 'unknown archetype' }, 400);
      if (platform && !ALLOWED_PLATFORMS.has(platform)) return json({ error: 'unknown platform' }, 400);
      if (arch && !ALLOWED_ARCHES.has(arch)) return json({ error: 'unknown arch' }, 400);

      const country = req.cf?.country || null;
      const ts = Math.floor(Date.now() / 1000);

      try {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO installs (install_id, cli_version, archetype, node_version, platform, arch, country, ts) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(install_id, cli_version, archetype, node_version, platform, arch, country, ts).run();
      } catch (e) {
        // Don't leak internals, but log to worker tail
        console.error('d1 insert failed', e?.message);
        return json({ error: 'storage error' }, 500);
      }

      return json({ ok: true });
    }

    // ── GET /api/stats ────────────────────────────────────────────────────
    if (pathname === '/api/stats' && req.method === 'GET') {
      const now = Math.floor(Date.now() / 1000);
      const day = 86400;
      try {
        const [d1, d7, d30, all, byArch, byVer] = await Promise.all([
          env.DB.prepare('SELECT COUNT(DISTINCT install_id) AS n FROM installs WHERE ts > ?').bind(now - day).first(),
          env.DB.prepare('SELECT COUNT(DISTINCT install_id) AS n FROM installs WHERE ts > ?').bind(now - 7 * day).first(),
          env.DB.prepare('SELECT COUNT(DISTINCT install_id) AS n FROM installs WHERE ts > ?').bind(now - 30 * day).first(),
          env.DB.prepare('SELECT COUNT(DISTINCT install_id) AS n FROM installs').first(),
          env.DB.prepare(
            'SELECT archetype, COUNT(DISTINCT install_id) AS n FROM installs ' +
            'WHERE ts > ? GROUP BY archetype ORDER BY n DESC LIMIT 12'
          ).bind(now - 30 * day).all(),
          env.DB.prepare(
            'SELECT cli_version, COUNT(DISTINCT install_id) AS n FROM installs ' +
            'WHERE ts > ? GROUP BY cli_version ORDER BY n DESC LIMIT 8'
          ).bind(now - 30 * day).all(),
        ]);
        return json({
          last_24h: d1?.n ?? 0,
          last_7d: d7?.n ?? 0,
          last_30d: d30?.n ?? 0,
          all_time: all?.n ?? 0,
          by_archetype: (byArch?.results || []).map(r => ({ archetype: r.archetype, count: r.n })),
          by_version: (byVer?.results || []).map(r => ({ version: r.cli_version, count: r.n })),
        }, 200, { 'Cache-Control': 'public, max-age=300' }); // 5 min CDN cache
      } catch (e) {
        return json({ error: 'query failed' }, 500);
      }
    }

    // ── GET /api/stats/widget ─────────────────────────────────────────────
    // Compact JSON for landing page (also includes npm download proxy)
    if (pathname === '/api/stats/widget' && req.method === 'GET') {
      try {
        const now = Math.floor(Date.now() / 1000);
        const day = 86400;
        const stats = await env.DB.prepare(
          'SELECT ' +
          '  (SELECT COUNT(DISTINCT install_id) FROM installs WHERE ts > ?) AS w, ' +
          '  (SELECT COUNT(DISTINCT install_id) FROM installs WHERE ts > ?) AS m, ' +
          '  (SELECT COUNT(DISTINCT install_id) FROM installs) AS total'
        ).bind(now - 7 * day, now - 30 * day).first();

        // Proxy npm downloads (best-effort) — gives a "downloads" public number
        let npmWeek = null;
        try {
          const r = await fetch('https://api.npmjs.org/downloads/point/last-week/great-cto', {
            cf: { cacheTtl: 600, cacheEverything: true },
          });
          if (r.ok) npmWeek = (await r.json())?.downloads ?? null;
        } catch { /* ignore */ }

        return json({
          installs_week: stats?.w ?? 0,
          installs_month: stats?.m ?? 0,
          installs_total: stats?.total ?? 0,
          npm_downloads_week: npmWeek,
        }, 200, { 'Cache-Control': 'public, max-age=300' });
      } catch (e) {
        return json({ error: 'query failed' }, 500);
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
