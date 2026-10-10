// Webhook configuration store — persisted to ~/.great_cto/webhooks.json.
// Used by `serve` (incoming) and the dispatcher (outgoing).
//
// Schema:
//   {
//     "incoming": [
//       { "name": "github", "secret": "<hmac-secret>", "events": ["pull_request"] }
//     ],
//     "outgoing": [
//       { "name": "ops-slack", "url": "https://hooks.slack.com/services/...",
//         "format": "slack", "triggers": ["gate.approved", "incident.p0"] }
//     ]
//   }

import { join } from "node:path";
import { stateHome } from "./state-home.mjs";
import { readPrivateState, writePrivateState } from "./private-state.mjs";

export interface IncomingHook {
  name: string;          // unique slug (github, sentry, custom-1)
  secret?: string;       // HMAC secret for signature verification
  events?: string[];     // optional event-type allowlist
  enabled?: boolean;     // default true
}

export interface OutgoingHook {
  name: string;
  url: string;
  format: "slack" | "discord" | "pagerduty" | "generic" | "resend";
  triggers: string[];    // event names that fire this dispatcher
  headers?: Record<string, string>;  // optional extra HTTP headers
  enabled?: boolean;
  // Resend-specific (only used when format === "resend"):
  to?: string;           // recipient email(s), comma-separated
  apiKey?: string;       // Resend API key (re_...)
  from?: string;         // sender email (default: notifications@greatcto.systems)
}

export interface WebhookConfig {
  incoming: IncomingHook[];
  outgoing: OutgoingHook[];
}

// Same dedicated state namespace as the task queue and update checker.
const CONFIG_PATH = join(stateHome(), "webhooks.json");

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): WebhookConfig {
  try {
    const raw = readPrivateState(CONFIG_PATH);
    const parsed = JSON.parse(raw) as Partial<WebhookConfig>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || (parsed.incoming !== undefined && !Array.isArray(parsed.incoming))
      || (parsed.outgoing !== undefined && !Array.isArray(parsed.outgoing))) {
      throw new Error("Invalid webhook configuration shape");
    }
    return {
      incoming: parsed.incoming ?? [],
      outgoing: parsed.outgoing ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { incoming: [], outgoing: [] };
    // A failed read is not an authoritative empty configuration. Never allow
    // an add/remove operation to overwrite a corrupt or inaccessible store.
    throw error;
  }
}

export function saveConfig(cfg: WebhookConfig): void {
  writePrivateState(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export function addIncoming(hook: IncomingHook): void {
  const cfg = loadConfig();
  cfg.incoming = cfg.incoming.filter(h => h.name !== hook.name);
  cfg.incoming.push({ enabled: true, ...hook });
  saveConfig(cfg);
}

export function addOutgoing(hook: OutgoingHook): void {
  const cfg = loadConfig();
  cfg.outgoing = cfg.outgoing.filter(h => h.name !== hook.name);
  cfg.outgoing.push({ enabled: true, ...hook });
  saveConfig(cfg);
}

export function removeHook(name: string): boolean {
  const cfg = loadConfig();
  const before = cfg.incoming.length + cfg.outgoing.length;
  cfg.incoming = cfg.incoming.filter(h => h.name !== name);
  cfg.outgoing = cfg.outgoing.filter(h => h.name !== name);
  saveConfig(cfg);
  return cfg.incoming.length + cfg.outgoing.length < before;
}

export function getIncoming(name: string): IncomingHook | null {
  return loadConfig().incoming.find(h => h.name === name) ?? null;
}
