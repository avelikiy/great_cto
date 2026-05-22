// Atomic merge of enabledPlugins into ~/.claude/settings.json.
// Preserves all other keys. Backup-aware.

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { dim, success, warn } from "./ui.js";

export interface EnableResult {
  settingsPath: string;
  enabled: boolean;       // true if we flipped the flag
  alreadyEnabled: boolean;
  backupPath: string | null;
}

export function getSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/**
 * Enable a plugin key in ~/.claude/settings.json.
 * Idempotent — no-op if the key is already present.
 * Takes an optional backup of the existing file before writing.
 */
export function enablePlugin(pluginKey: string): EnableResult {
  const path = getSettingsPath();
  const backupPath = existsSync(path) ? `${path}.bak-${Date.now()}` : null;

  mkdirSync(dirname(path), { recursive: true });

  // Read existing
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      if (raw.trim()) existing = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      warn(`${path} exists but is not valid JSON — leaving it alone.`);
      warn(`Create or fix it manually and add: { "enabledPlugins": { "${pluginKey}": true } }`);
      return { settingsPath: path, enabled: false, alreadyEnabled: false, backupPath: null };
    }
    if (backupPath) copyFileSync(path, backupPath);
  }

  // Check if already enabled
  const currentEnabled = existing["enabledPlugins"];
  if (
    currentEnabled &&
    typeof currentEnabled === "object" &&
    (currentEnabled as Record<string, unknown>)[pluginKey] === true
  ) {
    return { settingsPath: path, enabled: false, alreadyEnabled: true, backupPath: null };
  }

  // Merge
  const enabledPlugins =
    currentEnabled && typeof currentEnabled === "object"
      ? { ...(currentEnabled as Record<string, unknown>) }
      : {};
  enabledPlugins[pluginKey] = true;
  existing["enabledPlugins"] = enabledPlugins;

  // Atomic write: write to temp, rename
  const tmp = `${path}.tmp-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  renameSync(tmp, path);

  if (backupPath) {
    success(`enabled ${pluginKey} in ~/.claude/settings.json ${dim(`(backup: ${backupPath})`)}`);
  } else {
    success(`created ~/.claude/settings.json with ${pluginKey} enabled`);
  }

  return { settingsPath: path, enabled: true, alreadyEnabled: false, backupPath };
}

/** Convenience alias — kept for backward compatibility with existing callers. */
export function enableGreatCto(): EnableResult {
  return enablePlugin("great_cto@local");
}
