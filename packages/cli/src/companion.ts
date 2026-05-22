/**
 * Companion plugin installer — superpowers + beads.
 *
 * great_cto requires these two plugins to be present. This module installs
 * them automatically during `great-cto init/install` so users get a working
 * setup in one command without reading the "Requires:" line in the README.
 *
 * Install strategy:
 *   - Clone (depth=1) the latest semver tag from GitHub into
 *     ~/.claude/plugins/cache/local/<name>/<version>/
 *   - Enable <name>@local in ~/.claude/settings.json
 *   - Idempotent — skips if any version is already present in the cache dir
 *   - Best-effort — never fails the parent install; logs a human-friendly
 *     hint if git is unavailable or clone fails
 */

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dim, success, log, warn } from "./ui.js";
import { enablePlugin } from "./settings.js";

export interface CompanionPlugin {
  /** Human name shown in log output */
  name: string;
  /** Plugin key registered in ~/.claude/settings.json */
  pluginKey: string;
  /** GitHub clone URL */
  repoUrl: string;
}

export const COMPANION_PLUGINS: CompanionPlugin[] = [
  {
    name: "superpowers",
    pluginKey: "superpowers@local",
    repoUrl: "https://github.com/obra/superpowers.git",
  },
  {
    name: "beads",
    pluginKey: "beads@local",
    repoUrl: "https://github.com/steveyegge/beads.git",
  },
];

export interface CompanionInstallResult {
  name: string;
  /** 'installed' | 'already_present' | 'skipped' */
  status: "installed" | "already_present" | "skipped";
  version: string;
  reason?: string;
}

function getPluginCacheDir(name: string): string {
  return join(homedir(), ".claude", "plugins", "cache", "local", name);
}

/** Returns true if any version folder already exists in the cache dir. */
function isAlreadyInstalled(name: string): string | null {
  const base = getPluginCacheDir(name);
  if (!existsSync(base)) return null;
  try {
    const versions = readdirSync(base).filter((v) => /\S/.test(v));
    return versions.length > 0 ? versions[0]! : null;
  } catch {
    return null;
  }
}

/** Detect the latest semver tag from a remote repo without cloning. */
function detectLatestTag(repoUrl: string): string | null {
  try {
    const out = execFileSync("git", ["ls-remote", "--tags", repoUrl], {
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tags = out
      .split("\n")
      .map((line) => line.match(/refs\/tags\/v?([0-9]+\.[0-9]+\.[0-9]+)(?!\^)/)?.[1])
      .filter((t): t is string => !!t)
      .sort((a, b) => {
        const pa = a.split(".").map(Number);
        const pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          const d = (pb[i] ?? 0) - (pa[i] ?? 0);
          if (d !== 0) return d;
        }
        return 0;
      });
    return tags[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Install a single companion plugin.
 * Silent no-op if already present. Best-effort on failure.
 */
export function installCompanionPlugin(plugin: CompanionPlugin): CompanionInstallResult {
  const { name, pluginKey, repoUrl } = plugin;

  // ── already installed? ─────────────────────────────────────────────────
  const existing = isAlreadyInstalled(name);
  if (existing) {
    // Make sure it's enabled in settings even if it was manually placed
    enablePlugin(pluginKey);
    return { name, status: "already_present", version: existing };
  }

  // ── git available? ─────────────────────────────────────────────────────
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", timeout: 5_000 });
  } catch {
    const msg = `git not found — install git, then run: npx great-cto install`;
    warn(`${name}: ${msg}`);
    return { name, status: "skipped", version: "—", reason: msg };
  }

  // ── resolve version ────────────────────────────────────────────────────
  const tag = detectLatestTag(repoUrl);
  const version = tag ?? "main";
  const ref = tag ? `v${tag}` : "main";

  const destDir = join(getPluginCacheDir(name), version);
  mkdirSync(getPluginCacheDir(name), { recursive: true });

  log(dim(`  installing ${name} ${version}…`));

  // ── clone ──────────────────────────────────────────────────────────────
  const cloneArgs = tag
    ? ["clone", "--depth=1", "--branch", ref, repoUrl, destDir]
    : ["clone", "--depth=1", repoUrl, destDir];

  const result = spawnSync("git", cloneArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr?.toString() ?? "").slice(0, 200);
    const msg = `clone failed: ${stderr}`;
    warn(`${name}: ${msg}`);
    warn(`  install manually: claude plugin install github.com/${repoUrl.replace("https://github.com/", "").replace(".git", "")}`);
    return { name, status: "skipped", version: "—", reason: msg };
  }

  // ── enable in settings ─────────────────────────────────────────────────
  enablePlugin(pluginKey);
  success(`${name} ${version} installed`);

  return { name, status: "installed", version };
}

/**
 * Install all companion plugins declared in COMPANION_PLUGINS.
 * Returns a summary array. Never throws — best-effort for all.
 */
export function installAllCompanions(): CompanionInstallResult[] {
  return COMPANION_PLUGINS.map((plugin) => {
    try {
      return installCompanionPlugin(plugin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warn(`${plugin.name}: unexpected error — ${msg}`);
      return { name: plugin.name, status: "skipped" as const, version: "—", reason: msg };
    }
  });
}
