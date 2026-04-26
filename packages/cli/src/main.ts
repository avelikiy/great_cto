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

interface CliArgs {
  command: "init" | "help" | "version";
  dir: string;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  archetype: string | null;
  version: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "init",
    dir: process.cwd(),
    yes: false,
    dryRun: false,
    force: false,
    archetype: null,
    version: null,
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
    else if (a.startsWith("--dir=")) args.dir = a.slice("--dir=".length);
    else if (a === "--dir") args.dir = argv[++i] ?? args.dir;
    else if (a === "init" || a === "help" || a === "version") {
      args.command = a as CliArgs["command"];
    } else rest.push(a);
  }

  args.dir = resolve(args.dir);
  return args;
}

function printHelp(): void {
  log(`${bold("great-cto")} — one-command install for the great_cto Claude Code plugin

${bold("Usage:")}
  npx great-cto init [options]
  npx great-cto help
  npx great-cto version

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

async function runInit(args: CliArgs): Promise<number> {
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

  const compliance = suggestCompliance(detection, archetype as never);

  log(`  ${dim("archetype:")} ${cyan(archetype)} ${dim(`(confidence: ${confidence})`)}`);
  log(`  ${dim("rationale:")} ${rationale}`);
  if (alternatives.length > 0) {
    log(`  ${dim("alternatives:")} ${alternatives.join(", ")}`);
  }
  log(`  ${dim("suggested compliance:")} ${compliance.length > 0 ? compliance.join(", ") : "none"}`);

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

  // ── 5. bootstrap ─────────────────────────────────────────
  step(5, 5, "bootstrapping .great_cto/PROJECT.md");
  const bs = bootstrap(args.dir, detection, archetype as never, compliance);
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
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help") {
    printHelp();
    process.exit(0);
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
