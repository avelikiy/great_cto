// CLI entry: parse args, run the init flow.
//
// Flow:
//   1. banner
//   2. detect stack in cwd
//   3. pick archetype + compliance
//   4. confirm with user (unless -y)
//   5. install plugin (git clone)
//   6. enable in ~/.claude/settings.json
//   6b. install companion plugins (superpowers + beads)
//   7. bootstrap .great_cto/PROJECT.md
//   8. print next steps

import { resolve } from "node:path";
import { banner, bold, cyan, dim, error, gray, green, log, step, success, warn, yellow, confirm } from "./ui.js";
import { detect } from "./detect.js";
import { pickArchetype, suggestCompliance } from "./archetypes.js";
import { install, findInstalledVersions } from "./installer.js";
import { enableGreatCto } from "./settings.js";
import { installAllCompanions } from "./companion.js";
import { bootstrap } from "./bootstrap.js";
import { compileFlow } from "./flow.js";
import { shouldUseLlmFallback, suggestArchetypeFromLlm } from "./llm-fallback.js";
import { sendUsagePing, sendInstallPing, telemetrySubcommand, isTelemetryEnabled, computeAnonId } from "./telemetry.js";
import { readFileSync, writeFileSync, copyFileSync, chmodSync, mkdirSync, readdirSync, unlinkSync, existsSync as fsExistsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

function getCliVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/main.js → ../package.json
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

interface CliArgs {
  command: "init" | "help" | "version" | "board" | "console" | "register" | "ci" | "mcp" | "adapt" | "serve" | "webhook" | "report" | "upgrade" | "telemetry" | "chat-only-hint" | "unknown";
  unknownToken?: string;
  dir: string;
  positional: string[];
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  archetype: string | null;
  version: string | null;
  boardPort: number;
  boardNoOpen: boolean;
  consoleBind: string | null;  // --bind: bind address for `console` (tunnel/hosting); default loopback
  demo: boolean;               // --demo: inject synthetic cases so the operator console comes alive
  useLlm: boolean;        // --use-llm: force LLM even on high confidence
  noLlm: boolean;         // --no-llm: skip LLM even on low confidence
  host: "claude-code" | "codex" | null;  // --host codex: install for Codex instead of Claude Code
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "init",
    boardPort: 3141,
    boardNoOpen: false,
    consoleBind: null,
    demo: false,
    dir: process.cwd(),
    yes: false,
    dryRun: false,
    force: false,
    archetype: null,
    version: null,
    useLlm: false,
    noLlm: false,
    host: null,
    positional: [],
  };

  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") args.command = "help";
    else if (a === "-v" || a === "--version") args.command = "version";
    else if (a === "-y" || a === "--yes") args.yes = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--archetype") args.archetype = argv[++i] ?? null;
    else if (a === "--version-tag") args.version = argv[++i] ?? null;
    else if (a === "--port") args.boardPort = parseInt(argv[++i] ?? "3141", 10);
    else if (a.startsWith("--port=")) args.boardPort = parseInt(a.slice("--port=".length), 10);
    else if (a === "--no-open") args.boardNoOpen = true;
    else if (a === "--use-llm") args.useLlm = true;
    else if (a === "--no-llm") args.noLlm = true;
    else if (a === "--host") { const v = argv[++i] ?? ""; args.host = (v === "codex" || v === "claude-code") ? v : null; }
    else if (a.startsWith("--host=")) { const v = a.slice("--host=".length); args.host = (v === "codex" || v === "claude-code") ? v : null; }
    else if (a === "--bind") args.consoleBind = argv[++i] ?? null;
    else if (a.startsWith("--bind=")) args.consoleBind = a.slice("--bind=".length) || null;
    else if (a === "--demo") args.demo = true;
    else if (a === "board") args.command = "board";
    else if (a === "console") args.command = "console";
    else if (a === "telemetry") args.command = "telemetry";
    else if (a === "register") args.command = "register";
    else if (a === "ci") args.command = "ci";
    else if (a === "mcp") args.command = "mcp";
    else if (a === "adapt") args.command = "adapt";
    else if (a === "serve") args.command = "serve";
    else if (a === "webhook") args.command = "webhook";
    else if (a === "report") args.command = "report";
    else if (a === "upgrade") args.command = "upgrade";
    // Slash-commands surfaced as CLI subcommands so users get a clear hint
    // instead of a confusing usage error. These work only in the chat plugin.
    else if (
      a === "start" || a === "audit" || a === "inbox" || a === "digest" ||
      a === "review" || a === "doctor" || a === "burn" || a === "save" ||
      a === "resume" || a === "learn" || a === "agent-review" || a === "agent-retire" ||
      a === "rfc" || a === "release" || a === "ownership" || a === "oncall" ||
      a === "sec" || a === "poc" || a === "promote" || a === "crystallize" ||
      a === "migrate"
    ) {
      args.command = "chat-only-hint";
      // Stash which command they tried so we can quote it back
      (args as unknown as { _slashTried: string })._slashTried = a;
    }
    else if (a.startsWith("--dir=")) args.dir = a.slice("--dir=".length);
    else if (a === "--dir") args.dir = argv[++i] ?? args.dir;
    else if (a === "init" || a === "install" || a === "help" || a === "version") {
      // `install` is an alias for `init`. Both run the same flow.
      args.command = (a === "install" ? "init" : a) as CliArgs["command"];
      if (a === "install") {
        (args as unknown as { _fromInstall: boolean })._fromInstall = true;
      }
    } else if (!a.startsWith("-") && args.command === "init" && i === 0) {
      // First positional that isn't a recognised subcommand → unknown
      args.command = "unknown";
      args.unknownToken = a;
    } else if (a.startsWith("--") && args.command === "init") {
      // Unknown long flag in init position → unknown
      args.command = "unknown";
      args.unknownToken = a;
    } else rest.push(a);
  }

  args.dir = resolve(args.dir);
  args.positional = rest;
  return args;
}

