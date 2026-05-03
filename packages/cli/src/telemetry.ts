// Anonymous opt-in telemetry.
//
// What we send: random install_id (UUID), version, archetype, node version,
// platform, and timestamp. Nothing personal — no email, paths, code, or repo
// names. The install_id is generated once and stored in ~/.great_cto/config.json.
//
// What we DON'T send: project paths, code, file names, environment variables,
// shell history, IP-derived geolocation (CF only logs country at the edge).
//
// Opt-out:
//   - GREATCTO_NO_TELEMETRY=1 env var (highest priority)
//   - --no-telemetry CLI flag
//   - User declines the first-run prompt
//   - Manually edit ~/.great_cto/config.json: { "telemetry": false }
//
// Endpoint: https://greatcto.systems/api/install (Cloudflare Worker → D1)
// Source:   workers/telemetry/index.js

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { dim, log } from "./ui.js";

const TELEMETRY_ENDPOINT = "https://greatcto.systems/api/install";
const TELEMETRY_TIMEOUT_MS = 1500;

interface Config {
  install_id?: string;
  telemetry?: boolean;       // explicit user choice (true/false), undefined = ask
  telemetry_asked?: boolean; // we showed the prompt at least once
}

function configPath(): string {
  return path.join(os.homedir(), ".great_cto", "config.json");
}

function readConfig(): Config {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

function writeConfig(cfg: Config): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}

function ensureInstallId(cfg: Config): string {
  if (cfg.install_id && /^[0-9a-f-]{36}$/i.test(cfg.install_id)) return cfg.install_id;
  const id = crypto.randomUUID();
  cfg.install_id = id;
  writeConfig(cfg);
  return id;
}

/**
 * Decide whether telemetry is enabled for this run. May write to config.json
 * the first time the user is prompted. Pure-read in subsequent runs.
 *
 * Resolution order:
 *  1. GREATCTO_NO_TELEMETRY=1 env var → false
 *  2. --no-telemetry flag (passed in `cliFlag`) → false
 *  3. Stored config.telemetry → that value
 *  4. Default to enabled (true) if non-interactive (e.g. CI), else show notice
 */
export function resolveTelemetryConsent(cliFlag: boolean): boolean {
  if (process.env.GREATCTO_NO_TELEMETRY === "1") return false;
  if (cliFlag) return false;

  const cfg = readConfig();
  if (typeof cfg.telemetry === "boolean") return cfg.telemetry;

  // First-run notice. We default to enabled (privacy-respecting opt-out) but
  // show a clear notice with how to disable. Kept short; full details in README.
  log("");
  log(dim("─ Anonymous telemetry ────────────────────────────────"));
  log(dim("  great_cto sends one anonymous ping per install:"));
  log(dim("  install_id, version, archetype, Node version, OS."));
  log(dim("  No paths, no code, no PII. Disable any time:"));
  log(dim("    great-cto --no-telemetry  · or set GREATCTO_NO_TELEMETRY=1"));
  log(dim("    or edit ~/.great_cto/config.json: { \"telemetry\": false }"));
  log(dim("──────────────────────────────────────────────────────"));
  log("");

  cfg.telemetry = true;
  cfg.telemetry_asked = true;
  ensureInstallId(cfg);
  writeConfig(cfg);
  return true;
}

interface TelemetryEvent {
  install_id: string;
  cli_version: string;
  archetype: string;
  node_version: string;
  platform: NodeJS.Platform;
  arch: string;
  ts: string;
}

/**
 * Best-effort telemetry ping. Non-blocking, fire-and-forget. Never throws.
 * Returns a promise that resolves once the request completes or times out.
 */
export async function sendInstallPing(opts: {
  cliVersion: string;
  archetype: string;
  consent: boolean;
}): Promise<void> {
  if (!opts.consent) return;

  const cfg = readConfig();
  const install_id = ensureInstallId(cfg);

  const evt: TelemetryEvent = {
    install_id,
    cli_version: opts.cliVersion,
    archetype: opts.archetype,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    ts: new Date().toISOString(),
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TELEMETRY_TIMEOUT_MS);
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `great-cto-cli/${opts.cliVersion}` },
      body: JSON.stringify(evt),
      signal: ctrl.signal,
    }).catch(() => {});
    clearTimeout(timer);
  } catch {
    // never block install on telemetry failure
  }
}
