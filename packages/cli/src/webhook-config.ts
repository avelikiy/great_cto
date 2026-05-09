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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface IncomingHook {
  name: string;          // unique slug (github, sentry, custom-1)
  secret?: string;       // HMAC secret for signature verification
  events?: string[];     // optional event-type allowlist
  enabled?: boolean;     // default true
}

export interface OutgoingHook {
  name: string;
  url: string;
  format: "slack" | "discord" | "pagerduty" | "generic";
  triggers: string[];    // event names that fire this dispatcher
  headers?: Record<string, string>;  // optional extra HTTP headers
  enabled?: boolean;
}

export interface WebhookConfig {
  incoming: IncomingHook[];
  outgoing: OutgoingHook[];
}

const CONFIG_PATH = join(homedir(), ".great_cto", "webhooks.json");

const DEFAULT_CONFIG: WebhookConfig = { incoming: [], outgoing: [] };

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): WebhookConfig {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WebhookConfig>;
    return {
      incoming: parsed.incoming ?? [],
      outgoing: parsed.outgoing ?? [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: WebhookConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
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
