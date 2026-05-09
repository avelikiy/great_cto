// Webhook dispatcher — outbound notifications with retry + DLQ.
//
// Reliability model:
//   - In-memory retry queue with exponential backoff (1s, 4s, 16s, 64s)
//   - Max 4 attempts per delivery
//   - On final failure: append to dead-letter log (~/.great_cto/webhook-dlq.log)
//   - Dispatcher is fire-and-forget for the caller — we never block the
//     incoming-webhook handler on outbound success
//
// Format adapters:
//   - slack: posts as Slack incoming-webhook JSON ({text, blocks?})
//   - discord: Discord webhook JSON ({content, embeds?})
//   - pagerduty: Events API v2 ({routing_key, event_action, payload})
//   - generic: arbitrary JSON POST

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OutgoingHook, loadConfig } from "./webhook-config.js";

const DLQ_PATH = join(homedir(), ".great_cto", "webhook-dlq.log");
const RETRY_DELAYS_MS = [1_000, 4_000, 16_000, 64_000]; // 4 attempts total

export interface DispatchEvent {
  name: string;          // event name (e.g. "incident.p0", "gate.approved")
  level?: "info" | "warning" | "error" | "critical";
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
}

// ── Format adapters ────────────────────────────────────────────────────────

function formatSlack(ev: DispatchEvent): unknown {
  const emoji = ev.level === "critical" ? ":rotating_light:"
              : ev.level === "error" ? ":x:"
              : ev.level === "warning" ? ":warning:"
              : ":information_source:";
  return {
    text: `${emoji} *${ev.title}*`,
    attachments: ev.body ? [{ text: ev.body, color: ev.level === "critical" ? "danger" : "good" }] : undefined,
  };
}

function formatDiscord(ev: DispatchEvent): unknown {
  const color = ev.level === "critical" ? 0xff0000
              : ev.level === "error" ? 0xff6600
              : ev.level === "warning" ? 0xffcc00
              : 0x00aa66;
  return {
    content: ev.title,
    embeds: ev.body ? [{ description: ev.body, color }] : undefined,
  };
}

function formatPagerDuty(ev: DispatchEvent, routingKey: string): unknown {
  // PagerDuty Events API v2
  const severity = ev.level === "critical" ? "critical"
                 : ev.level === "error" ? "error"
                 : ev.level === "warning" ? "warning"
                 : "info";
  return {
    routing_key: routingKey,
    event_action: "trigger",
    payload: {
      summary: ev.title,
      source: "great-cto",
      severity,
      custom_details: ev.body ? { details: ev.body, ...(ev.meta ?? {}) } : ev.meta,
    },
  };
}

function buildPayload(hook: OutgoingHook, ev: DispatchEvent): unknown {
  switch (hook.format) {
    case "slack":     return formatSlack(ev);
    case "discord":   return formatDiscord(ev);
    case "pagerduty": {
      // PagerDuty uses routing_key from headers config: headers.routing_key
      const key = hook.headers?.routing_key ?? "";
      return formatPagerDuty(ev, key);
    }
    case "generic":
    default:          return { event: ev.name, ...ev };
  }
}

// ── Retry / DLQ ────────────────────────────────────────────────────────────

async function deliver(
  hook: OutgoingHook,
  ev: DispatchEvent,
  attempt: number = 0
): Promise<void> {
  try {
    const body = JSON.stringify(buildPayload(hook, ev));
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...hook.headers,
    };
    // Don't leak routing_key as HTTP header — PagerDuty wants it in body
    delete headers.routing_key;

    const res = await fetch(hook.url, { method: "POST", headers, body });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    const next = attempt + 1;
    if (next < RETRY_DELAYS_MS.length) {
      setTimeout(() => { void deliver(hook, ev, next); }, RETRY_DELAYS_MS[next]!);
      return;
    }
    // Final failure — write to DLQ
    writeToDlq(hook, ev, err as Error);
  }
}

function writeToDlq(hook: OutgoingHook, ev: DispatchEvent, err: Error): void {
  try {
    const dir = dirname(DLQ_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      hook: hook.name,
      url: hook.url,
      event: ev,
      error: err.message,
    };
    appendFileSync(DLQ_PATH, JSON.stringify(entry) + "\n");
    process.stderr.write(`webhook-dispatch: ${hook.name} dead-lettered: ${err.message}\n`);
  } catch {
    /* even DLQ failed — no recovery */
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget dispatch to all outbound webhooks whose triggers include
 * the event's name. The caller does not await delivery — we run all
 * dispatchers in parallel with their own retry queues.
 */
export function dispatch(ev: DispatchEvent): { fired: number } {
  const cfg = loadConfig();
  const targets = cfg.outgoing.filter(
    h => (h.enabled !== false) && h.triggers.includes(ev.name)
  );
  for (const hook of targets) {
    void deliver(hook, ev, 0);
  }
  return { fired: targets.length };
}

export function getDlqPath(): string {
  return DLQ_PATH;
}
