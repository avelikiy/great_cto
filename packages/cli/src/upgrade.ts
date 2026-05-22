/**
 * upgrade.ts — force re-clone companion plugins to their latest semver tag,
 * then re-apply great-cto overlays.
 *
 * `great-cto upgrade [plugin]`
 *   plugin: "superpowers" | "beads" | undefined → all
 */

import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { COMPANION_PLUGINS, type CompanionPlugin, installCompanionPlugin, detectLatestTag } from "./companion.js";
import { applyOverlays } from "./overlay.js";
import { semverDescending } from "./semver.js";

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

  // Remove ALL existing version directories so installCompanionPlugin's
  // isAlreadyInstalled guard always returns null and the clone proceeds fresh.
  const cacheDir = getPluginCacheDir(name);
  if (existsSync(cacheDir)) {
    try {
      const existingVersions = readdirSync(cacheDir).filter((v) => v.trim() !== "");
      for (const v of existingVersions) {
        rmSync(join(cacheDir, v), { recursive: true, force: true });
      }
    } catch (e) {
      return {
        name,
        status: "skipped",
        fromVersion: currentVersion ?? "—",
        toVersion: latestVersion,
        reason: `failed to remove old versions: ${(e as Error).message}`,
      };
    }
  }

  // Re-install via companion installer (handles clone + settings enable).
  // All version dirs were removed above, so isAlreadyInstalled returns null
  // and the clone always proceeds fresh.
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
