// Anonymous opt-IN telemetry — default OFF.
//
// See docs/PRIVACY.md for the full policy. Short version:
//   - Default: disabled (opt-in)
//   - Honors DO_NOT_TRACK=1 (industry standard, https://consoledonottrack.com)
//   - Skipped automatically in CI environments
//   - No paths, no code, no PII — just {ts, version, command, archetype, node, os, exit, duration_ms, anon_id}
//   - anon_id is sha256(user@hostname) truncated to 8 hex chars; not reversible
//
// Opt-in (any one):
//   GREAT_CTO_TELEMETRY=on               (env var)
//   ~/.great_cto/telemetry.json: { "enabled": true }
//   npx great-cto telemetry on
//
// Opt-out (overrides everything):
//   DO_NOT_TRACK=1                       (highest priority)
//   GREAT_CTO_TELEMETRY=off
//   GREAT_CTO_DISABLE_TELEMETRY=1        (legacy alias from v2.x)
//   GREATCTO_NO_TELEMETRY=1              (legacy alias from v2.x)
//   ~/.great_cto/telemetry.json: { "enabled": false }
//
// Endpoint:  https://telemetry.greatcto.systems/v1/event  (Cloudflare Worker → D1)
// Worker:    workers/telemetry/index.ts
// Schema v1: see docs/PRIVACY.md "What we collect"

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

const TELEMETRY_ENDPOINT = process.env.GREAT_CTO_TELEMETRY_ENDPOINT
  || "https://telemetry.greatcto.systems/v1/event";
// Override anytime with GREAT_CTO_TELEMETRY_ENDPOINT (e.g. to point at a
// workers.dev URL during local worker development).
const TELEMETRY_TIMEOUT_MS = 1000;

// Allowlist — anything else is dropped client-side and server-side.
const ALLOWED_COMMANDS = new Set([
  "init", "ci", "board", "console", "register",
  "adapt", "mcp", "report", "serve", "webhook", "upgrade",
  "version", "help", "telemetry",
]);

// Allowlist for archetype field. Match the 25 documented + "none" + "unknown".
const ALLOWED_ARCHETYPES = new Set([
  "none", "unknown", "greenfield",
  "enterprise-saas", "agent-product", "ai-system", "mlops",
  "cli-tool", "cli", "library", "sdk", "devtools",
  "fintech", "regulated", "compliance",
  "iot-embedded", "web3", "marketplace", "cms", "edtech",
  "gov-public", "insurance", "data-platform", "streaming",
  "mobile-app", "infra", "web-service", "agent",
]);

interface TelemetryConfig {
  enabled?: boolean;
  decided_at?: string;
}

function configPath(): string {
  return path.join(os.homedir(), ".great_cto", "telemetry.json");
}

function readConfig(): TelemetryConfig {
  // ONLY the new opt-in file counts. We deliberately do NOT honor the legacy
  // ~/.great_cto/config.json "telemetry" flag: that consent predates the v2.9.2
  // zero-telemetry reset, so silently reactivating it would re-enable collection
  // without a fresh, informed opt-in. Re-introduction requires a new decision.
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")) as TelemetryConfig; }
  catch { return {}; }
}

function writeConfig(cfg: TelemetryConfig): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}

/** Detect CI / automation environments — never send from these. */
function isCI(): boolean {
  const flags = ["CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "BUILDKITE",
                 "JENKINS_URL", "TF_BUILD", "DRONE", "TRAVIS", "APPVEYOR",
                 "BITBUCKET_BUILD_NUMBER", "TEAMCITY_VERSION", "CODEBUILD_BUILD_ID"];
  return flags.some(f => process.env[f] != null && process.env[f] !== "");
}

