// `great-cto leash <subcommand>` — install, start, status, kill, update.
//
// Distribution model: we track llm-leash by *git repository* (not PyPI) so
// every push to https://github.com/avelikiy/llm-leash main is one
// `great-cto leash update` away. The repo is cloned to ~/.great_cto/llm-leash
// and installed as editable (`pip install -e .`). Updates run `git pull` +
// `pip install -e . --upgrade`.
//
// Three sources of truth:
//   1. Installed SHA   = git rev-parse HEAD in ~/.great_cto/llm-leash
//   2. Latest SHA      = GitHub commits API
//   3. Pinned SHA      = .great_cto/leash.json → "pinned_sha" (optional)
//
// If pinned_sha is set, update() refuses to bump past it without --force.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log, success, warn, error, cyan, dim, bold } from "./ui.js";

const REPO_URL = "https://github.com/avelikiy/llm-leash.git";
const REPO_API = "https://api.github.com/repos/avelikiy/llm-leash";
const INSTALL_ROOT = join(homedir(), ".great_cto", "llm-leash");
const CONFIG_PATH = join(homedir(), ".great_cto", "leash.json");

interface LeashConfig {
  enabled?: boolean;
  install_root?: string;
  pinned_sha?: string;
  audit_path?: string;
  proxy_url?: string;
  daily_cap_usd?: number;
  monthly_cap_usd?: number;
}

export interface LeashSubcommandResult {
  exitCode: number;
}

// ── public API ────────────────────────────────────────────────────────────────

export async function runLeash(argv: string[]): Promise<LeashSubcommandResult> {
  const sub = argv[0];
  switch (sub) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return { exitCode: 0 };
    case "install":
      return install();
    case "update":
      return update(argv.includes("--force"));
    case "status":
      return status();
    case "start":
      return startProxy(argv.slice(1));
    case "kill":
      return killAll();
    case "uninstall":
      return uninstall();
    case "wire":
      return wire(argv.includes("--unwire"));
    default:
      error(`great-cto leash: unknown subcommand '${sub}'`);
      printHelp();
      return { exitCode: 2 };
  }
}

// ── subcommands ───────────────────────────────────────────────────────────────

function printHelp() {
  log(bold("great-cto leash") + " — runtime governance for LLM agents (https://github.com/avelikiy/llm-leash)");
  log("");
  log("  " + cyan("install") + "       clone the repo, install as editable, write default config");
  log("  " + cyan("update") + "        git pull + reinstall (auto-pulls latest commits from main)");
  log("  " + cyan("status") + "        installed version vs GitHub latest, last audit-log entry");
  log("  " + cyan("start") + "         start the HTTP proxy on :8765 (env-var deployment)");
  log("  " + cyan("kill") + "          fire kill switch — stops all in-flight LLM calls (<300 ms)");
  log("  " + cyan("wire") + "          install Python sitecustomize + Node --require wrappers");
  log("  " + dim("              ") + "so anthropic/openai SDK clients auto-send tenant + session headers");
  log("  " + cyan("uninstall") + "     remove ~/.great_cto/llm-leash (config left intact)");
  log("");
  log(dim("  Config: " + CONFIG_PATH));
  log(dim("  Install dir: " + INSTALL_ROOT));
}

