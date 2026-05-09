// great-cto webhook — manage incoming/outgoing webhook configuration.
//
// Usage:
//   great-cto webhook list
//   great-cto webhook add-incoming <name> --secret <hmac> [--events e1,e2]
//   great-cto webhook add-outgoing <name> --url <url> --format slack|discord|pagerduty|generic --triggers t1,t2
//   great-cto webhook remove <name>
//   great-cto webhook test <name>          (sends a test event through dispatcher)

import {
  loadConfig, saveConfig, addIncoming, addOutgoing, removeHook,
  getConfigPath,
} from "./webhook-config.js";
import { dispatch } from "./webhook-dispatch.js";

export interface WebhookCliArgs {
  action: "list" | "add-incoming" | "add-outgoing" | "remove" | "test";
  name?: string;
  secret?: string;
  url?: string;
  format?: "slack" | "discord" | "pagerduty" | "generic";
  triggers?: string[];
  events?: string[];
  routingKey?: string;
}

export async function runWebhookCli(args: WebhookCliArgs): Promise<number> {
  switch (args.action) {
    case "list": {
      const cfg = loadConfig();
      console.log(`config: ${getConfigPath()}\n`);
      console.log(`Incoming hooks (${cfg.incoming.length}):`);
      if (cfg.incoming.length === 0) console.log("  (none)");
      for (const h of cfg.incoming) {
        const sec = h.secret ? `[secret: ${h.secret.slice(0, 4)}...${h.secret.slice(-2)}]` : "[NO SECRET — INSECURE]";
        console.log(`  - ${h.name}  ${sec}  events=${h.events?.join(",") || "all"}`);
      }
      console.log(`\nOutgoing hooks (${cfg.outgoing.length}):`);
      if (cfg.outgoing.length === 0) console.log("  (none)");
      for (const h of cfg.outgoing) {
        const url = h.url.length > 60 ? h.url.slice(0, 57) + "..." : h.url;
        console.log(`  - ${h.name}  [${h.format}]  triggers=${h.triggers.join(",")}\n      ${url}`);
      }
      return 0;
    }

    case "add-incoming": {
      if (!args.name) { console.error("FAIL: --name required"); return 2; }
      if (!args.secret) {
        console.error("WARN: no --secret provided. Webhooks will only work in --insecure mode.");
      }
      addIncoming({
        name: args.name,
        secret: args.secret,
        events: args.events,
      });
      console.log(`✓ added incoming hook "${args.name}"`);
      return 0;
    }

    case "add-outgoing": {
      if (!args.name) { console.error("FAIL: --name required"); return 2; }
      if (!args.url) { console.error("FAIL: --url required"); return 2; }
      if (!args.format) { console.error("FAIL: --format required"); return 2; }
      if (!args.triggers || args.triggers.length === 0) {
        console.error("FAIL: --triggers required (comma-separated event names)");
        return 2;
      }
      const headers: Record<string, string> = {};
      if (args.routingKey) headers.routing_key = args.routingKey;
      addOutgoing({
        name: args.name,
        url: args.url,
        format: args.format,
        triggers: args.triggers,
        headers: Object.keys(headers).length ? headers : undefined,
      });
      console.log(`✓ added outgoing hook "${args.name}" (${args.format}) → ${args.triggers.join(", ")}`);
      return 0;
    }

    case "remove": {
      if (!args.name) { console.error("FAIL: --name required"); return 2; }
      const removed = removeHook(args.name);
      if (removed) {
        console.log(`✓ removed hook "${args.name}"`);
        return 0;
      }
      console.error(`hook not found: ${args.name}`);
      return 1;
    }

    case "test": {
      if (!args.name) { console.error("FAIL: --name required"); return 2; }
      const cfg = loadConfig();
      const hook = cfg.outgoing.find(h => h.name === args.name);
      if (!hook) {
        console.error(`outgoing hook not found: ${args.name}`);
        return 1;
      }
      const result = dispatch({
        name: hook.triggers[0] ?? "test.event",
        level: "info",
        title: "great-cto webhook test",
        body: "If you see this, your webhook is correctly configured.",
        meta: { test: true, timestamp: new Date().toISOString() },
      });
      console.log(`✓ test event dispatched to ${result.fired} hook(s)`);
      console.log(`  (delivery is async — check destination shortly; check ~/.great_cto/webhook-dlq.log if it doesn't arrive)`);
      // Give the in-flight request a moment before exit
      await new Promise(r => setTimeout(r, 500));
      return 0;
    }
  }

  console.error(`unknown action: ${args.action}`);
  return 2;
}

export function parseWebhookArgs(rawArgv: string[]): WebhookCliArgs | null {
  const idx = rawArgv.indexOf("webhook");
  if (idx === -1) return null;
  const action = rawArgv[idx + 1] as WebhookCliArgs["action"];
  if (!["list", "add-incoming", "add-outgoing", "remove", "test"].includes(action)) {
    return null;
  }

  const flag = (n: string) => {
    const i = rawArgv.indexOf(`--${n}`);
    return i >= 0 && i < rawArgv.length - 1 ? rawArgv[i + 1] : undefined;
  };

  // First positional after action = name
  let name: string | undefined;
  for (let i = idx + 2; i < rawArgv.length; i++) {
    const a = rawArgv[i]!;
    if (!a.startsWith("--")) { name = a; break; }
  }

  return {
    action,
    name,
    secret: flag("secret"),
    url: flag("url"),
    format: flag("format") as WebhookCliArgs["format"],
    triggers: flag("triggers")?.split(",").map(s => s.trim()).filter(Boolean),
    events: flag("events")?.split(",").map(s => s.trim()).filter(Boolean),
    routingKey: flag("routing-key"),
  };
}