/** Compute anon_id deterministically per machine, never reversible. */
export function computeAnonId(): string {
  const seed = `great_cto/${os.userInfo().username || "?"}/${os.hostname() || "?"}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8);
}

/** Resolve telemetry-enabled state. Pure function, no side effects. */
export function isTelemetryEnabled(cliFlag = false): boolean {
  // Opt-out wins, in priority order:
  if (process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true") return false;
  if (process.env.GREAT_CTO_TELEMETRY === "off") return false;
  if (process.env.GREAT_CTO_DISABLE_TELEMETRY === "1") return false;
  if (process.env.GREATCTO_NO_TELEMETRY === "1") return false;
  if (cliFlag) return false;
  if (isCI()) return false;

  // Opt-in checks (explicit, fresh decision only):
  if (process.env.GREAT_CTO_TELEMETRY === "on") return true;
  const cfg = readConfig();
  if (cfg.enabled === true) return true;

  // Default: opt-out.
  return false;
}

interface TelemetryEvent {
  ts: string;
  version: string;
  command: string;
  archetype: string;
  node: string;
  os: NodeJS.Platform;
  exit_code: number;
  duration_ms: number;
  anon_id: string;
}

function sanitize(opts: {
  cliVersion: string;
  command: string;
  archetype?: string;
  exitCode?: number;
  durationMs?: number;
}): TelemetryEvent | null {
  const command = opts.command.toLowerCase();
  if (!ALLOWED_COMMANDS.has(command)) return null;

  const archetypeRaw = (opts.archetype || "none").toLowerCase().trim();
  const archetype = ALLOWED_ARCHETYPES.has(archetypeRaw) ? archetypeRaw : "unknown";

  return {
    ts: new Date().toISOString(),
    version: opts.cliVersion,
    command,
    archetype,
    node: process.version.replace(/^v/, ""),
    os: process.platform,
    exit_code: typeof opts.exitCode === "number" ? opts.exitCode : 0,
    duration_ms: typeof opts.durationMs === "number" ? Math.max(0, Math.round(opts.durationMs)) : 0,
    anon_id: computeAnonId(),
  };
}

/** Fire-and-forget POST. Never blocks. Never throws. Never logs unless DRYRUN. */
async function send(evt: TelemetryEvent): Promise<void> {
  if (process.env.GREAT_CTO_TELEMETRY_DRYRUN === "1") {
    process.stderr.write(`[telemetry] would-send: ${JSON.stringify(evt)}\n`);
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TELEMETRY_TIMEOUT_MS);
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evt),
      signal: ctrl.signal,
    }).catch(() => { /* offline ok */ });
    clearTimeout(timer);
  } catch { /* best-effort */ }
}

// --- Public API ------------------------------------------------------------

/** First-run/install ping. Sent only when enabled. Idempotent across runs.
 *  Distinct `command: "install"` (was "init", which conflated installs with the
 *  init subcommand) so lifetime installs are counted separately from init runs. */
export async function sendInstallPing(opts: {
  cliVersion: string;
  archetype: string;
  consent: boolean;
}): Promise<void> {
  if (!opts.consent) return;
  if (!isTelemetryEnabled()) return;
  const evt = sanitize({ cliVersion: opts.cliVersion, command: "install", archetype: opts.archetype });
  if (!evt) return;
  await send(evt);
}

/** Per-command usage ping. Sent only when enabled. Fire-and-forget. */
export async function sendUsagePing(opts: {
  cliVersion: string;
  subcommand: string;
  exitCode: number;
  durationMs?: number;
  archetype?: string;
}): Promise<void> {
  if (!isTelemetryEnabled()) return;
  const evt = sanitize({
    cliVersion: opts.cliVersion,
    command: opts.subcommand,
    archetype: opts.archetype,
    exitCode: opts.exitCode,
    durationMs: opts.durationMs,
  });
  if (!evt) return;
  await send(evt);
}

/**
 * Legacy shim — preserved for backwards compatibility with callers in main.ts
 * that pass `--no-telemetry`. With opt-IN default, consent resolution is
 * trivial: enabled iff isTelemetryEnabled() returns true.
 */
export function resolveTelemetryConsent(cliFlag: boolean): boolean {
  return isTelemetryEnabled(cliFlag);
}

// --- `npx great-cto telemetry <on|off|status|whoami>` subcommand -----------

export function telemetrySubcommand(arg?: string): { exitCode: number; output: string } {
  const action = (arg || "status").toLowerCase();
  switch (action) {
    case "on": {
      const cfg = readConfig();
      cfg.enabled = true;
      writeConfig(cfg);
      return { exitCode: 0, output:
        `✓ telemetry enabled (config: ${configPath()})\n` +
        `  Anonymous events go to ${TELEMETRY_ENDPOINT}\n` +
        `  See docs/PRIVACY.md for the full data schema.\n` };
    }
    case "off": {
      const cfg = readConfig();
      cfg.enabled = false;
      writeConfig(cfg);
      return { exitCode: 0, output:
        `✓ telemetry disabled (config: ${configPath()})\n` };
    }
    case "status": {
      const enabled = isTelemetryEnabled();
      const reason = enabled
        ? "enabled (sending events to " + TELEMETRY_ENDPOINT + ")"
        : isCI()
          ? "disabled (CI environment detected)"
          : process.env.DO_NOT_TRACK === "1"
            ? "disabled (DO_NOT_TRACK=1)"
            : "disabled (default; run 'great-cto telemetry on' to enable)";
      return { exitCode: 0, output:
        `telemetry: ${reason}\n` +
        `anon_id  : ${computeAnonId()}\n` +
        `endpoint : ${TELEMETRY_ENDPOINT}\n` +
        `config   : ${configPath()}\n` };
    }
    case "whoami": {
      return { exitCode: 0, output: computeAnonId() + "\n" };
    }
    default: {
      return { exitCode: 2, output:
        `usage: great-cto telemetry <on|off|status|whoami>\n` };
    }
  }
}