async function runRegister(args: CliArgs): Promise<number> {
  const { join } = await import("node:path");
  const { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } = await import("node:fs");
  const { homedir } = await import("node:os");

  const cwd = args.dir;
  const projectMd = join(cwd, ".great_cto", "PROJECT.md");
  if (!existsSync(projectMd)) {
    error(`No .great_cto/PROJECT.md found in ${cwd}`);
    log("Run /audit or /start first inside a Claude Code session to bootstrap the project.");
    return 1;
  }

  const text = readFileSync(projectMd, "utf8");
  const get = (k: string) => (text.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim() || "";
  const meta = {
    slug: get("project") || cwd.split("/").pop() || "project",
    archetype: get("archetype") || "web-service",
    description: get("description") || "",
    path: cwd,
    added_at: new Date().toISOString(),
  };

  const dir = join(homedir(), ".great_cto");
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "projects.json");
  let reg: { projects: Array<typeof meta> } = { projects: [] };
  if (existsSync(f)) {
    try { reg = JSON.parse(readFileSync(f, "utf8")); } catch {}
  }
  if (reg.projects.find(p => p.path === meta.path)) {
    log(`✓ Already registered: ${meta.slug} (${cwd})`);
    return 0;
  }
  reg.projects.push(meta);
  writeFileSync(f, JSON.stringify(reg, null, 2));
  log(`✓ Registered: ${meta.slug} (${meta.archetype})`);
  log(`  → will appear in great-cto board project switcher`);
  return 0;
}

// ── Board server lifecycle helpers ───────────────────────────────────────────

/** Absolute path to the board PID file (persists across CLI invocations). */
function boardPidFilePath(surface?: "console"): string {
  // The two surfaces are separate processes with separate lifecycles — a console
  // start must never kill the builder board (and vice versa).
  return join(homedir(), ".great_cto", surface === "console" ? "console.pid" : "board.pid");
}

/**
 * Locate the board server.mjs — checks dev layouts then plugin cache versions
 * in descending order, returning the first path that exists.
 */
function findBoardServerPath(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [
    join(here, "..", "..", "board", "server.mjs"),  // packages/cli/dist (dev)
    join(here, "..", "board", "server.mjs"),         // alt dev layout
    join(here, "board", "server.mjs"),               // flat layout
  ];
  const pluginBase = join(homedir(), ".claude", "plugins", "cache", "local", "great_cto");
  if (fsExistsSync(pluginBase)) {
    try {
      // Numeric semver sort — a plain .sort() is lexicographic and would rank
      // 2.99.0 above 2.100.0 (and once ranked 2.7.0 above 2.69.0).
      const byVer = (a: string, b: string) => {
        const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
        return (pb[0]! - pa[0]!) || (pb[1]! - pa[1]!) || (pb[2]! - pa[2]!) || 0;
      };
      const versions = readdirSync(pluginBase).filter(v => /^\d/.test(v)).sort(byVer);
      for (const v of versions.slice(0, 5)) {
        candidates.push(join(pluginBase, v, "packages", "board", "server.mjs"));
      }
    } catch { /* ignore */ }
  }
  return candidates.find(fsExistsSync);
}

/**
 * Kill the board server recorded in the PID file.
 * Returns true if a live process was terminated.
 */
async function killExistingBoard(surface?: "console"): Promise<boolean> {
  const pidFile = boardPidFilePath(surface);
  if (!fsExistsSync(pidFile)) return false;
  const raw = readFileSync(pidFile, "utf8").trim();
  const pid = parseInt(raw, 10);
  if (!pid || isNaN(pid)) {
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    return false;
  }
  try {
    process.kill(pid, "SIGTERM");
    await new Promise<void>(r => setTimeout(r, 400));
    try { process.kill(pid, "SIGKILL"); } catch { /* already dead — fine */ }
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    return true;
  } catch {
    // process was already gone
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    return false;
  }
}

/**
 * If the board server is running (PID file present + process alive), kill it
 * and relaunch with the latest installed version in the background.
 * Called by runInit() after a new plugin version is installed.
 */
