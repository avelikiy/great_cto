// great-cto serve — webhook receiver with HMAC verification, retry, DLQ.
// v2.5.0 production-grade upgrade.
//
// Incoming endpoints:
//   POST /webhook/github      GitHub events with X-Hub-Signature-256 verification
//   POST /webhook/sentry      Sentry alerts (HMAC via X-Sentry-Signature-256)
//   POST /webhook/generic     Generic JSON, optional shared-secret verification
//   GET  /events              Recent event log (last 50)
//   GET  /healthz             Liveness probe
//   GET  /dlq                 Recent dead-lettered outbound deliveries
//
// HMAC verification is REQUIRED unless GREATCTO_WEBHOOK_INSECURE=1 is set
// (intended only for local dev). Configure secrets via:
//   great-cto webhook add-incoming github --secret <hmac-secret>
//
// Outbound dispatch fires automatically on certain incoming events:
//   github.pull_request.opened    → "pr.opened" event
//   github.issues.opened          → "issue.opened" event
//   sentry.event_alert            → "incident.p0" event (severity-mapped)
// Each registered outgoing hook listens to a subset via its triggers list.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { dispatch, getDlqPath } from "./webhook-dispatch.js";
import { getIncoming } from "./webhook-config.js";

const EVENTS_LOG = join(homedir(), ".great_cto", "webhook-events.log");

interface ServeArgs {
  port: number;
  noLog: boolean;
  insecure?: boolean;  // skip HMAC checks (local dev only)
}

interface WebhookEvent {
  ts: string;
  source: string;
  event_type: string;
  summary: string;
  action_taken?: string;
  meta?: Record<string, unknown>;
}

