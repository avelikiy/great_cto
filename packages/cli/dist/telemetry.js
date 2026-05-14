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
    || "https://great-cto-telemetry.alexander-velikiy.workers.dev/v1/event";
// Note: workers.dev URL is the temporary default until telemetry.greatcto.systems
// custom domain is bound. Override anytime with GREAT_CTO_TELEMETRY_ENDPOINT.
const TELEMETRY_TIMEOUT_MS = 1000;
// Allowlist — anything else is dropped client-side and server-side.
const ALLOWED_COMMANDS = new Set([
    "init", "scan", "ci", "list-rules", "board", "register",
    "adapt", "mcp", "report", "serve", "webhook",
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
function configPath() {
    return path.join(os.homedir(), ".great_cto", "telemetry.json");
}
function legacyConfigPath() {
    return path.join(os.homedir(), ".great_cto", "config.json");
}
function readConfig() {
    // Try new file first.
    try {
        return JSON.parse(fs.readFileSync(configPath(), "utf8"));
    }
    catch { /* fall through */ }
    // Fall back to legacy config.json (read-only — never write to it).
    try {
        const legacy = JSON.parse(fs.readFileSync(legacyConfigPath(), "utf8"));
        return { enabled: legacy.telemetry, install_id: legacy.install_id };
    }
    catch {
        return {};
    }
}
function writeConfig(cfg) {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}
/** Detect CI / automation environments — never send from these. */
function isCI() {
    const flags = ["CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "BUILDKITE",
        "JENKINS_URL", "TF_BUILD", "DRONE", "TRAVIS", "APPVEYOR",
        "BITBUCKET_BUILD_NUMBER", "TEAMCITY_VERSION", "CODEBUILD_BUILD_ID"];
    return flags.some(f => process.env[f] != null && process.env[f] !== "");
}
/** Compute anon_id deterministically per machine, never reversible. */
export function computeAnonId() {
    const seed = `great_cto/${os.userInfo().username || "?"}/${os.hostname() || "?"}`;
    return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8);
}
/** Resolve telemetry-enabled state. Pure function, no side effects. */
export function isTelemetryEnabled(cliFlag = false) {
    // Opt-out wins, in priority order:
    if (process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true")
        return false;
    if (process.env.GREAT_CTO_TELEMETRY === "off")
        return false;
    if (process.env.GREAT_CTO_DISABLE_TELEMETRY === "1")
        return false;
    if (process.env.GREATCTO_NO_TELEMETRY === "1")
        return false;
    if (cliFlag)
        return false;
    if (isCI())
        return false;
    // Opt-in checks:
    if (process.env.GREAT_CTO_TELEMETRY === "on")
        return true;
    const cfg = readConfig();
    if (cfg.enabled === true)
        return true;
    if (cfg.telemetry === true)
        return true; // legacy
    // Default: opt-out.
    return false;
}
function sanitize(opts) {
    const command = opts.command.toLowerCase();
    if (!ALLOWED_COMMANDS.has(command))
        return null;
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
async function send(evt) {
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
        }).catch(() => { });
        clearTimeout(timer);
    }
    catch { /* best-effort */ }
}
// --- Public API ------------------------------------------------------------
/** First-run/install ping. Sent only when enabled. Idempotent across runs. */
export async function sendInstallPing(opts) {
    if (!opts.consent)
        return;
    if (!isTelemetryEnabled())
        return;
    const evt = sanitize({ cliVersion: opts.cliVersion, command: "init", archetype: opts.archetype });
    if (!evt)
        return;
    await send(evt);
}
/** Per-command usage ping. Sent only when enabled. Fire-and-forget. */
export async function sendUsagePing(opts) {
    if (!isTelemetryEnabled())
        return;
    const evt = sanitize({
        cliVersion: opts.cliVersion,
        command: opts.subcommand,
        archetype: opts.archetype,
        exitCode: opts.exitCode,
        durationMs: opts.durationMs,
    });
    if (!evt)
        return;
    await send(evt);
}
/**
 * Legacy shim — preserved for backwards compatibility with callers in main.ts
 * that pass `--no-telemetry`. With opt-IN default, consent resolution is
 * trivial: enabled iff isTelemetryEnabled() returns true.
 */
export function resolveTelemetryConsent(cliFlag) {
    return isTelemetryEnabled(cliFlag);
}
// --- `npx great-cto telemetry <on|off|status|whoami>` subcommand -----------
export function telemetrySubcommand(arg) {
    const action = (arg || "status").toLowerCase();
    switch (action) {
        case "on": {
            const cfg = readConfig();
            cfg.enabled = true;
            writeConfig(cfg);
            return { exitCode: 0, output: `✓ telemetry enabled (config: ${configPath()})\n` +
                    `  Anonymous events go to ${TELEMETRY_ENDPOINT}\n` +
                    `  See docs/PRIVACY.md for the full data schema.\n` };
        }
        case "off": {
            const cfg = readConfig();
            cfg.enabled = false;
            writeConfig(cfg);
            return { exitCode: 0, output: `✓ telemetry disabled (config: ${configPath()})\n` };
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
            return { exitCode: 0, output: `telemetry: ${reason}\n` +
                    `anon_id  : ${computeAnonId()}\n` +
                    `endpoint : ${TELEMETRY_ENDPOINT}\n` +
                    `config   : ${configPath()}\n` };
        }
        case "whoami": {
            return { exitCode: 0, output: computeAnonId() + "\n" };
        }
        default: {
            return { exitCode: 2, output: `usage: great-cto telemetry <on|off|status|whoami>\n` };
        }
    }
}
