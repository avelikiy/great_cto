/**
 * upgrade.ts — force re-clone companion plugins to their latest semver tag,
 * then re-apply great-cto overlays.
 *
 * `great-cto upgrade [plugin]`
 *   plugin: "superpowers" | "beads" | undefined → all
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { COMPANION_PLUGINS, type CompanionPlugin, installCompanionPlugin } from "./companion.js";
import { applyOverlays } from "./overlay.js";

export interface UpgradeResult {
  name: string;
  status: "upgraded" | "already_latest" | "skipped";
  fromVersion: string;
  toVersion: string;
  reason?: string;
}

function getPluginCacheDir(name: string): string {
  return join(homedir(), ".claude", "plugins", "cache", "local", name);
}

/** Compare two semver strings descending (highest first). */
function semverDescending(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Returns the highest installed semver version for a plugin, or null. */
function getInstalledVersion(name: string): string | null {
  const base = getPluginCacheDir(name);
  if (!existsSync(base)) return null;
  try {
    const versions = readdirSync(base)
      .filter((v) => v.trim() !== "")
      .sort(semverDescending);
    return versions.length > 0 ? versions[0]! : null;
  } catch {
    return null;
  }
}

/** Detect the highest semver tag from a remote repo without cloning. */
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
 * Force-upgrade a single companion plugin to its latest semver tag.
 * If already on the latest tag, re-applies overlays and returns `already_latest`.
 */
export async function upgradePlugin(plugin: CompanionPlugin): Promise<UpgradeResult> {
  const { name, repoUrl } = plugin;

  const currentVersion = getInstalledVersion(name);
  const latestTag = detectLatestTag(repoUrl);
  const latestVersion = latestTag ?? "main";

  // Already on latest — just re-apply overlays in case they were missing
  if (currentVersion && currentVersion === latestVersion) {
    if (name === "superpowers") {
      applyOverlays(join(getPluginCacheDir(name), currentVersion));
    }
    return { name, status: "already_latest", fromVersion: currentVersion, toVersion: latestVersion };
  }

  // Remove the old version directory before re-cloning
  if (currentVersion) {
    const oldDir = join(getPluginCacheDir(name), currentVersion);
    try {
      rmSync(oldDir, { recursive: true, force: true });
    } catch (e) {
      return {
        name,
        status: "skipped",
        fromVersion: currentVersion,
        toVersion: latestVersion,
        reason: `failed to remove old version: ${(e as Error).message}`,
      };
    }
  }

  // Re-install via companion installer (handles clone + settings enable).
  // `installCompanionPlugin` may return "already_present" if another version dir
  // exists despite the rmSync above (e.g., orphan dirs from a prior failed upgrade).
  // Treat both "installed" and "already_present" as success — the plugin is present.
  const result = installCompanionPlugin(plugin);

  if (result.status === "skipped") {
    return {
      name,
      status: "skipped",
      fromVersion: currentVersion ?? "—",
      toVersion: latestVersion,
      reason: result.reason,
    };
  }

  // "installed" | "already_present" → plugin is present; apply overlays
  if (name === "superpowers") {
    const newDir = join(getPluginCacheDir(name), result.version);
    applyOverlays(newDir);
  }

  return {
    name,
    status: "upgraded",
    fromVersion: currentVersion ?? "—",
    toVersion: result.version,
  };
}

/** Upgrade all companion plugins. Never throws — best-effort for each. */
export async function upgradeAll(): Promise<UpgradeResult[]> {
  const results: UpgradeResult[] = [];
  for (const plugin of COMPANION_PLUGINS) {
    try {
      results.push(await upgradePlugin(plugin));
    } catch (e) {
      results.push({
        name: plugin.name,
        status: "skipped",
        fromVersion: "—",
        toVersion: "—",
        reason: (e as Error).message,
      });
    }
  }
  return results;
}
