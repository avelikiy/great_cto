// Atomic merge of enabledPlugins into ~/.claude/settings.json.
// Preserves all other keys. Backup-aware.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { dim, success, warn } from "./ui.js";
export function getSettingsPath() {
    return join(homedir(), ".claude", "settings.json");
}
export function enableGreatCto() {
    const path = getSettingsPath();
    const pluginKey = "great_cto@local";
    const backupPath = existsSync(path) ? `${path}.bak-${Date.now()}` : null;
    mkdirSync(dirname(path), { recursive: true });
    // Read existing
    let existing = {};
    if (existsSync(path)) {
        try {
            const raw = readFileSync(path, "utf-8");
            if (raw.trim())
                existing = JSON.parse(raw);
        }
        catch (e) {
            warn(`${path} exists but is not valid JSON — leaving it alone.`);
            warn(`Create or fix it manually and add: { "enabledPlugins": { "${pluginKey}": true } }`);
            return { settingsPath: path, enabled: false, alreadyEnabled: false, backupPath: null };
        }
        if (backupPath)
            copyFileSync(path, backupPath);
    }
    // Check if already enabled
    const currentEnabled = existing["enabledPlugins"];
    if (currentEnabled &&
        typeof currentEnabled === "object" &&
        currentEnabled[pluginKey] === true) {
        return { settingsPath: path, enabled: false, alreadyEnabled: true, backupPath: null };
    }
    // Merge
    const enabledPlugins = currentEnabled && typeof currentEnabled === "object"
        ? { ...currentEnabled }
        : {};
    enabledPlugins[pluginKey] = true;
    existing["enabledPlugins"] = enabledPlugins;
    // Atomic write: write to temp, rename
    const tmp = `${path}.tmp-${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n", "utf-8");
    renameSync(tmp, path);
    if (backupPath) {
        success(`enabled ${pluginKey} in ~/.claude/settings.json ${dim(`(backup: ${backupPath})`)}`);
    }
    else {
        success(`created ~/.claude/settings.json with ${pluginKey} enabled`);
    }
    return { settingsPath: path, enabled: true, alreadyEnabled: false, backupPath };
}
