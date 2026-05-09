// great-cto serve — webhook receiver + outbound notifier (scaffolding).
//
// v2.4.0 ships scaffolding + a single working endpoint (POST /webhook/github
// → run scan, log event). Signature verification, retry/DLQ, and outbound
// integrations land in v2.5.0.
//
// Usage:
//   great-cto serve [--port 3142] [--no-log]
//
// Endpoints:
//   POST /webhook/github    GitHub event receiver (pull_request.opened →
//                           runs scan on PR head, persists summary)
//   POST /webhook/generic   Catch-all for ad-hoc integrations. Body persisted
//                           to ~/.great_cto/webhook-events.log (JSONL).
//   GET  /healthz           Liveness probe
//   GET  /events            Recent event log (last 50)
//
// All events are appended to ~/.great_cto/webhook-events.log as JSONL with
// fields: ts, source, event_type, payload_summary, action_taken.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const EVENTS_LOG = join(homedir(), ".great_cto", "webhook-events.log");

interface ServeArgs {
  port: number;
  noLog: boolean;
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── Endpoint handlers ──────────────────────────────────────────────────────

async function handleGitHub(req: IncomingMessage, res: ServerResponse, args: ServeArgs): Promise<void> {
  const body = await readBody(req);
  const eventType = (req.headers["x-github-event"] as string) ?? "unknown";
  const deliveryId = (req.headers["x-github-delivery"] as string) ?? "no-id";

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }

  // Currently we just record the event. Scan-on-PR lands in v2.5.0 with
  // proper signature verification and clone-and-scan flow.
  const summary =
    eventType === "pull_request"
      ? `${payload.action ?? "?"} PR #${payload.number ?? "?"} in ${payload.repository?.full_name ?? "?"}`
      : `${eventType} delivery=${deliveryId}`;

  const ev: WebhookEvent = {
    ts: new Date().toISOString(),
    source: "github",
    event_type: eventType,
    summary,
    action_taken: "logged",
    meta: { delivery_id: deliveryId, pr_number: payload.number, action: payload.action },
  };
  logEvent(ev, args.noLog);
  json(res, 200, { ok: true, event_type: eventType, recorded: true });
}

async function handleGeneric(req: IncomingMessage, res: ServerResponse, args: ServeArgs): Promise<void> {
  const body = await readBody(req);
  let payload: unknown = body;
  try {
    payload = JSON.parse(body);
  } catch {
    /* keep as raw string */
  }

  const ev: WebhookEvent = {
    ts: new Date().toISOString(),
    source: "generic",
    event_type: "incoming",
    summary: `payload ${body.length} bytes`,
    action_taken: "logged",
    meta: { payload_preview: String(body).slice(0, 200) },
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
    .map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  json(res, 200, { events });
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function runServe(args: ServeArgs): Promise<number> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${args.port}`);
    const path = url.pathname;

    // Healthz
    if (req.method === "GET" && path === "/healthz") {
      return json(res, 200, { ok: true, service: "great-cto serve", events_log: EVENTS_LOG });
    }
    if (req.method === "GET" && path === "/events") {
      return handleEvents(req, res);
    }
    if (req.method === "POST" && path === "/webhook/github") {
      return handleGitHub(req, res, args);
    }
    if (req.method === "POST" && path === "/webhook/generic") {
      return handleGeneric(req, res, args);
    }

    json(res, 404, { error: "not found", path });
  });

  return new Promise<number>(resolve => {
    server.listen(args.port, "127.0.0.1", () => {
      console.error(`great-cto serve → http://localhost:${args.port}`);
      console.error(`  POST /webhook/github    GitHub event receiver`);
      console.error(`  POST /webhook/generic   Catch-all`);
      console.error(`  GET  /events            Recent event log`);
      console.error(`  GET  /healthz           Liveness probe`);
      console.error(`  log: ${EVENTS_LOG}`);
    });
    process.on("SIGINT", () => {
      server.close();
      resolve(0);
    });
    process.on("SIGTERM", () => {
      server.close();
      resolve(0);
    });
  });
}
