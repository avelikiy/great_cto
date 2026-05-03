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
import { banner, bold, cyan, dim, error, green, log, step, warn, yellow, confirm } from "./ui.js";
import { detect } from "./detect.js";
import { pickArchetype, suggestCompliance } from "./archetypes.js";
import { install, findInstalledVersions } from "./installer.js";
import { enableGreatCto } from "./settings.js";
import { bootstrap } from "./bootstrap.js";
import { resolveTelemetryConsent, sendInstallPing } from "./telemetry.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
function getCliVersion() {
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        // dist/main.js → ../package.json
        const pkgPath = join(here, "..", "package.json");
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        return pkg.version || "unknown";
    }
    catch {
        return "unknown";
    }
}
function parseArgs(argv) {
    const args = {
        command: "init",
        boardPort: 3141,
        boardNoOpen: false,
        dir: process.cwd(),
        yes: false,
        dryRun: false,
        force: false,
        archetype: null,
        version: null,
        noTelemetry: false,
    };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "-h" || a === "--help")
            args.command = "help";
        else if (a === "-v" || a === "--version")
            args.command = "version";
        else if (a === "-y" || a === "--yes")
            args.yes = true;
        else if (a === "--dry-run")
            args.dryRun = true;
        else if (a === "--force")
            args.force = true;
        else if (a === "--archetype")
            args.archetype = argv[++i] ?? null;
        else if (a === "--version-tag")
            args.version = argv[++i] ?? null;
        else if (a === "--port")
            args.boardPort = parseInt(argv[++i] ?? "3141", 10);
        else if (a === "--no-open")
            args.boardNoOpen = true;
        else if (a === "--no-telemetry")
            args.noTelemetry = true;
        else if (a === "board")
            args.command = "board";
        else if (a === "register")
            args.command = "register";
        else if (a.startsWith("--dir="))
            args.dir = a.slice("--dir=".length);
        else if (a === "--dir")
            args.dir = argv[++i] ?? args.dir;
        else if (a === "init" || a === "help" || a === "version") {
            args.command = a;
        }
        else
            rest.push(a);
    }
    args.dir = resolve(args.dir);
    return args;
}
async function runRegister(args) {
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
    const get = (k) => (text.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim() || "";
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
    let reg = { projects: [] };
    if (existsSync(f)) {
        try {
            reg = JSON.parse(readFileSync(f, "utf8"));
        }
        catch { }
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
async function runBoard(args) {
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { existsSync } = await import("node:fs");
    const { spawn } = await import("node:child_process");
    // Find board server: relative to this file (dist/) → packages/board/server.mjs
    const { homedir } = await import("node:os");
    const { readdirSync } = await import("node:fs");
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, "..", "..", "board", "server.mjs"), // from packages/cli/dist (dev)
        join(here, "..", "board", "server.mjs"), // alt dev layout
        join(here, "board", "server.mjs"), // flat layout
    ];
    // Also search plugin cache (installed via npx great-cto)
    const pluginBase = join(homedir(), ".claude", "plugins", "cache", "local", "great_cto");
    if (existsSync(pluginBase)) {
        try {
            const versions = readdirSync(pluginBase).filter(v => /^\d/.test(v)).sort().reverse();
            for (const v of versions.slice(0, 5)) {
                candidates.push(join(pluginBase, v, "packages", "board", "server.mjs"));
            }
        }
        catch { /* ignore */ }
    }
    const serverPath = candidates.find(existsSync);
    if (!serverPath) {
        error("Board server not found. Try reinstalling: npx great-cto@latest");
        return 1;
    }
    const nodeArgs = [serverPath];
    if (args.boardNoOpen)
        nodeArgs.push("--no-open");
    const child = spawn(process.execPath, nodeArgs, {
        env: { ...process.env, BOARD_PORT: String(args.boardPort) },
        stdio: "inherit",
        detached: false,
    });
    child.on("exit", code => process.exit(code ?? 0));
    return 0;
}
function printHelp() {
    log(`${bold("great-cto")} — one-command install for the great_cto Claude Code plugin

${bold("Usage:")}
  npx great-cto [init] [options]
  npx great-cto board [--port 3141] [--no-open]
  npx great-cto register [--dir PATH]
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

${bold("Options:")}
  -y, --yes              Skip confirmation prompts (non-interactive)
      --dry-run          Show what would be done without doing it
      --force            Reinstall even if already present
      --archetype NAME   Override detected archetype
                         (${cyan("web-service|mobile-app|ai-system|agent-product|commerce|web3|")}
                          ${cyan("data-platform|infra|library|iot-embedded|regulated|")}
                          ${cyan("devtools|browser-extension|game")})
      --version-tag VER  Pin to specific great_cto version (default: latest)
      --dir PATH         Run against a different directory (default: cwd)
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
async function runInit(args) {
    banner();
    // ── 1. detect ────────────────────────────────────────────
    step(1, 5, `scanning ${args.dir}`);
    const detection = detect(args.dir);
    if (detection.hasExistingGreatCto) {
        warn(".great_cto/ already exists in this directory.");
        warn("If you're re-initializing, back it up first or run with --force.");
        if (!args.yes && !args.force) {
            const ok = await confirm("Continue anyway?", false);
            if (!ok) {
                log("Aborted.");
                return 1;
            }
        }
    }
    log(`  ${dim("stack:")} ${detection.stack.length > 0 ? detection.stack.join(", ") : dim("(no strong signals)")}`);
    log(`  ${dim("languages:")} ${detection.languages.join(", ") || dim("(none)")}`);
    if (detection.packageManager)
        log(`  ${dim("package manager:")} ${detection.packageManager}`);
    log(`  ${dim("tests:")} ${detection.hasTests ? green("yes") : yellow("no")}  ${dim("CI:")} ${detection.hasCI ? green("yes") : yellow("no")}`);
    // ── 2. pick archetype ────────────────────────────────────
    step(2, 5, "picking archetype");
    let archetype;
    let rationale;
    let alternatives;
    let confidence;
    if (args.archetype) {
        archetype = args.archetype;
        rationale = "overridden via --archetype";
        alternatives = [];
        confidence = "user-specified";
    }
    else {
        const pick = pickArchetype(detection);
        archetype = pick.primary;
        rationale = pick.rationale;
        alternatives = pick.alternatives;
        confidence = pick.confidence;
    }
    const compliance = suggestCompliance(detection, archetype);
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
                if (!existsSync(f))
                    continue;
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
        }
        catch { /* best-effort — don't block install */ }
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
            wf(secretsPath, "# great_cto secrets — never commit this file\n" +
                "# LLM router (optional, ~25% cost reduction on non-critical tasks):\n" +
                "# Get a key at https://openrouter.ai/keys\n" +
                "#OPENROUTER_API_KEY=sk-or-v1-...\n" +
                "\n" +
                "# Override default routing model (default: moonshotai/kimi-k2):\n" +
                "#GREAT_CTO_ROUTER_MODEL=moonshotai/kimi-k2\n", "utf-8");
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
            const semverCmp = (a, b) => {
                const pa = a.split(".").map(n => parseInt(n, 10) || 0);
                const pb = b.split(".").map(n => parseInt(n, 10) || 0);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
                    if (d !== 0)
                        return d;
                }
                return 0;
            };
            const versions = readdirSync(pluginCacheBase).sort(semverCmp).reverse();
            if (versions.length > 0) {
                const latest = versions[0];
                const discover = join(pluginCacheBase, latest, "scripts", "skill-discover.sh");
                if (existsSync(discover)) {
                    // Force refresh: unlink existing registry if it pins to a different version
                    const registryPath = join(greatCtoDir, "skills-registry.json");
                    if (existsSync(registryPath)) {
                        try {
                            const reg = JSON.parse(readFileSync(registryPath, "utf-8"));
                            if (reg.plugin_version && reg.plugin_version !== latest) {
                                unlinkSync(registryPath);
                                log(`  ${dim(`registry version mismatch (${reg.plugin_version} → ${latest}) — refreshing`)}`);
                            }
                        }
                        catch { /* malformed — let discover overwrite */ }
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
    }
    catch {
        /* best-effort — don't block install if skills bootstrap fails */
    }
    // ── 5. bootstrap ─────────────────────────────────────────
    step(5, 5, "bootstrapping .great_cto/PROJECT.md");
    const bs = bootstrap(args.dir, detection, archetype, compliance, {
        confidence,
        alternatives,
        rationale,
    });
    if (!bs.created) {
        log(`  ${dim("PROJECT.md already exists at")} ${bs.projectMdPath} ${dim("— kept as-is")}`);
    }
    // ── telemetry (opt-in, fire-and-forget) ─────────────────
    try {
        const consent = resolveTelemetryConsent(args.noTelemetry);
        // Don't await — finish CLI banner first; ping flies in background
        void sendInstallPing({
            cliVersion: getCliVersion(),
            archetype: archetype,
            consent,
        });
    }
    catch { /* never block install on telemetry */ }
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
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "help") {
        printHelp();
        process.exit(0);
    }
    if (args.command === "board") {
        try {
            const code = await runBoard(args);
            process.exit(code);
        }
        catch (e) {
            error(e.message);
            process.exit(1);
        }
    }
    if (args.command === "register") {
        try {
            const code = await runRegister(args);
            process.exit(code);
        }
        catch (e) {
            error(e.message);
            process.exit(1);
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
                    const pkg = JSON.parse(readFileSync(p, "utf-8"));
                    if (pkg.name === "great-cto" && pkg.version) {
                        log(pkg.version);
                        process.exit(0);
                    }
                }
                catch { /* keep searching */ }
            }
            log("0.0.0");
        }
        catch {
            log("0.0.0");
        }
        process.exit(0);
    }
    try {
        const code = await runInit(args);
        process.exit(code);
    }
    catch (e) {
        error(e.message);
        process.exit(1);
    }
}
await main();