async function restartBoardAfterUpgrade(port: number): Promise<void> {
  const { spawn } = await import("node:child_process");
  const pidFile = boardPidFilePath();
  if (!fsExistsSync(pidFile)) return; // board wasn't running — nothing to do

  const raw = readFileSync(pidFile, "utf8").trim();
  const oldPid = parseInt(raw, 10);
  if (!oldPid || isNaN(oldPid)) return;

  // Check if the process is actually alive (signal 0 = existence check)
  try { process.kill(oldPid, 0); } catch { return; }

  log(`  ${dim(`↺  board server (pid ${oldPid}) running with old version — restarting…`)}`);

  await killExistingBoard();

  const serverPath = findBoardServerPath();
  if (!serverPath) {
    warn("board server not found after upgrade — start it manually with: great-cto board");
    return;
  }

  // Launch detached so it outlives this init process; --no-open because the
  // browser tab is already open pointing at the same port.
  const child = spawn(process.execPath, [serverPath, "--no-open"], {
    env: { ...process.env, BOARD_PORT: String(port) },
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  try {
    mkdirSync(join(homedir(), ".great_cto"), { recursive: true });
    writeFileSync(pidFile, String(child.pid));
  } catch { /* ignore */ }

  log(`  ${green("✓")} board restarted → http://localhost:${port}`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function runBoard(args: CliArgs, surface?: "console"): Promise<number> {
  const { spawn } = await import("node:child_process");

  // Stop any existing server OF THIS SURFACE (board and console run side by side)
  const killed = await killExistingBoard(surface);
  if (killed) {
    log(`  ${dim(surface === "console" ? "stopped previous console server" : "stopped previous board server")}`);
  }

  const serverPath = findBoardServerPath();
  if (!serverPath) {
    error("Board server not found. Try reinstalling: npx great-cto@latest");
    return 1;
  }

  const nodeArgs = [serverPath];
  if (args.boardNoOpen) nodeArgs.push("--no-open");
  if (surface) nodeArgs.push("--surface", surface);

  const env: NodeJS.ProcessEnv = { ...process.env, BOARD_PORT: String(args.boardPort) };
  if (surface === "console" && args.consoleBind) env.GREAT_CTO_HOST = args.consoleBind;
  if (args.demo) env.GREAT_CTO_DEMO_FEED = "1";

  const child = spawn(process.execPath, nodeArgs, {
    env,
    stdio: "inherit",
    detached: false,
  });

  // Write PID so future invocations (including init upgrades) can find us
  try {
    mkdirSync(join(homedir(), ".great_cto"), { recursive: true });
    writeFileSync(boardPidFilePath(surface), String(child.pid));
  } catch { /* best-effort */ }

  child.on("exit", code => {
    try { unlinkSync(boardPidFilePath(surface)); } catch { /* ignore */ }
    process.exit(code ?? 0);
  });

  return 0;
}

function printHelp(): void {
  log(`${bold("great-cto")} — one-command install for the great_cto Claude Code plugin

${bold("Usage:")}
  npx great-cto install [options]    Same as init
  npx great-cto [init] [options]     Detect + bootstrap
  npx great-cto board [--port 3141] [--no-open]
  npx great-cto console [--port 8788] [--bind 0.0.0.0] [--no-open]
  npx great-cto register [--dir PATH]
  npx great-cto ci [path] [--no-archetype] [--no-budget]
  npx great-cto mcp [--sse --port N]
  npx great-cto adapt [--dry-run]
  npx great-cto serve [--port 3142]
  npx great-cto upgrade [superpowers|beads]  Re-clone companions to latest tag + re-apply overlays
  npx great-cto help
  npx great-cto version

${bold("Board:")}
  great-cto board              Open Kanban + CTO Dashboard at localhost:3141
  great-cto board --port 4000  Use a different port
  great-cto board --no-open    Start server without opening browser

${bold("Operator console (the second surface — invite-only, hostable):")}
  great-cto console                 Serve ONLY the operator console (no dev board)
  great-cto console --port 8788     Different port
  great-cto console --bind 0.0.0.0  Reachable beyond this machine (tunnel/hosting);
                                    operators sign in via invite links

${bold("Telemetry (anonymous, opt-IN — OFF by default):")}
  great-cto telemetry status   Show state + endpoint + your anon_id
  great-cto telemetry on        Enable anonymous usage events (command, node, os — no PII)
  great-cto telemetry off       Disable  ${dim("(also: DO_NOT_TRACK=1)")}
  great-cto telemetry whoami    Print your anon_id (8 hex chars, not reversible)
  ${dim("Privacy policy: docs/PRIVACY.md")}

${bold("Register:")}
  great-cto register           Add this repo to ~/.great_cto/projects.json
                               (auto-discovered after /audit or /start, but
                                run this if the project doesn't appear in board)

${bold("Upgrade:")}
  great-cto upgrade              Upgrade superpowers + beads to latest, re-apply critic overlays
  great-cto upgrade superpowers  Upgrade superpowers only
  great-cto upgrade beads        Upgrade beads only
  ${dim("(Safe to run any time — idempotent if already on latest)")}

${bold("CI gate:")}
  great-cto ci                         Single-command CI gate (archetype + budget check)
  great-cto ci --no-archetype          Skip the archetype-drift check
  great-cto ci --no-budget             Skip the monthly-budget sanity check
  ${dim("(exits 1 on archetype drift; budget is warn-only)")}

${bold("MCP server (cross-platform):")}
  great-cto mcp                        Stdio MCP server — works in Claude Code /
                                       Claude Desktop / any MCP host
  great-cto mcp --sse --port 8765      SSE mode for remote / multi-client (TODO v2.5)
  ${dim("Tools exposed: detect_archetype, estimate_cost, query_decisions,")}
  ${dim("               project_status, cost_summary, pipeline_stages, recent_verdicts")}

${bold("Claude Code adapter:")}
  great-cto adapt                      Generate AGENTS.md + CLAUDE.md
  great-cto adapt --dry-run            Preview what would be written
  ${dim("Idempotent — re-run after editing .great_cto/PROJECT.md")}

${bold("Webhook server (preview):")}
  great-cto serve --port 3142          Webhook receiver (logs to ~/.great_cto/webhook-events.log)
  ${dim("Endpoints: POST /webhook/github, POST /webhook/generic, GET /events, GET /healthz")}

${bold("Options:")}
  -y, --yes              Skip confirmation prompts (non-interactive)
      --dry-run          Show what would be done without doing it
      --force            Reinstall even if already present
      --archetype NAME   Override detected archetype
                         (${cyan("web-service|mobile-app|ai-system|agent-product|commerce|fintech|")}
                          ${cyan("healthcare|web3|data-platform|infra|library|cli-tool|")}
                          ${cyan("iot-embedded|regulated|devtools|browser-extension|game")})
      --version-tag VER  Pin to specific great_cto version (default: latest)
      --dir PATH         Run against a different directory (default: cwd)
      --use-llm          Force LLM (Anthropic Haiku) archetype suggestion
                         even when heuristic confidence is high
      --no-llm           Skip LLM suggestion (run heuristic only)
                         Or set ${cyan("GREATCTO_NO_LLM=1")}
  -h, --help             Show this help
  -v, --version          Show great-cto CLI version

${bold("What it does:")}
  1. Scans your project for stack signals (package.json, Cargo.toml, go.mod, etc.)
  2. Picks the matching great_cto archetype (web-service, commerce, ai-system, devtools, browser-extension, game, ...)
  3. Clones the plugin into ~/.claude/plugins/cache/local/great_cto/<version>/
  4. Enables the plugin in ~/.claude/settings.json
  5. Creates .great_cto/PROJECT.md pre-filled with archetype + detected stack

${bold("Next steps after install:")}
  Restart Claude Code. Then run ${cyan("/inbox")} to see what needs attention,
  or ${cyan("/audit")} for a full analysis of an existing codebase.

${bold("Links:")}
  github.com/avelikiy/great_cto
`);
}

async function runInitCodex(args: CliArgs): Promise<number> {
  const { homedir } = await import("node:os");
  const home = homedir();

  log(bold("great-cto · Codex host install"));
  log("");
  log(`Installing great_cto for ${cyan("OpenAI Codex")} (Desktop + CLI).`);
  log(`This writes hook, MCP, and agent config to your Codex skill directory.`);
  log("");

  if (args.dryRun) {
    log(yellow("dry-run: showing what would be written."));
    log(`  would write: ${home}/.codex/skills/great_cto/hooks.json`);
    log(`  would write: ${home}/.codex/skills/great_cto/scripts/  (hook .mjs files)`);
    log(`  would update: .codex/great_cto.toml  (merge into ~/.codex/config.toml)`);
    return 0;
  }

  const { mkdirSync, copyFileSync, existsSync, writeFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  // ── 1. locate the plugin source ──────────────────────────
  // Works whether invoked via npx (global cache) or a local build.
  // - npx run: dist/main.js → dist/ → ../ → package root → scripts/hooks/
  // - dev run from packages/cli/: same as above
  // - repo dev with ts-node: src/main.ts → src/ → ../ → packages/cli/ → ../../scripts/hooks/
  const here = dirname(fileURLToPath(import.meta.url));
  const hooksSearchPaths = [
    join(here, "..", "scripts", "hooks"),          // npm install: dist/../scripts/hooks
    join(here, "..", "..", "scripts", "hooks"),     // monorepo: packages/cli/dist/../../scripts
    join(here, "..", "..", "..", "scripts", "hooks"), // ts-node: src/../../../scripts
  ];
  const hooksDir = hooksSearchPaths.find(p => existsSync(p));
  if (!hooksDir) {
    error("Could not locate scripts/hooks/. Try: npx great-cto@latest --host codex");
    return 1;
  }

  // ── 2. install skill dir ──────────────────────────────────
  const skillDir = join(home, ".codex", "skills", "great_cto");
  const skillScriptsDir = join(skillDir, "scripts", "hooks");
  mkdirSync(skillScriptsDir, { recursive: true });
  log(dim(`  skill dir: ${skillDir}`));

  // Copy hook scripts
  const HOOKS_TO_COPY = [
    "quota-check.mjs",
    "secret-scan.mjs",
    "cost-guard.mjs",
    "orchestrator-check.mjs",
    "format-check.mjs",
    "tool-failure.mjs",
    "summary-enforce.mjs",
  ];
  let copied = 0;
  for (const hook of HOOKS_TO_COPY) {
    const src = join(hooksDir, hook);
    const dst = join(skillScriptsDir, hook);
    if (existsSync(src)) {
      copyFileSync(src, dst);
      copied++;
    }
  }
  log(`  ${green("✓")} ${copied} hook scripts → ${skillScriptsDir}`);

  // Write hooks.json into the skill dir
  const { getCodexHooksJson } = await import("./adapt.js");
  const hooksJson = getCodexHooksJson(skillDir);
  writeFileSync(join(skillDir, "hooks.json"), hooksJson);
  log(`  ${green("✓")} wrote ~/.codex/skills/great_cto/hooks.json`);

  // ── 3. write project-scoped config fragment ───────────────
  const configFrag = join(args.dir, ".codex", "great_cto.toml");
  mkdirSync(dirname(configFrag), { recursive: true });
  writeFileSync(configFrag, [
    `# great_cto Codex integration — generated ${new Date().toISOString().slice(0, 10)}`,
    `# Add these sections to ~/.codex/config.toml`,
    ``,
    `[features]`,
    `hooks = true`,
    ``,
    `[mcp_servers.great_cto]`,
    `command = "npx"`,
    `args = ["great-cto@latest", "mcp"]`,
    `startup_timeout_sec = 60`,
    ``,
    `[mcp_servers.great_cto.env]`,
    `CODEX_SKILL_DIR = "${skillDir}"`,
    ``,
    `[hooks_files]`,
    `paths = ["${join(skillDir, "hooks.json")}"]`,
  ].join("\n") + "\n");
  log(`  ${green("✓")} wrote .codex/great_cto.toml`);

  log("");
  log(bold("Next steps:"));
  log(`  1. Merge ${cyan(".codex/great_cto.toml")} sections into ${cyan("~/.codex/config.toml")}`);
  log(`  2. Add ${cyan(args.dir)} to trusted projects in config.toml if not already:`);
  log(`     ${dim(`[projects."${args.dir}"]`)}`);
  log(`     ${dim(`trust_level = "trusted"`)}`);
  log(`  3. Restart Codex Desktop / CLI to activate hooks and MCP server.`);
  log(`  4. Verify: run ${cyan("great-cto mcp")} in a terminal — should list great_cto tools.`);
  log("");
  log(`${green("✓")} Codex host install complete.`);
  return 0;
}

async function runInit(args: CliArgs): Promise<number> {
  // Route to Codex-specific install if --host codex
  if (args.host === "codex") return runInitCodex(args);

  banner();

  // ── 1. detect ────────────────────────────────────────────
  // Guard: refuse to init in $HOME or other "obviously not a project" locations.
  // Most projects have at least one of: package.json / pyproject.toml /
  // Cargo.toml / go.mod / .git / src/. Without any signal we'd default to
  // greenfield with low confidence, which leaves users confused.
  const HOME = process.env.HOME || process.env.USERPROFILE || "";
  if (args.dir === HOME) {
    error(`refusing to initialize great_cto in $HOME (${HOME}).`);
    log("");
    log(`great_cto is meant to run inside a project repository, not your home directory.`);
    log(`If you're testing the install, ${cyan("cd")} into a real repo first:`);
    log("");
    log(`    ${cyan("cd /path/to/your/project")}`);
    log(`    ${cyan("npx great-cto init")}`);
    log("");
    log(`Or create an empty test project:`);
    log("");
    log(`    ${cyan("mkdir /tmp/test-greatcto && cd /tmp/test-greatcto && git init")}`);
    log(`    ${cyan("npx great-cto init")}`);
    return 2;
  }

  step(1, 5, `scanning ${args.dir}`);
  const detection = detect(args.dir);
  if (detection.hasExistingGreatCto) {
    warn(".great_cto/ already exists in this directory.");
    log("");
    log(`To preserve existing config: nothing to do, you're already initialized.`);
    log(`To start fresh: back up ${cyan(".great_cto/")} first, then re-run with ${cyan("--force")}:`);
    log("");
    log(`    ${cyan("npx great-cto init --force")}`);
    log("");
    log(`To override the detected archetype without re-init:`);
    log("");
    log(`    ${cyan("npx great-cto init --force --archetype agent-product")}`);
    log("");
    if (!args.yes && !args.force) {
      const ok = await confirm("Continue anyway? (existing PROJECT.md will be kept as-is)", false);
      if (!ok) {
        log(yellow("Aborted. (Not an error — your existing config is intact.)"));
        return 0;  // exit 0 — user-initiated abort is not a failure
      }
    }
  }

  log(`  ${dim("stack:")} ${detection.stack.length > 0 ? detection.stack.join(", ") : dim("(no strong signals)")}`);
  log(`  ${dim("languages:")} ${detection.languages.join(", ") || dim("(none)")}`);
  if (detection.packageManager) log(`  ${dim("package manager:")} ${detection.packageManager}`);
  log(`  ${dim("tests:")} ${detection.hasTests ? green("yes") : yellow("no")}  ${dim("CI:")} ${detection.hasCI ? green("yes") : yellow("no")}`);

  // ── 2. pick archetype ────────────────────────────────────
  step(2, 5, "picking archetype");
  let archetype: string;
  let rationale: string;
  let alternatives: string[];
  let confidence: string;

  if (args.archetype) {
    archetype = args.archetype;
    rationale = "overridden via --archetype";
    alternatives = [];
    confidence = "user-specified";
  } else {
    const pick = pickArchetype(detection);
    archetype = pick.primary;
    rationale = pick.rationale;
    alternatives = pick.alternatives;
    confidence = pick.confidence;
  }

  // ── 2b. LLM fallback for low-confidence detections (Wave 4) ──────
  if (!args.archetype) {
    const llmDecision = shouldUseLlmFallback({
      heuristicConfidence: confidence as "high" | "medium" | "low",
      forceUse: args.useLlm,
      forceSkip: args.noLlm,
    });
    if (llmDecision.use) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        log(`  ${dim("→ low confidence — asking Anthropic Haiku for second opinion...")}`);
        const llm = await suggestArchetypeFromLlm({
          dir: args.dir,
          detection,
          heuristicArchetype: archetype as never,
          apiKey,
        });
        if (llm) {
          if (llm.conflictsWithHeuristic) {
            log("");
            log(`  ${bold("AI suggests:")} ${cyan(llm.archetype)} ${dim(`(${llm.confidence})`)}`);
            log(`  ${dim("AI rationale:")} ${llm.rationale}`);
            log(`  ${bold("Heuristic says:")} ${cyan(archetype)} ${dim(`(${confidence})`)}`);
            if (!args.yes) {
              const accept = await confirm(
                `Use AI suggestion ${cyan(llm.archetype)} instead of ${cyan(archetype)}?`,
                true,
              );
              if (accept) {
                archetype = llm.archetype;
                rationale = `(AI) ${llm.rationale}`;
                confidence = llm.confidence;
                if (!alternatives.includes(archetype as never)) {
                  alternatives = [archetype, ...alternatives.filter((a) => a !== archetype)].slice(0, 3);
                }
              }
            } else {
              // --yes: silently take AI suggestion only if it bumps confidence
              if (llm.confidence !== "low") {
                archetype = llm.archetype;
                rationale = `(AI) ${llm.rationale}`;
                confidence = llm.confidence;
              }
            }
          } else if (llm.confidence !== "low") {
            // AI agrees → bump confidence, refine rationale
            confidence = llm.confidence;
            rationale = `${rationale} (AI confirmed: ${llm.rationale})`;
          }
        } else {
          log(`  ${dim("(LLM call failed, keeping heuristic)")}`);
        }
      }
    }
  }

  const compliance = suggestCompliance(detection, archetype as never);

  // Compile flow — used for user-facing summary AND written to FLOW.md by bootstrap()
  const compiledFlow = compileFlow(
    archetype as never,
    (detection.projectSize ?? "medium") as never,
    detection,
    compliance,
    confidence,
  );

  // ── User-facing "Compiled flow" summary ──────────────────────────────────
  log("");
  log(`${bold("Compiled flow:")} ${cyan(compiledFlow.title)}`);
  log(`  ${dim("Agents:")}     ${compiledFlow.agents.join(" · ")}`);
  log(`  ${dim("Gates:")}      ${compiledFlow.gates.join(" · ")}`);
  if (compiledFlow.compliance.length > 0) {
    log(`  ${dim("Compliance:")} ${compiledFlow.compliance.join(", ")}`);
  }
  log(`  ${dim("Cost:")}       ~$${compiledFlow.costRange.low}–$${compiledFlow.costRange.high} per feature cycle`);
  log("");

  // Low-confidence notice — show only when actionable
  if (!args.yes && !args.archetype && (confidence === "low" || (confidence === "medium" && alternatives.length >= 2))) {
    log(`  ${yellow("⚠")} ${dim(`Detected as ${cyan(archetype)} (${confidence} confidence).`)}`);
    if (alternatives.length > 0) {
      log(`  ${dim("Alternatives: " + alternatives.join(", "))}`);
    }
    log(`  ${dim("Override: npx great-cto init --archetype <name>")}`);
    log("");
  }

  // Confirmation
  if (!args.yes) {
    log("");
    const ok = await confirm(bold("Install great_cto plugin and bootstrap this project?"), true);
    if (!ok) {
      log("Aborted.");
      return 1;
    }
  }

  if (args.dryRun) {
    log("");
    log(yellow("dry-run: no changes made."));
    log(`  would install plugin into ~/.claude/plugins/cache/local/great_cto/<version>/`);
    log(`  would enable great_cto@local in ~/.claude/settings.json`);
    log(`  would create .great_cto/PROJECT.md with archetype=${archetype}`);
    return 0;
  }

  // ── 3. install plugin ────────────────────────────────────
  step(3, 5, "installing plugin");
  const existing = findInstalledVersions();
  if (existing.length > 0 && !args.version && !args.force) {
    log(`  ${dim("already-installed versions:")} ${existing.join(", ")}`);
  }
  const installResult = install({
    version: args.version ?? undefined,
    force: args.force,
  });
  if (installResult.alreadyInstalled) {
    log(`  ${dim("version")} ${installResult.version} ${dim("already installed at")} ${installResult.pluginDir}`);
    log(`  ${dim("(use --force to reinstall)")}`);
  } else {
    // New version installed — restart board server if it was running so it
    // picks up the updated server.mjs immediately (no manual restart needed).
    await restartBoardAfterUpgrade(args.boardPort);
  }

  // ── 4. enable in settings ────────────────────────────────
  step(4, 5, "enabling plugin in ~/.claude/settings.json");
  const enableResult = enableGreatCto();
  if (enableResult.alreadyEnabled) {
    log(`  ${dim("already enabled in")} ${enableResult.settingsPath}`);
  }

  // ── 4b. one-shot legacy cleanup ──────────────────────────
  // Versions < 1.0.104 copied commands to ~/.claude/commands/ without a
  // `great_cto-managed` marker; the SessionStart hook in 1.0.104+ can't
  // safely delete them. If this looks like an upgrade from an older version,
  // remove any unmarked copies of commands we used to ship so the new loop
  // can drop its marker-tagged versions.
  if (existing.length > 0) {
    try {
      const { existsSync, readFileSync, unlinkSync } = await import("node:fs");
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const legacy = [
        "triage", "gates", "dora", "investigate", "threat-model", "sbom",
        "security-incident", "update", "status", "capture", "revisit",
        "board-report", "burn", "cost", "poc", "promote", "sec",
      ];
      const cmdDir = join(homedir(), ".claude", "commands");
      let cleaned = 0;
      for (const name of legacy) {
        const f = join(cmdDir, `${name}.md`);
        if (!existsSync(f)) continue;
        const head = readFileSync(f, "utf-8").slice(0, 4096);
        // Only delete files that look like OUR old commands (contain great_cto
        // references) AND lack the 1.0.104+ marker. Hand-written user files
        // won't match the great_cto reference test.
        const looksOurs = /great_cto|\.great_cto|Great CTO/.test(head);
        const hasMarker = /great_cto-managed/.test(head);
        if (looksOurs && !hasMarker) {
          unlinkSync(f);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        log(`  ${dim(`cleaned ${cleaned} legacy command file(s) from ~/.claude/commands (pre-1.0.104 unmarked)`)}`);
      }
    } catch { /* best-effort — don't block install */ }
  }

  // ── 4b-companion. install superpowers + beads ────────────
  // These are required companion plugins. Auto-install so users don't need
  // a separate manual step after reading "Requires:" in the README.
  // Idempotent — silently skips if already present.
  {
    log("");
    step(4, 5, "installing companion plugins (superpowers + beads)");
    const companions = installAllCompanions();
    for (const r of companions) {
      if (r.status === "installed") {
        log(`  ${dim(`${r.name} ${r.version} installed`)}`);
      } else if (r.status === "already_present") {
        log(`  ${dim(`${r.name} ${r.version} already installed`)}`);
      } else {
        warn(`  ${r.name} skipped — ${r.reason ?? "unknown reason"}`);
        warn(`  install manually: claude plugin install github.com/obra/${r.name === "superpowers" ? "superpowers" : ""} or github.com/steveyegge/beads`);
      }
    }
    // Apply bundled critic overlays (idempotent — skips already-applied changes)
    try {
      const { applyOverlays } = await import("./overlay.js");
      applyOverlays();
    } catch { /* best-effort — overlay failure must not block init */ }
  }

  // ── 4c. bootstrap skills catalog (v1.0.140+) ─────────────
  // Clone external skill repos + run skill-discover.sh so agents have
  // the catalog locally from session 1, not after first SessionStart hook.
  try {
    const { existsSync, mkdirSync } = await import("node:fs");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const greatCtoDir = join(homedir(), ".great_cto");
    mkdirSync(greatCtoDir, { recursive: true });

    // Create secrets.env template if missing — used by llm-router MCP server.
    // Never overwrite an existing file (user may have real keys in there).
    const { writeFileSync: wf } = await import("node:fs");
    const secretsPath = join(greatCtoDir, "secrets.env");
    if (!existsSync(secretsPath)) {
      wf(secretsPath,
        "# great_cto secrets — never commit this file\n" +
        "# LLM router (optional, ~25% cost reduction on non-critical tasks):\n" +
        "# Get a key at https://openrouter.ai/keys\n" +
        "#OPENROUTER_API_KEY=sk-or-v1-...\n" +
        "\n" +
        "# Override default routing model (default: moonshotai/kimi-k2):\n" +
        "#GREAT_CTO_ROUTER_MODEL=moonshotai/kimi-k2\n",
        "utf-8"
      );
      log(`  ${dim("created ~/.great_cto/secrets.env (add OPENROUTER_API_KEY for LLM router)")}`);
    }

    const skillSources = [
      { name: "anthropic-skills", url: "https://github.com/anthropics/skills.git" },
      { name: "personal-skills", url: "https://github.com/avelikiy/ai-agent-skills.git" },
    ];

    for (const src of skillSources) {
      const path = join(greatCtoDir, src.name);
      if (!existsSync(path)) {
        log(`  ${dim(`cloning ${src.name}...`)}`);
        const r = spawnSync("git", ["clone", "--depth=1", src.url, path], {
          stdio: "pipe",
          timeout: 30_000,
        });
        if (r.status !== 0) {
          log(`  ${dim(`(skipped ${src.name}: clone failed; SessionStart hook will retry)`)}`);
        }
      }
    }

    // Run skill-discover.sh to build initial registry.
    // v1.0.146: version-sort properly (semver) and force refresh if registry
    // plugin_version != installed plugin_version (stale cache from prior version).
    const pluginCacheBase = join(homedir(), ".claude", "plugins", "cache", "local", "great_cto");
    const { readdirSync, readFileSync, unlinkSync } = await import("node:fs");
    if (existsSync(pluginCacheBase)) {
      const semverCmp = (a: string, b: string) => {
        const pa = a.split(".").map(n => parseInt(n, 10) || 0);
        const pb = b.split(".").map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const d = (pa[i] ?? 0) - (pb[i] ?? 0);
          if (d !== 0) return d;
        }
        return 0;
      };
      const versions = readdirSync(pluginCacheBase).sort(semverCmp).reverse();
      if (versions.length > 0) {
        const latest = versions[0]!;
        const discover = join(pluginCacheBase, latest, "scripts", "skill-discover.sh");
        if (existsSync(discover)) {
          // Force refresh: unlink existing registry if it pins to a different version
          const registryPath = join(greatCtoDir, "skills-registry.json");
          if (existsSync(registryPath)) {
            try {
              const reg = JSON.parse(readFileSync(registryPath, "utf-8")) as { plugin_version?: string };
              if (reg.plugin_version && reg.plugin_version !== latest) {
                unlinkSync(registryPath);
                log(`  ${dim(`registry version mismatch (${reg.plugin_version} → ${latest}) — refreshing`)}`);
              }
            } catch { /* malformed — let discover overwrite */ }
          }
          spawnSync("bash", [discover], {
            stdio: "ignore",
            timeout: 15_000,
            env: { ...process.env, PLUGIN_DIR: join(pluginCacheBase, latest) },
          });
          log(`  ${dim("skills registry built at ~/.great_cto/skills-registry.json")}`);
        }
      }
    }
  } catch {
    /* best-effort — don't block install if skills bootstrap fails */
  }

  // ── 5. bootstrap ─────────────────────────────────────────
  step(5, 5, "bootstrapping .great_cto/PROJECT.md");
  const bs = bootstrap(args.dir, detection, archetype as never, compliance, {
    confidence,
    alternatives,
    rationale,
  });
  if (!bs.created) {
    log(`  ${dim("PROJECT.md already exists at")} ${bs.projectMdPath} ${dim("— kept as-is")}`);
  }

  // ── 6. install pre-push git hook ─────────────────────────
  installPrePushHook(args.dir);

  // ── 7. opt-IN telemetry prompt (default OFF) ─────────────
  await promoteTelemetryOptIn({ archetype: String(archetype), cliVersion: getCliVersion(), yes: args.yes });
  // If already enabled (prior opt-in or env var), count this (re)install toward MAU.
  if (isTelemetryEnabled()) {
    await sendInstallPing({ cliVersion: getCliVersion(), archetype: String(archetype), consent: true })
      .catch(() => { /* never block init on telemetry */ });
  }

  // ── done ─────────────────────────────────────────────────
  log("");
  log(green(bold("✓ great_cto is ready.")));
  log("");

  log(bold("Next steps:"));
  log(`  1. ${dim("Restart Claude Code to pick up the plugin.")}`);
  log(`  2. ${dim("Edit")} ${cyan(".great_cto/PROJECT.md")} ${dim("to refine goals and compliance.")}`);
  log(`  3. ${dim("In Claude Code, run:")} ${cyan("/inbox")} ${dim("— see what needs attention.")}`);
  log(`  4. ${dim("For existing repos:")} ${cyan("/audit")} ${dim("— gap analysis + prioritized task backlog.")}`);
  log(`  5. ${dim("For new features:")} ${cyan('/start "describe what you\'re building"')}`);
  log("");
  log(dim("Docs: https://github.com/avelikiy/great_cto"));
  log("");
  return 0;
}

// ── Telemetry opt-IN prompt ────────────────────────────────────────────────
// Shown after a successful init when interactive. Skipped if: --yes, non-TTY,
// DO_NOT_TRACK=1, CI, or the user already decided (either way — no nagging).
async function promoteTelemetryOptIn(opts: { archetype: string; cliVersion: string; yes: boolean }): Promise<void> {
  if (opts.yes) return;
  if (!process.stdin.isTTY) return;
  if (process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true") return;
  if (process.env.CI || process.env.GITHUB_ACTIONS) return;

  const cfgFile = join(homedir(), ".great_cto", "telemetry.json");
  if (fsExistsSync(cfgFile)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgFile, "utf8")) as { enabled?: boolean };
      if (cfg.enabled === true || cfg.enabled === false) return;  // already decided
    } catch { /* malformed — ask again */ }
  }

  log(dim("─".repeat(60)));
  log(bold("Help improve great_cto with anonymous usage data?"));
  log("");
  log(dim("Default: OFF. One event per command — exactly this, nothing more:"));
  log("");
  log(gray(`  { "command": "init", "archetype": "${opts.archetype}", "version": "${opts.cliVersion}",`));
  log(gray(`    "node": "${process.version.replace(/^v/, "")}", "os": "${process.platform}",`));
  log(gray(`    "exit_code": 0, "duration_ms": 1234, "anon_id": "${computeAnonId()}" }`));
  log("");
  log(dim("No code, no repo names, no file paths, no IP, no PII. ") + dim("anon_id is sha256(user@host), not reversible."));
  log(dim("Toggle anytime: " + cyan("npx great-cto telemetry off") + " · honors " + cyan("DO_NOT_TRACK=1")));
  log(dim("Privacy: " + cyan("github.com/avelikiy/great_cto/blob/main/docs/PRIVACY.md")));
  log("");

  const yes = await confirm(bold("Enable anonymous telemetry?"), false);
  log("");
  try {
    mkdirSync(join(homedir(), ".great_cto"), { recursive: true });
    writeFileSync(cfgFile, JSON.stringify({ enabled: yes, decided_at: new Date().toISOString() }, null, 2) + "\n");
  } catch { /* best-effort */ }

  if (yes) {
    log(green("✓ Telemetry enabled. Thank you."));
    log(dim(`  Your anon_id: ${cyan("npx great-cto telemetry whoami")}  ·  off anytime: ${cyan("npx great-cto telemetry off")}`));
    log("");
  } else {
    log(dim("No telemetry. (You can opt in later with " + cyan("npx great-cto telemetry on") + ".)"));
    log("");
  }
}

/**
 * Copy scripts/hooks/pre-push.sh from the installed plugin into the project's
 * .git/hooks/pre-push so that future pushes are scanned for private project
 * name leaks. Best-effort — never throws.
 */
function installPrePushHook(projectDir: string): void {
  try {
    const gitHooksDir = join(projectDir, ".git", "hooks");
    if (!fsExistsSync(gitHooksDir)) return; // not a git repo — skip silently

    const dest = join(gitHooksDir, "pre-push");
    if (fsExistsSync(dest)) {
      log(`  ${dim("pre-push hook already present — skipped")}`);
      return;
    }

    // Locate source: dist/main.js → ../../scripts/hooks/pre-push.sh
    const here = dirname(fileURLToPath(import.meta.url));
    const src = join(here, "..", "..", "scripts", "hooks", "pre-push.sh");
    if (!fsExistsSync(src)) {
      warn("pre-push hook source not found — skipping hook installation");
      return;
    }

    copyFileSync(src, dest);
    chmodSync(dest, 0o755);
    success("installed pre-push hook (blocks private project name leaks)");
  } catch {
    // Best-effort: hook failure must never block init
  }
}


async function runUpgrade(rawArgv: string[]): Promise<number> {
  const { upgradePlugin, upgradeAll } = await import("./upgrade.js");
  const { COMPANION_PLUGINS } = await import("./companion.js");

  // Optional positional: great-cto upgrade [plugin-name]
  const upgradeIdx = rawArgv.indexOf("upgrade");
  const pluginArg = upgradeIdx >= 0 ? rawArgv[upgradeIdx + 1] : undefined;
  const targetPlugin = pluginArg && !pluginArg.startsWith("--") ? pluginArg : undefined;

  let results;
  if (targetPlugin) {
    const plugin = COMPANION_PLUGINS.find((p) => p.name === targetPlugin);
    if (!plugin) {
      error(`unknown plugin '${targetPlugin}'. Valid: ${COMPANION_PLUGINS.map((p) => p.name).join(", ")}`);
      return 2;
    }
    results = [await upgradePlugin(plugin)];
  } else {
    results = await upgradeAll();
  }

  for (const r of results) {
    if (r.status === "upgraded") {
      success(`${r.name} ${r.fromVersion} → ${r.toVersion}`);
    } else if (r.status === "already_latest") {
      log(`  ${dim(`${r.name} ${r.toVersion} already at latest (overlays re-applied)`)}`);
    } else {
      warn(`${r.name} skipped — ${r.reason ?? "unknown reason"}`);
    }
  }

  return 0;
}

async function main(): Promise<void> {
  const rawArgv = process.argv.slice(2);
  const args = parseArgs(rawArgv);

  // Anonymous, opt-IN usage telemetry (default OFF — see docs/PRIVACY.md). `finish`
  // is the single exit funnel: it fires one fire-and-forget event (command + node + os
  // + exit_code + duration, no PII) only when the user has opted in, then exits.
  const __tStart = Date.now();
  const finish = async (code: number): Promise<void> => {
    try {
      await sendUsagePing({
        cliVersion: getCliVersion(),
        subcommand: args.command,
        exitCode: code,
        durationMs: Date.now() - __tStart,
      });
    } catch { /* telemetry never affects the exit */ }
    process.exit(code);
  };

  // `great-cto telemetry <on|off|status|whoami>` — inspect / toggle, never sends.
  if (args.command === "telemetry") {
    const { exitCode, output } = telemetrySubcommand(args.positional[0]);
    process.stdout.write(output);
    process.exit(exitCode);
  }

  if (args.command === "help") {
    printHelp();
    await finish(0);
  }
  if (args.command === "unknown") {
    const tok = (args as CliArgs).unknownToken ?? "<arg>";
    error(`great-cto: unknown command or flag '${tok}'`);
    log("");
    log(`Run ${cyan("great-cto --help")} for usage.`);
    process.exit(2);
  }
  if (args.command === "board") {
    try {
      const code = await runBoard(args);
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(1);
    }
  }
  if (args.command === "console") {
    try {
      const code = await runBoard(args, "console");
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(1);
    }
  }
  if (args.command === "register") {
    try {
      const code = await runRegister(args);
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(1);
    }
  }
  if (args.command === "ci") {
    try {
      const { runCi, parseCiArgs } = await import("./ci.js");
      const code = await runCi(parseCiArgs(rawArgv));
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "mcp") {
    try {
      const { runMcp } = await import("./mcp.js");
      const sse = rawArgv.includes("--sse");
      const portArg = rawArgv.indexOf("--port");
      const port = portArg >= 0 ? parseInt(rawArgv[portArg + 1] ?? "8765", 10) : 8765;
      const code = await runMcp({ mode: sse ? "sse" : "stdio", port, version: getCliVersion() });
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "adapt") {
    try {
      const { runAdapt } = await import("./adapt.js");
      const code = await runAdapt({
        platform: "claude",
        dryRun: rawArgv.includes("--dry-run"),
        cwd: args.dir,
      });
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "serve") {
    try {
      const { runServe } = await import("./serve.js");
      const explicitPort = rawArgv.some((a) => a === "--port" || a.startsWith("--port="));
      const code = await runServe({
        // serve defaults to 3142 (board uses 3141). Honor an explicit --port
        // of any value, including 3141 — only fall back to 3142 when unset.
        port: explicitPort ? args.boardPort : 3142,
        noLog: rawArgv.includes("--no-log"),
        insecure: rawArgv.includes("--insecure"),
      });
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "webhook") {
    try {
      const { runWebhookCli, parseWebhookArgs } = await import("./webhook-cli.js");
      const parsed = parseWebhookArgs(rawArgv);
      if (!parsed) {
        error("usage: great-cto webhook list | add-incoming <name> --secret <s> | add-outgoing <name> --url <u> --format <f> --triggers <t1,t2> | remove <name> | test <name>");
        process.exit(2);
      }
      const code = await runWebhookCli(parsed);
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "upgrade") {
    try {
      const code = await runUpgrade(rawArgv);
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "chat-only-hint") {
    const tried = (args as unknown as { _slashTried?: string })._slashTried || "<command>";
    error(`'${tried}' is a chat slash command, not a CLI subcommand.`);
    log("");
    log(`To run it, open Claude Code, Cursor, or any AI assistant that has`);
    log(`great_cto installed and type:`);
    log("");
    log(`    ${cyan("/" + tried)} ${dim("[args]")}`);
    log("");
    log(`The CLI surface (this command) only exposes:`);
    log(`  ${cyan("init")} · ${cyan("ci")} · ${cyan("mcp")} · ${cyan("adapt")} ·`);
    log(`  ${cyan("serve")} · ${cyan("webhook")} · ${cyan("report")} · ${cyan("board")} · ${cyan("register")} · ${cyan("upgrade")}`);
    log("");
    log(`Run ${cyan("npx great-cto --help")} for the full CLI reference.`);
    process.exit(2);
  }
  if (args.command === "report") {
    try {
      const { runReport, parseReportArgs } = await import("./report.js");
      const parsed = parseReportArgs(rawArgv, args.dir);
      if (!parsed) {
        process.exit(2);
      }
      const code = await runReport(parsed);
      await finish(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "version") {
    // Version resolved in index.mjs or from package.json at runtime
    try {
      const { readFileSync } = await import("node:fs");
      const { dirname, join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const here = dirname(fileURLToPath(import.meta.url));
      // dist or src; package.json is two levels up
      for (const base of [here, join(here, ".."), join(here, "..", "..")]) {
        const p = join(base, "package.json");
        try {
          const pkg = JSON.parse(readFileSync(p, "utf-8")) as { name?: string; version?: string };
          if (pkg.name === "great-cto" && pkg.version) {
            log(pkg.version);
            process.exit(0);
          }
        } catch { /* keep searching */ }
      }
      log("0.0.0");
    } catch {
      log("0.0.0");
    }
    process.exit(0);
  }

  try {
    const code = await runInit(args);
    await finish(code);
  } catch (e) {
    error((e as Error).message);
    process.exit(1);
  }
}

await main();
