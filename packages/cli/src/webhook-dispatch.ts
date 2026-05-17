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
//   - resend: HTML email via Resend API ({from, to, subject, html})
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

function emojiForLevel(level: DispatchEvent["level"]): string {
  return level === "critical" ? "🚨"
       : level === "error"    ? "❌"
       : level === "warning"  ? "⏸️"
       : "ℹ️";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Build the Resend API payload — POSTed to https://api.resend.com/emails
 * with Authorization: Bearer <api_key>.
 *
 * Body fields from meta:
 *   - project, link (CTA URL), action (CTA label)
 *   - kv: Record<string,string> for the metric table
 *   - severity (optional override for color)
 */
function formatResend(ev: DispatchEvent, hook: OutgoingHook): unknown {
  const accent = ev.level === "critical" ? "#dc2626"
               : ev.level === "error"    ? "#ea580c"
               : ev.level === "warning"  ? "#d97706"
               : "#00d97e";
  const emoji = emojiForLevel(ev.level);
  const meta = (ev.meta ?? {}) as Record<string, unknown>;
  const project = typeof meta.project === "string" ? meta.project : "great_cto";
  const link = typeof meta.link === "string" ? meta.link : "";
  const action = typeof meta.action === "string" ? meta.action : "View in board";
  const kv = (meta.kv ?? {}) as Record<string, string>;

  const tableRows = Object.entries(kv)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b7280;font-size:12px;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(k)}</td><td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:500">${escapeHtml(v)}</td></tr>`)
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#0a0e0c;color:#ffffff">
    <div style="font-size:11px;font-family:ui-monospace,monospace;letter-spacing:.1em;color:#9ca3af">${escapeHtml(project.toUpperCase())} · GREATCTO</div>
    <div style="font-size:20px;font-weight:600;margin-top:6px;color:${accent}">${emoji} ${escapeHtml(ev.title)}</div>
  </div>
  ${ev.body ? `<div style="padding:20px 24px;font-size:14px;line-height:1.55;color:#374151">${escapeHtml(ev.body).replace(/\n/g, "<br>")}</div>` : ""}
  ${tableRows ? `<table style="width:100%;border-top:1px solid #e5e7eb;border-collapse:collapse">${tableRows}</table>` : ""}
  ${link ? `<div style="padding:24px;text-align:center;border-top:1px solid #e5e7eb">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">${escapeHtml(action)}</a>
  </div>` : ""}
  <div style="padding:14px 24px;background:#f9fafb;font-size:11px;color:#9ca3af;font-family:ui-monospace,monospace">
    Sent by great_cto · ${escapeHtml(ev.name)} · ${new Date().toISOString()}<br>
    Unsubscribe: edit ~/.great_cto/webhooks.json or the Notifications tab in the board
  </div>
</div></body></html>`;

  const to = (hook.to ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return {
    from: hook.from ?? "GreatCTO <notifications@greatcto.systems>",
    to,
    subject: `${emoji} ${ev.title}`,
    html,
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
    case "resend":    return formatResend(ev, hook);
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

    // Resend: Bearer auth + URL override (config can leave url blank).
    let url = hook.url;
    if (hook.format === "resend") {
      if (!hook.apiKey) throw new Error("resend: apiKey is required");
      if (!hook.to)     throw new Error("resend: 'to' email is required");
      headers["Authorization"] = `Bearer ${hook.apiKey}`;
      if (!url) url = "https://api.resend.com/emails";
    }

    const res = await fetch(url, { method: "POST", headers, body });
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
