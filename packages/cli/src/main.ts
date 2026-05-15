// CLI entry: parse args, run the init flow.
//
// Flow:
//   1. banner
//   2. detect stack in cwd
//   3. pick archetype + compliance
//   4. confirm with user (unless -y)
//   5. install plugin (git clone)
//   6. enable in ~/.claude/settings.json
//   7. bootstrap .great_cto/PROJECT.md
//   8. print next steps

import { resolve } from "node:path";
import { banner, bold, cyan, dim, error, gray, green, log, step, success, warn, yellow, confirm } from "./ui.js";
import { detect } from "./detect.js";
import { pickArchetype, suggestCompliance } from "./archetypes.js";
import { install, findInstalledVersions } from "./installer.js";
import { enableGreatCto } from "./settings.js";
import { bootstrap } from "./bootstrap.js";
import { shouldUseLlmFallback, suggestArchetypeFromLlm } from "./llm-fallback.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  command: "init" | "help" | "version" | "board" | "register" | "scan" | "list-rules" | "ci" | "mcp" | "adapt" | "serve" | "webhook" | "report" | "chat-only-hint" | "unknown";
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
  useLlm: boolean;        // --use-llm: force LLM even on high confidence
  noLlm: boolean;         // --no-llm: skip LLM even on low confidence
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "init",
    boardPort: 3141,
    boardNoOpen: false,
    dir: process.cwd(),
    yes: false,
    dryRun: false,
    force: false,
    archetype: null,
    version: null,
    useLlm: false,
    noLlm: false,
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
    else if (a === "board") args.command = "board";
    else if (a === "register") args.command = "register";
    else if (a === "scan") args.command = "scan";
    else if (a === "list-rules") args.command = "list-rules";
    else if (a === "ci") args.command = "ci";
    else if (a === "mcp") args.command = "mcp";
    else if (a === "adapt") args.command = "adapt";
    else if (a === "serve") args.command = "serve";
    else if (a === "webhook") args.command = "webhook";
    else if (a === "report") args.command = "report";
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
    else if (a === "init" || a === "help" || a === "version") {
      args.command = a as CliArgs["command"];
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

/**
 * `great-cto scan [path]` — AI-specific security scanner (formerly @great-cto/agentshield).
 *
 * Detects OWASP LLM Top 10 patterns: prompt injection vectors, secrets in
 * prompts, SSRF in tool definitions, RAG poisoning, cost-runaway loops.
 *
 * Flags (parsed from raw argv since they're scan-specific):
 *   --severity <lvl>   info|low|medium|high|critical (default: info)
 *   --scanner <name>   prompt-injection | secrets-in-prompts | ssrf-in-tools |
 *                      rag-poisoning | cost-runaway (repeatable)
 *   --sarif <file>     emit SARIF 2.1.0 to file
 *   --json             emit JSON to stdout
 *   --quiet            suppress human-readable output
 *   --max <n>          stop after N findings
 *   --exclude <regex>  add path exclude (repeatable)
 *
 * Exit codes:
 *   0 = no findings (or all below severity threshold)
 *   1 = findings at/above threshold (CI-friendly)
 *   2 = scan failed
 */
async function runScan(args: CliArgs, rawArgv: string[]): Promise<number> {
  const { writeFileSync } = await import("node:fs");
  const { resolve: resolvePath } = await import("node:path");

  // Lazy import compiled scanner — keeps cold start fast for `init` flow.
  let scan: typeof import("./agentshield/scanner.js").scan;
  let toSarif: typeof import("./agentshield/sarif.js").toSarif;
  try {
    ({ scan } = await import("./agentshield/scanner.js"));
    ({ toSarif } = await import("./agentshield/sarif.js"));
  } catch (e) {
    error(`scan: failed to load scanner: ${(e as Error).message}`);
    return 2;
  }

  // Parse scan-specific flags from raw argv
  const flag = (n: string) => rawArgv.includes(`--${n}`);
  const value = (n: string, def?: string) => {
    const i = rawArgv.indexOf(`--${n}`);
    return i >= 0 && i < rawArgv.length - 1 ? rawArgv[i + 1] : def;
  };

  const scanners = rawArgv
    .map((a, i) => (a === "--scanner" ? rawArgv[i + 1] : null))
    .filter(Boolean) as string[];
  const exclude = rawArgv
    .map((a, i) => (a === "--exclude" ? rawArgv[i + 1] : null))
    .filter(Boolean) as string[];

  // Path: first non-flag arg after `scan`, default cwd
  const scanIdx = rawArgv.indexOf("scan");
  let root = ".";
  for (let i = scanIdx + 1; i < rawArgv.length; i++) {
    if (rawArgv[i] && !rawArgv[i]!.startsWith("--")) { root = rawArgv[i]!; break; }
  }

  const opts = {
    scanners: scanners.length > 0 ? (scanners as any) : undefined,
    minSeverity: value("severity", "info") as any,
    exclude: exclude.length > 0 ? exclude : undefined,
    maxFindings: value("max") ? parseInt(value("max")!, 10) : undefined,
  };

  const sarifPath = value("sarif");
  const wantsJson = flag("json");
  const quiet = flag("quiet");

  const report = scan(resolvePath(root), opts as any);

  if (sarifPath) {
    writeFileSync(sarifPath, JSON.stringify(toSarif(report), null, 2));
    if (!quiet) console.error(`✓ SARIF written → ${sarifPath}`);
  }

  if (wantsJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!quiet) {
    const COLORS: Record<string, string> = {
      critical: "\x1b[1;31m", high: "\x1b[31m", medium: "\x1b[33m",
      low: "\x1b[36m", info: "\x1b[2m", reset: "\x1b[0m",
    };
    const useColor = process.stdout.isTTY;
    const c = (sev: string, s: string) => (useColor ? `${COLORS[sev] || ""}${s}${COLORS.reset}` : s);

    console.error(`\ngreat-cto scan ${getCliVersion()} — scanned ${report.filesScanned} file(s) in ${report.durationMs}ms\n`);
    if (report.errors.length > 0) {
      console.error(`\x1b[33m⚠ ${report.errors.length} error(s):\x1b[0m`);
      for (const e of report.errors) console.error(`    ${e}`);
      console.error("");
    }
    if (report.findings.length === 0) {
      console.error("\x1b[32m✓ No findings.\x1b[0m\n");
    } else {
      for (const f of report.findings) {
        const tag = c(f.rule.severity, `[${f.rule.severity.toUpperCase()}]`);
        console.error(`${tag} ${f.rule.id}  ${f.location.file}:${f.location.line}`);
        console.error(`        ${f.rule.title}`);
        console.error(`        ${c("info", f.location.snippet)}`);
        if (f.rule.owasp) console.error(`        ${c("info", f.rule.owasp)}`);
        console.error("");
      }
      const counts: Record<string, number> = {};
      for (const f of report.findings) counts[f.rule.severity] = (counts[f.rule.severity] || 0) + 1;
      const order = ["critical", "high", "medium", "low", "info"];
      const parts = order.filter((s) => counts[s]).map((s) => c(s, `${counts[s]} ${s}`));
      console.error(`\x1b[1m${report.findings.length} finding(s)\x1b[0m  —  ${parts.join(", ")}\n`);
    }
  }

  return report.findings.length > 0 ? 1 : 0;
}

/**
 * `great-cto list-rules` — print the rule catalog.
 */
async function runListRules(): Promise<number> {
  let loadRules: typeof import("./agentshield/rules-loader.js").loadRules;
  try {
    ({ loadRules } = await import("./agentshield/rules-loader.js"));
  } catch (e) {
    error(`list-rules: failed: ${(e as Error).message}`);
    return 2;
  }
  const rules = loadRules();
  for (const r of rules) {
    console.log(`${r.id.padEnd(8)} ${r.severity.padEnd(8)} ${r.scanner.padEnd(20)} ${r.title}`);
  }
  console.log(`\n${rules.length} rule(s) loaded.`);
  return 0;
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

async function runBoard(args: CliArgs): Promise<number> {
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { existsSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");

  // Find board server: relative to this file (dist/) → packages/board/server.mjs
  const { homedir } = await import("node:os");
  const { readdirSync } = await import("node:fs");
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [
    join(here, "..", "..", "board", "server.mjs"),           // from packages/cli/dist (dev)
    join(here, "..", "board", "server.mjs"),                  // alt dev layout
    join(here, "board", "server.mjs"),                        // flat layout
  ];
  // Also search plugin cache (installed via npx great-cto)
  const pluginBase = join(homedir(), ".claude", "plugins", "cache", "local", "great_cto");
  if (existsSync(pluginBase)) {
    try {
      const versions = readdirSync(pluginBase).filter(v => /^\d/.test(v)).sort().reverse();
      for (const v of versions.slice(0, 5)) {
        candidates.push(join(pluginBase, v, "packages", "board", "server.mjs"));
      }
    } catch { /* ignore */ }
  }
  const serverPath = candidates.find(existsSync);
  if (!serverPath) {
    error("Board server not found. Try reinstalling: npx great-cto@latest");
    return 1;
  }

  const nodeArgs = [serverPath];
  if (args.boardNoOpen) nodeArgs.push("--no-open");

  const child = spawn(process.execPath, nodeArgs, {
    env: { ...process.env, BOARD_PORT: String(args.boardPort) },
    stdio: "inherit",
    detached: false,
  });
  child.on("exit", code => process.exit(code ?? 0));
  return 0;
}

function printHelp(): void {
  log(`${bold("great-cto")} — one-command install for the great_cto Claude Code plugin

${bold("Usage:")}
  npx great-cto [init] [options]
  npx great-cto board [--port 3141] [--no-open]
  npx great-cto register [--dir PATH]
  npx great-cto scan [path] [--severity LVL] [--scanner NAME] [--sarif FILE]
  npx great-cto list-rules
  npx great-cto ci [path] [--fail-on LVL] [--sarif F] [--junit F]
  npx great-cto mcp [--sse --port N]
  npx great-cto adapt --platform [claude|codex|cursor|aider|continue|all]
  npx great-cto serve [--port 3142]
  npx great-cto help
  npx great-cto version

${bold("Board:")}
  great-cto board              Open Kanban + CTO Dashboard at localhost:3141
  great-cto board --port 4000  Use a different port
  great-cto board --no-open    Start server without opening browser

${bold("Register:")}
  great-cto register           Add this repo to ~/.great_cto/projects.json
                               (auto-discovered after /audit or /start, but
                                run this if the project doesn't appear in board)

${bold("Scan (AI-security):")}
  great-cto scan                       AI-specific scan of cwd (OWASP LLM Top 10)
  great-cto scan ./src --severity high Filter by minimum severity
  great-cto scan --scanner ssrf-in-tools  Run only one scanner
  great-cto scan --sarif out.sarif     Emit SARIF for GitHub Code Scanning
  great-cto scan --json                JSON output for CI pipelines
  great-cto list-rules                 Print rule catalog
  ${dim("(exits 1 if findings ≥ severity threshold; CI-friendly)")}

${bold("CI gate:")}
  great-cto ci                         Single-command CI gate (scan + archetype check)
  great-cto ci --fail-on critical      Exit 1 only on critical findings (default)
  great-cto ci --sarif out.sarif       Emit SARIF (uploadable to GitHub Security)
  great-cto ci --junit out.xml         Emit JUnit XML for test reporters
  ${dim("(auto-detects \$GITHUB_ACTIONS → emits ::error:: annotations)")}

${bold("MCP server (cross-platform):")}
  great-cto mcp                        Stdio MCP server — works in Claude Desktop /
                                       Cursor / Continue / any MCP host
  great-cto mcp --sse --port 8765      SSE mode for remote / multi-client (TODO v2.5)
  ${dim("Tools exposed: scan, list_rules, detect_archetype, estimate_cost, query_decisions")}

${bold("Platform adapter (multi-tool support):")}
  great-cto adapt --platform claude    Generate AGENTS.md + CLAUDE.md
  great-cto adapt --platform codex     Generate AGENTS.md (OpenAI Codex CLI)
  great-cto adapt --platform cursor    Generate .cursorrules + .cursor/rules/*.mdc
  great-cto adapt --platform aider     Generate .aider.conf.yml + CONVENTIONS.md
  great-cto adapt --platform continue  Generate .continue/rules.md
  great-cto adapt --platform all       All of the above
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

async function runInit(args: CliArgs): Promise<number> {
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

  log(`  ${dim("archetype:")} ${cyan(archetype)} ${dim(`(confidence: ${confidence})`)}`);
  log(`  ${dim("rationale:")} ${rationale}`);
  if (alternatives.length > 0) {
    log(`  ${dim("alternatives:")} ${alternatives.join(", ")}`);
  }
  log(`  ${dim("suggested compliance:")} ${compliance.length > 0 ? compliance.join(", ") : "none"}`);

  // v1.0.144+: ask user to confirm archetype if confidence is low
  // OR if alternatives are present and not user-specified
  if (!args.yes && !args.archetype && (confidence === "low" || (confidence === "medium" && alternatives.length >= 2))) {
    log("");
    log(`${bold("⚠ Archetype detection confidence:")} ${cyan(confidence)}`);
    log(`  Top candidate: ${cyan(archetype)} — ${dim(rationale)}`);
    if (alternatives.length > 0) {
      log(`  Alternatives:  ${alternatives.map(a => cyan(a)).join(", ")}`);
    }
    log(`  ${dim("If wrong, override with: --archetype " + (alternatives[0] ?? "<name>"))}`);
    log(`  ${dim("Or edit .great_cto/PROJECT.md after install — agents read 'archetype:' field.")}`);
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

async function main(): Promise<void> {
  const rawArgv = process.argv.slice(2);
  const args = parseArgs(rawArgv);

  if (args.command === "help") {
    printHelp();
    process.exit(0);
  }
  if (args.command === "unknown") {
    const tok = (args as CliArgs).unknownToken ?? "<arg>";
    error(`great-cto: unknown command or flag '${tok}'`);
    log("");
    log(`Run ${cyan("great-cto --help")} for usage.`);
    process.exit(2);
  }
  if (args.command === "scan") {
    try {
      const code = await runScan(args, rawArgv);
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "list-rules") {
    try {
      const code = await runListRules();
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "board") {
    try {
      const code = await runBoard(args);
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(1);
    }
  }
  if (args.command === "register") {
    try {
      const code = await runRegister(args);
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(1);
    }
  }
  if (args.command === "ci") {
    try {
      const { runCi, parseCiArgs } = await import("./ci.js");
      const code = await runCi(parseCiArgs(rawArgv));
      process.exit(code);
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
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "adapt") {
    try {
      const { runAdapt } = await import("./adapt.js");
      const platArg = rawArgv.indexOf("--platform");
      const platform = (platArg >= 0 ? rawArgv[platArg + 1] : "all") as any;
      const valid = ["claude", "codex", "cursor", "aider", "continue", "all"];
      if (!valid.includes(platform)) {
        error(`adapt: --platform must be one of ${valid.join(", ")} (got: ${platform})`);
        process.exit(2);
      }
      const code = await runAdapt({
        platform,
        dryRun: rawArgv.includes("--dry-run"),
        cwd: args.dir,
      });
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(2);
    }
  }
  if (args.command === "serve") {
    try {
      const { runServe } = await import("./serve.js");
      const code = await runServe({
        port: args.boardPort === 3141 ? 3142 : args.boardPort,
        noLog: rawArgv.includes("--no-log"),
        insecure: rawArgv.includes("--insecure"),
      });
      process.exit(code);
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
      process.exit(code);
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
    log(`  ${cyan("init")} · ${cyan("scan")} · ${cyan("list-rules")} · ${cyan("ci")} · ${cyan("mcp")} ·`);
    log(`  ${cyan("adapt")} · ${cyan("serve")} · ${cyan("webhook")} · ${cyan("report")} · ${cyan("board")} · ${cyan("register")}`);
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
      process.exit(code);
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
    process.exit(code);
  } catch (e) {
    error((e as Error).message);
    process.exit(1);
  }
}

await main();