function install(): LeashSubcommandResult {
  if (!hasGit()) {
    error("git is required. Install git first: https://git-scm.com/downloads");
    return { exitCode: 1 };
  }
  if (!hasPython()) {
    error("python3 is required. Install Python 3.10+ first: https://www.python.org/downloads/");
    return { exitCode: 1 };
  }

  mkdirSync(join(homedir(), ".great_cto"), { recursive: true });

  if (existsSync(INSTALL_ROOT)) {
    warn(`llm-leash already cloned at ${INSTALL_ROOT}.`);
    log(`  Run ${cyan("great-cto leash update")} to pull latest.`);
    return { exitCode: 0 };
  }

  log(dim(`  cloning ${REPO_URL} → ${INSTALL_ROOT}`));
  const cloneResult = spawnSync("git", ["clone", REPO_URL, INSTALL_ROOT], {
    stdio: ["ignore", "pipe", "pipe"], timeout: 120_000,
  });
  if (cloneResult.status !== 0) {
    error(`git clone failed: ${cloneResult.stderr?.toString() || "unknown"}`);
    return { exitCode: 1 };
  }

  log(dim(`  pip install -e .`));
  const pipResult = spawnSync(pythonCmd(), ["-m", "pip", "install", "-e", INSTALL_ROOT, "--quiet"], {
    stdio: ["ignore", "pipe", "pipe"], timeout: 240_000,
  });
  if (pipResult.status !== 0) {
    warn("pip install reported errors — leash CLI may not be on PATH yet:");
    warn(pipResult.stderr?.toString() || "");
    log(`  Try: ${cyan(`${pythonCmd()} -m pip install -e ${INSTALL_ROOT}`)}`);
  }

  // Default config (only if absent — never clobber user changes)
  if (!existsSync(CONFIG_PATH)) {
    const defaults: LeashConfig = {
      enabled: true,
      install_root: INSTALL_ROOT,
      audit_path: join(homedir(), ".leash", "audit.jsonl"),
      proxy_url: "http://localhost:8765",
      daily_cap_usd: 50,
      monthly_cap_usd: 500,
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    success(`wrote ${CONFIG_PATH}`);
  }

  const sha = getInstalledSha();
  success(`llm-leash installed at ${INSTALL_ROOT}${sha ? ` (HEAD: ${sha})` : ""}`);
  log("");
  log("Next: " + cyan("great-cto leash status") + " — verify proxy reachable");
  log("      " + cyan("great-cto leash start") + " — start HTTP proxy on :8765");
  return { exitCode: 0 };
}

function update(force: boolean): LeashSubcommandResult {
  if (!existsSync(INSTALL_ROOT)) {
    warn("llm-leash not installed. Run `great-cto leash install` first.");
    return { exitCode: 1 };
  }

  const cfg = readConfig();
  const beforeSha = getInstalledSha();

  if (cfg.pinned_sha && !force) {
    log(dim(`  pinned to ${cfg.pinned_sha} in ${CONFIG_PATH} — checkout pinned commit`));
    const co = spawnSync("git", ["-C", INSTALL_ROOT, "fetch", "--quiet"], { stdio: "ignore", timeout: 60_000 });
    if (co.status !== 0) { error("git fetch failed"); return { exitCode: 1 }; }
    const reset = spawnSync("git", ["-C", INSTALL_ROOT, "reset", "--hard", cfg.pinned_sha], {
      stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
    });
    if (reset.status !== 0) {
      error(`reset to pinned ${cfg.pinned_sha} failed: ${reset.stderr?.toString()}`);
      return { exitCode: 1 };
    }
  } else {
    log(dim(`  git pull origin main`));
    const pull = spawnSync("git", ["-C", INSTALL_ROOT, "pull", "--ff-only", "origin", "main"], {
      stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
    });
    if (pull.status !== 0) {
      error(`git pull failed: ${pull.stderr?.toString()}`);
      log(`  Try: ${cyan(`cd ${INSTALL_ROOT} && git status`)}`);
      return { exitCode: 1 };
    }
  }

  const afterSha = getInstalledSha();
  if (beforeSha === afterSha) {
    log(dim(`  already at latest (${afterSha})`));
    return { exitCode: 0 };
  }

  log(dim(`  pip install -e . --upgrade`));
  const pip = spawnSync(pythonCmd(), ["-m", "pip", "install", "-e", INSTALL_ROOT, "--upgrade", "--quiet"], {
    stdio: ["ignore", "pipe", "pipe"], timeout: 240_000,
  });
  if (pip.status !== 0) {
    warn("pip reinstall reported errors:");
    warn(pip.stderr?.toString() || "");
  }

  success(`llm-leash: ${beforeSha} → ${afterSha}`);

  // Persist last-known SHA for the version-check hook
  if (afterSha) writeVersionCache(afterSha);
  return { exitCode: 0 };
}

async function status(): Promise<LeashSubcommandResult> {
  const installed = existsSync(INSTALL_ROOT);
  if (!installed) {
    log(bold("llm-leash:") + " " + dim("not installed"));
    log(`  Install: ${cyan("great-cto leash install")}`);
    return { exitCode: 0 };
  }
  const cfg = readConfig();
  const head = getInstalledSha() || "?";
  const latest = await fetchLatestSha();

  log(bold("llm-leash:") + " installed at " + dim(INSTALL_ROOT));
  log(`  Installed HEAD : ${head}`);
  log(`  GitHub latest  : ${latest || dim("unknown (network?)")}`);
  log(`  Config         : ${CONFIG_PATH}`);
  log(`  Audit log      : ${cfg.audit_path || dim("default")}`);
  log(`  Daily cap      : ${cfg.daily_cap_usd ? "$" + cfg.daily_cap_usd : dim("not set")}`);
  log(`  Pinned SHA     : ${cfg.pinned_sha || dim("none — track main")}`);

  if (latest && latest !== head) {
    log("");
    warn(`Update available. Run ${cyan("great-cto leash update")} to bump.`);
  }
  return { exitCode: 0 };
}

function startProxy(extraArgs: string[]): LeashSubcommandResult {
  if (!existsSync(INSTALL_ROOT)) {
    warn("llm-leash not installed. Run `great-cto leash install` first.");
    return { exitCode: 1 };
  }
  log(`Starting llm-leash proxy on http://localhost:8765 …`);
  log(dim(`  set ANTHROPIC_BASE_URL=http://localhost:8765 to route via leash`));
  const r = spawnSync(pythonCmd(), ["-m", "leash.proxy", ...extraArgs], {
    stdio: "inherit",
  });
  return { exitCode: r.status ?? 0 };
}

function killAll(): LeashSubcommandResult {
  const r = spawnSync("leash", ["kill", "--all", "--reason", "cli"], {
    stdio: ["ignore", "pipe", "pipe"], timeout: 5000,
  });
  if (r.status === 0) {
    success("kill switch fired");
    return { exitCode: 0 };
  }
  // Fall back to python -m
  const r2 = spawnSync(pythonCmd(), ["-m", "leash", "kill", "--all", "--reason", "cli"], {
    stdio: "inherit", timeout: 5000,
  });
  return { exitCode: r2.status ?? 1 };
}

function uninstall(): LeashSubcommandResult {
  if (!existsSync(INSTALL_ROOT)) {
    log(dim("nothing to remove"));
    return { exitCode: 0 };
  }
  const r = spawnSync("rm", ["-rf", INSTALL_ROOT], { stdio: "inherit", timeout: 30_000 });
  if (r.status === 0) success(`removed ${INSTALL_ROOT}`);
  log(dim(`config left intact at ${CONFIG_PATH}`));
  return { exitCode: r.status ?? 0 };
}

/**
 * `great-cto leash wire` — install Python sitecustomize + Node --require
 * wrappers into ~/.great_cto/leash-customize/ so every Anthropic / OpenAI
 * client constructed in any child process inherits X-LLM-Leash-Tenant-Id
 * and X-LLM-Leash-Session-Id headers automatically.
 *
 * Idempotent. Pass --unwire to remove. Leaves PROJECT.md untouched —
 * tenant_id is already in PROJECT.md after great-cto init.
 *
 * Mark file ~/.great_cto/leash-customize/.wired so SessionStart hook
 * knows it should expand .great_cto/env.sh with PYTHONSTARTUP / NODE_OPTIONS.
 */
async function wire(unwire: boolean): Promise<LeashSubcommandResult> {
  const customizeDir = join(homedir(), ".great_cto", "leash-customize");
  const markerFile = join(customizeDir, ".wired");

  if (unwire) {
    try {
      const { rmSync } = await import("node:fs");
      rmSync(customizeDir, { recursive: true, force: true });
      success("removed leash header wrappers");
      log(dim("re-source .great_cto/env.sh or open a new shell to clear PYTHONSTARTUP / NODE_OPTIONS"));
    } catch (e) {
      warn(`could not remove: ${(e as Error).message}`);
    }
    return { exitCode: 0 };
  }

  // Locate the source files inside the plugin: dist/main.js → ../../scripts/leash-customize/
  const here = dirname(fileURLToPath(import.meta.url));
  const srcDir = join(here, "..", "..", "scripts", "leash-customize");
  if (!existsSync(srcDir)) {
    error(`source dir not found: ${srcDir}`);
    log("This usually means the plugin install is incomplete. Try `great-cto install` again.");
    return { exitCode: 1 };
  }

  try {
    const { mkdirSync, copyFileSync, writeFileSync, statSync } = await import("node:fs");
    mkdirSync(join(customizeDir, "python"), { recursive: true });
    mkdirSync(join(customizeDir, "node"), { recursive: true });
    copyFileSync(
      join(srcDir, "python", "sitecustomize.py"),
      join(customizeDir, "python", "sitecustomize.py"),
    );
    copyFileSync(
      join(srcDir, "node", "leash-init.cjs"),
      join(customizeDir, "node", "leash-init.cjs"),
    );
    writeFileSync(
      markerFile,
      `wired_at=${new Date().toISOString()}\nplugin_src=${srcDir}\n`,
    );
    // sanity-check
    statSync(join(customizeDir, "python", "sitecustomize.py"));
    statSync(join(customizeDir, "node", "leash-init.cjs"));
    success(`wired leash header wrappers → ${customizeDir}`);
    log("");
    log("Next: in any project where you want auto-tagging,");
    log(`  source .great_cto/env.sh   ${dim("# sets PYTHONSTARTUP + NODE_OPTIONS + LEASH_TENANT_ID")}`);
    log("Then launch your agent — Anthropic/OpenAI clients pick up the headers automatically.");
    return { exitCode: 0 };
  } catch (e) {
    error(`wire failed: ${(e as Error).message}`);
    return { exitCode: 1 };
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function hasGit(): boolean {
  return spawnSync("git", ["--version"], { stdio: "ignore", timeout: 3000 }).status === 0;
}

function hasPython(): boolean {
  return spawnSync(pythonCmd(), ["--version"], { stdio: "ignore", timeout: 3000 }).status === 0;
}

function pythonCmd(): string {
  // Prefer python3, fall back to python
  if (spawnSync("python3", ["--version"], { stdio: "ignore", timeout: 2000 }).status === 0) return "python3";
  return "python";
}

function getInstalledSha(): string | null {
  if (!existsSync(INSTALL_ROOT)) return null;
  const r = spawnSync("git", ["-C", INSTALL_ROOT, "rev-parse", "--short", "HEAD"], {
    stdio: ["ignore", "pipe", "ignore"], timeout: 3000,
  });
  if (r.status !== 0) return null;
  return r.stdout.toString().trim();
}

async function fetchLatestSha(): Promise<string | null> {
  try {
    const res = await fetch(`${REPO_API}/commits/main`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "great-cto-leash",
      },
      // Node 20 has native AbortController + fetch; cap at 6 s.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const j: { sha?: string } = await res.json() as { sha?: string };
    return j.sha?.slice(0, 7) || null;
  } catch {
    return null;
  }
}

function readConfig(): LeashConfig {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch { /* ignore */ }
  return {};
}

function writeVersionCache(sha: string): void {
  const cache = join(homedir(), ".great_cto", "leash-version.json");
  try {
    writeFileSync(cache, JSON.stringify({
      installed_sha: sha,
      last_checked: new Date().toISOString(),
    }, null, 2));
  } catch { /* best-effort */ }
}