function logEvent(ev: WebhookEvent, noLog: boolean): void {
  if (noLog) return;
  try {
    const dir = join(homedir(), ".great_cto");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(EVENTS_LOG, JSON.stringify(ev) + "\n");
  } catch (e) {
    process.stderr.write(`serve: failed to log event: ${(e as Error).message}\n`);
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── HMAC verification ──────────────────────────────────────────────────────

/**
 * Constant-time HMAC-SHA256 verification. Returns true if signatures match.
 * GitHub format:    "sha256=<hex>"
 * Sentry format:    "<hex>" (just the digest)
 * Generic format:   either accepted
 */
function verifyHmac(secret: string, body: Buffer, headerValue: string | undefined): boolean {
  if (!headerValue) return false;
  // Strip "sha256=" prefix if present
  const expected = headerValue.startsWith("sha256=") ? headerValue.slice(7) : headerValue;
  const computed = createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

// ── Endpoint handlers ──────────────────────────────────────────────────────

async function handleGitHub(
  req: IncomingMessage,
  res: ServerResponse,
  args: ServeArgs
): Promise<void> {
  const body = await readBody(req);
  const eventType = (req.headers["x-github-event"] as string) ?? "unknown";
  const deliveryId = (req.headers["x-github-delivery"] as string) ?? "no-id";
  const signature = req.headers["x-hub-signature-256"] as string | undefined;

  // HMAC verification
  if (!args.insecure) {
    const cfg = getIncoming("github");
    if (!cfg?.secret) {
      json(res, 401, {
        error: "github webhook not configured",
        hint: "run: great-cto webhook add-incoming github --secret <hmac-secret>",
      });
      return;
    }
    if (!verifyHmac(cfg.secret, body, signature)) {
      json(res, 401, { error: "invalid signature" });
      return;
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }

  const action = payload.action ?? "?";
  const summary =
    eventType === "pull_request"
      ? `${action} PR #${payload.number ?? "?"} in ${payload.repository?.full_name ?? "?"}`
      : eventType === "issues"
      ? `${action} issue #${payload.issue?.number ?? "?"} in ${payload.repository?.full_name ?? "?"}`
      : `${eventType} delivery=${deliveryId}`;

  // Outbound dispatch — map GitHub events to internal trigger names
  let outboundFired = 0;
  if (eventType === "pull_request" && action === "opened") {
    outboundFired = dispatch({
      name: "pr.opened",
      level: "info",
      title: `PR opened: #${payload.number} in ${payload.repository?.full_name}`,
      body: payload.pull_request?.title ?? "",
      meta: { url: payload.pull_request?.html_url, author: payload.sender?.login },
    }).fired;
  } else if (eventType === "issues" && action === "opened") {
    outboundFired = dispatch({
      name: "issue.opened",
      level: "info",
      title: `Issue opened: #${payload.issue.number} in ${payload.repository?.full_name}`,
      body: payload.issue?.title ?? "",
      meta: { url: payload.issue?.html_url, author: payload.sender?.login },
    }).fired;
  }

  logEvent({
    ts: new Date().toISOString(),
    source: "github",
    event_type: eventType,
    summary,
    action_taken: outboundFired > 0 ? `dispatched to ${outboundFired} outbound hook(s)` : "logged",
    meta: { delivery_id: deliveryId, pr_number: payload.number, action: payload.action },
  }, args.noLog);

  json(res, 200, { ok: true, event_type: eventType, dispatched_to: outboundFired });
}

async function handleSentry(
  req: IncomingMessage,
  res: ServerResponse,
  args: ServeArgs
): Promise<void> {
  const body = await readBody(req);
  const signature = req.headers["x-sentry-signature-256"] as string | undefined;

  if (!args.insecure) {
    const cfg = getIncoming("sentry");
    if (!cfg?.secret) {
      json(res, 401, { error: "sentry webhook not configured" });
      return;
    }
    if (!verifyHmac(cfg.secret, body, signature)) {
      json(res, 401, { error: "invalid signature" });
      return;
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }

  // Sentry events typically include event.level: 'fatal' | 'error' | 'warning'
  const level = payload?.event?.level ?? payload?.level ?? "warning";
  const title = payload?.event?.title ?? payload?.title ?? "Sentry alert";
  const isP0 = level === "fatal" || level === "critical";

  const fired = dispatch({
    name: isP0 ? "incident.p0" : "incident.alert",
    level: isP0 ? "critical" : "error",
    title,
    body: payload?.event?.metadata?.value ?? "",
    meta: { url: payload?.url, project: payload?.project_slug },
  }).fired;

  logEvent({
    ts: new Date().toISOString(),
    source: "sentry",
    event_type: isP0 ? "p0" : "alert",
    summary: title,
    action_taken: `dispatched to ${fired} outbound hook(s)`,
    meta: { level, url: payload?.url },
  }, args.noLog);

  json(res, 200, { ok: true, dispatched_to: fired });
}

async function handleGeneric(
  req: IncomingMessage,
  res: ServerResponse,
  args: ServeArgs
): Promise<void> {
  const body = await readBody(req);
  const signature = req.headers["x-greatcto-signature-256"] as string | undefined;

  if (!args.insecure) {
    const cfg = getIncoming("generic");
    if (cfg?.secret && !verifyHmac(cfg.secret, body, signature)) {
      json(res, 401, { error: "invalid signature" });
      return;
    }
  }

  let payload: any = body.toString("utf8");
  try {
    payload = JSON.parse(payload);
  } catch {
    /* keep as raw string */
  }

  const ev: WebhookEvent = {
    ts: new Date().toISOString(),
    source: "generic",
    event_type: "incoming",
    summary: `payload ${body.length} bytes`,
    action_taken: "logged",
    meta: { payload_preview: String(body.toString("utf8")).slice(0, 200) },
  };
  logEvent(ev, args.noLog);
  json(res, 200, { ok: true, recorded: true });
}

function handleEvents(_req: IncomingMessage, res: ServerResponse): void {
  if (!existsSync(EVENTS_LOG)) {
    json(res, 200, { events: [] });
    return;
  }
  const lines = readFileSync(EVENTS_LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-50);
  const events = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  json(res, 200, { events });
}

function handleDlq(_req: IncomingMessage, res: ServerResponse): void {
  const dlq = getDlqPath();
  if (!existsSync(dlq)) {
    json(res, 200, { dlq: [] });
    return;
  }
  const lines = readFileSync(dlq, "utf8").split("\n").filter(Boolean).slice(-50);
  const events = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  json(res, 200, { dlq: events });
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function runServe(args: ServeArgs): Promise<number> {
  const insecure = args.insecure ?? process.env.GREATCTO_WEBHOOK_INSECURE === "1";
  const finalArgs = { ...args, insecure };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${args.port}`);
    const path = url.pathname;

    if (req.method === "GET" && path === "/healthz") {
      return json(res, 200, { ok: true, service: "great-cto serve", insecure });
    }
    if (req.method === "GET" && path === "/events") {
      return handleEvents(req, res);
    }
    if (req.method === "GET" && path === "/dlq") {
      return handleDlq(req, res);
    }
    if (req.method === "POST" && path === "/webhook/github") {
      return handleGitHub(req, res, finalArgs);
    }
    if (req.method === "POST" && path === "/webhook/sentry") {
      return handleSentry(req, res, finalArgs);
    }
    if (req.method === "POST" && path === "/webhook/generic") {
      return handleGeneric(req, res, finalArgs);
    }

    json(res, 404, { error: "not found", path });
  });

  return new Promise<number>(resolve => {
    server.listen(args.port, "127.0.0.1", () => {
      console.error(`great-cto serve → http://localhost:${args.port}${insecure ? "  [INSECURE: HMAC OFF]" : ""}`);
      console.error(`  POST /webhook/github   GitHub (HMAC SHA-256)`);
      console.error(`  POST /webhook/sentry   Sentry (HMAC SHA-256)`);
      console.error(`  POST /webhook/generic  Generic (optional HMAC)`);
      console.error(`  GET  /events           Recent event log`);
      console.error(`  GET  /dlq              Dead-letter queue`);
      console.error(`  GET  /healthz          Liveness probe`);
      console.error(`  log: ${EVENTS_LOG}`);
    });
    process.on("SIGINT", () => { server.close(); resolve(0); });
    process.on("SIGTERM", () => { server.close(); resolve(0); });
  });
}
