// great_cto telemetry — Cloudflare Worker
//
// Endpoints:
//   POST /v1/event      — accept one event, validate, drop IP, insert into D1
//   GET  /v1/health     — liveness
//   GET  /v1/stats      — public daily aggregates (no anon_id)
//   GET  /v1/forget     — right-to-be-forgotten (deletes events for ?anon_id=)
//
// Daily cron: drop events older than 30 days, refresh daily_stats aggregates.
//
// See docs/PRIVACY.md for the full data policy.

interface Env {
  DB: D1Database;
}

const ALLOWED_COMMANDS = new Set([
  "init", "scan", "ci", "list-rules", "board", "register",
  "adapt", "mcp", "report", "serve", "webhook",
  "version", "help", "telemetry",
]);

const ALLOWED_ARCHETYPES = new Set([
  "none", "unknown", "greenfield",
  "enterprise-saas", "agent-product", "ai-system", "mlops",
  "cli-tool", "cli", "library", "sdk", "devtools",
  "fintech", "regulated", "compliance",
  "iot-embedded", "web3", "marketplace", "cms", "edtech",
  "gov-public", "insurance", "data-platform", "streaming",
  "mobile-app", "infra", "web-service", "agent",
]);

const ALLOWED_OS = new Set(["linux", "darwin", "win32", "freebsd", "openbsd", "sunos", "aix"]);

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function isValidEvent(e: unknown): e is {
  ts: string; version: string; command: string; archetype: string;
  node: string; os: string; exit_code: number; duration_ms: number; anon_id: string;
} {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  if (typeof r.ts !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(r.ts)) return false;
  if (typeof r.version !== "string" || !/^\d+\.\d+\.\d+/.test(r.version)) return false;
  if (typeof r.command !== "string" || !ALLOWED_COMMANDS.has(r.command)) return false;
  if (typeof r.archetype !== "string" || !ALLOWED_ARCHETYPES.has(r.archetype)) return false;
  if (typeof r.node !== "string" || !/^\d+\.\d+\.\d+/.test(r.node)) return false;
  if (typeof r.os !== "string" || !ALLOWED_OS.has(r.os)) return false;
  if (typeof r.exit_code !== "number" || r.exit_code < 0 || r.exit_code > 255) return false;
  if (typeof r.duration_ms !== "number" || r.duration_ms < 0 || r.duration_ms > 86_400_000) return false;
  if (typeof r.anon_id !== "string" || !/^[0-9a-f]{8}$/.test(r.anon_id)) return false;
  // Reject if the payload has any extra/unknown keys (defense against PII smuggling).
  const allowed = new Set(["ts","version","command","archetype","node","os","exit_code","duration_ms","anon_id"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) return false;
  return true;
}

async function handleEvent(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 4 KB cap — events should be <256 bytes; anything bigger is suspicious.
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 4096) return json({ error: "payload too large" }, 413);

  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(buf)); }
  catch { return json({ error: "invalid json" }, 400); }

  if (!isValidEvent(body)) return json({ error: "schema validation failed" }, 400);
  const e = body;

  // Drop IP — Cloudflare provides it in cf.connectingIP / req.headers.get("cf-connecting-ip"),
  // we deliberately don't read or store it.
  await env.DB.prepare(
    `INSERT INTO events (ts, version, command, archetype, node, os, exit_code, duration_ms, anon_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    e.ts, e.version, e.command, e.archetype, e.node, e.os, e.exit_code, e.duration_ms, e.anon_id,
  ).run();

  return json({ ok: true });
}

async function handleStats(_req: Request, env: Env): Promise<Response> {
  // Public aggregates — no anon_id. Last 30 days.
  const rows = await env.DB.prepare(
    `SELECT date, command, archetype, os, count, unique_ids
     FROM daily_stats
     WHERE date >= date('now', '-30 days')
     ORDER BY date DESC, count DESC
     LIMIT 1000`
  ).all();
  return json({ days: 30, rows: rows.results });
}

async function handleForget(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const anonId = url.searchParams.get("anon_id") || "";
  if (!/^[0-9a-f]{8}$/.test(anonId)) return json({ error: "invalid anon_id" }, 400);
  const r = await env.DB.prepare(`DELETE FROM events WHERE anon_id = ?`).bind(anonId).run();
  return json({ ok: true, deleted: r.meta?.changes ?? 0 });
}

async function refreshDailyStats(env: Env): Promise<void> {
  // Roll up the previous full day into daily_stats.
  await env.DB.prepare(
    `INSERT OR REPLACE INTO daily_stats (date, command, archetype, os, count, unique_ids)
     SELECT
       substr(received_at, 1, 10) AS date,
       command, archetype, os,
       COUNT(*) AS count,
       COUNT(DISTINCT anon_id) AS unique_ids
     FROM events
     WHERE substr(received_at, 1, 10) = date('now', '-1 days')
     GROUP BY date, command, archetype, os`
  ).run();
}

async function purgeOldEvents(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM events WHERE received_at < datetime('now', '-30 days')`).run();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    const url = new URL(req.url);
    if (url.pathname === "/v1/health") return json({ ok: true, schema: "v1" });
    if (url.pathname === "/v1/event")  return handleEvent(req, env);
    if (url.pathname === "/v1/stats")  return handleStats(req, env);
    if (url.pathname === "/v1/forget") return handleForget(req, env);
    return json({
      service: "great-cto-telemetry",
      schema: "v1",
      docs: "https://github.com/avelikiy/great_cto/blob/main/docs/PRIVACY.md",
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await refreshDailyStats(env);
    await purgeOldEvents(env);
  },
} satisfies ExportedHandler<Env>;
