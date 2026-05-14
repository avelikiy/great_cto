// great_cto telemetry — Cloudflare Worker
//
// Endpoints:
//   POST /v1/event      — accept one event, validate, drop IP, insert into D1
//   GET  /v1/health     — liveness
//   GET  /v1/stats      — public daily aggregates (no anon_id)
//   GET  /v1/report     — weekly report data (?week=YYYY-WW) — aggregate-only JSON
//                        used by scripts/weekly-telemetry.sh to render markdown.
//                        No auth: same privacy promise as /v1/stats (no anon_id).
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

// Parse ISO year-week (e.g., "2026-W19") into ISO 8601 Monday → next Monday UTC range.
// We use the ISO-8601 convention: Monday is day 1, week 1 contains Jan 4.
function weekToRange(yearWeek: string): { from: string; to: string } | null {
  const m = yearWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week < 1 || week > 53) return null;
  // ISO-8601: Thursday of week 1 is always in year Y → day 4 of week 1 = Jan 4 + offset.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;   // 0=Mon
  const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const from = new Date(week1Mon); from.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const to = new Date(from); to.setUTCDate(from.getUTCDate() + 7);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function handleReport(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const week = url.searchParams.get("week") || "";
  const range = weekToRange(week);
  if (!range) return json({ error: "invalid week (expected YYYY-WW)" }, 400);

  // All queries are aggregate-only — no anon_id is ever returned to client.
  // Worker uses its own D1 binding, no CF API token needed by caller.

  // Q1: Headline
  const headline = await env.DB.prepare(
    `SELECT COUNT(*) AS total_events,
            COUNT(DISTINCT anon_id) AS unique_users,
            COUNT(DISTINCT command) AS distinct_commands,
            COUNT(DISTINCT version) AS distinct_versions,
            MIN(ts) AS first_event,
            MAX(ts) AS last_event
       FROM events
      WHERE received_at >= ? AND received_at < ?`
  ).bind(range.from, range.to).first();

  // Q2: Command popularity
  const popularity = await env.DB.prepare(
    `SELECT command, COUNT(*) AS runs, COUNT(DISTINCT anon_id) AS users
       FROM events
      WHERE received_at >= ? AND received_at < ?
      GROUP BY command
      ORDER BY runs DESC
      LIMIT 50`
  ).bind(range.from, range.to).all();

  // Q3: Failure rate (exit_code > 2 — reject normal-failure semantics)
  const failures = await env.DB.prepare(
    `SELECT command,
            COUNT(*) AS total,
            SUM(CASE WHEN exit_code > 2 THEN 1 ELSE 0 END) AS fails,
            ROUND(100.0 * SUM(CASE WHEN exit_code > 2 THEN 1 ELSE 0 END) / COUNT(*), 1) AS fail_pct
       FROM events
      WHERE received_at >= ? AND received_at < ?
      GROUP BY command
     HAVING fails > 0
      ORDER BY fails DESC`
  ).bind(range.from, range.to).all();

  // Q4: Archetype distribution (init events only)
  const archetypes = await env.DB.prepare(
    `SELECT archetype, COUNT(*) AS runs, COUNT(DISTINCT anon_id) AS users
       FROM events
      WHERE received_at >= ? AND received_at < ? AND command = 'init'
      GROUP BY archetype
      ORDER BY runs DESC`
  ).bind(range.from, range.to).all();

  // Q5: Performance (duration avg + max)
  const performance = await env.DB.prepare(
    `SELECT command,
            COUNT(*) AS runs,
            ROUND(AVG(duration_ms)) AS avg_ms,
            MAX(duration_ms) AS max_ms
       FROM events
      WHERE received_at >= ? AND received_at < ?
      GROUP BY command
      ORDER BY runs DESC
      LIMIT 50`
  ).bind(range.from, range.to).all();

  // Q6: OS + Node distribution
  const osNode = await env.DB.prepare(
    `SELECT os, node, COUNT(DISTINCT anon_id) AS users
       FROM events
      WHERE received_at >= ? AND received_at < ?
      GROUP BY os, node
      ORDER BY users DESC
      LIMIT 50`
  ).bind(range.from, range.to).all();

  return json({
    week,
    range,
    headline: headline ?? {},
    popularity: popularity.results ?? [],
    failures: failures.results ?? [],
    archetypes: archetypes.results ?? [],
    performance: performance.results ?? [],
    os_node: osNode.results ?? [],
    generated_at: new Date().toISOString(),
  });
}

// Self-test endpoint — Worker does INSERT + SELECT + DELETE atomically using
// its own D1 binding (no CF API token / caller auth needed). Returns whether
// the full round-trip worked. Used by the weekly workflow to verify pipeline
// health without needing D1 admin credentials.
async function handleSmoke(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const url = new URL(req.url);
  const anon = url.searchParams.get("anon") || "";
  if (!/^[0-9a-f]{8}$/.test(anon)) return json({ error: "bad anon (expect 8 hex)" }, 400);

  const ts = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO events (ts, version, command, archetype, node, os, exit_code, duration_ms, anon_id)
       VALUES (?, '0.0.0-smoke', 'telemetry', 'none', '0.0.0', 'linux', 0, 0, ?)`
    ).bind(ts, anon).run();

    const found = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM events WHERE anon_id = ?`
    ).bind(anon).first<{ c: number }>();

    await env.DB.prepare(
      `DELETE FROM events WHERE anon_id = ?`
    ).bind(anon).run();

    return json({ ok: (found?.c ?? 0) === 1, found: found?.c ?? 0 });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
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
    if (url.pathname === "/v1/report") return handleReport(req, env);
    if (url.pathname === "/v1/_smoke") return handleSmoke(req, env);
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
