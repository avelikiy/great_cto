import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const semver = /^\d+\.\d+\.\d+$/;
const pluginKey = /^great[-_]cto@[^@]+$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** Read the registered user installation, not the newest abandoned cache.
 * This is an installation comparison, NOT proof of project-level activation.
 * Conflicting registrations, partial installs and unreadable state stay unknown.
 * No cache fallback: publishing an unregistered snapshot is not an upgrade.
 */
export function installedBoardVersion({ home = os.homedir() } = {}) {
  const unknown = reason => ({ installed: null, installedSource: 'unknown', installedReason: reason });
  const config = path.join(home, '.claude');
  let registry, enabled;
  try {
    registry = JSON.parse(fs.readFileSync(path.join(config, 'plugins', 'installed_plugins.json'), 'utf8'));
    const settings = JSON.parse(fs.readFileSync(path.join(config, 'settings.json'), 'utf8'));
    if (registry.version !== 2 || !object(registry.plugins) || !object(settings.enabledPlugins)) {
      return unknown('invalid-registry-or-settings');
    }
    enabled = settings.enabledPlugins;
  } catch { return unknown('unreadable-registry-or-settings'); }

  const candidates = [];
  for (const [key, entries] of Object.entries(registry.plugins)) {
    if (!pluginKey.test(key) || enabled[key] !== true) continue;
    if (!Array.isArray(entries)) return unknown('invalid-registration');
    // Scope-specific installations need an explicit scope resolver. Do not let
    // their presence masquerade as a machine-wide installed version.
    if (entries.some(entry => entry?.scope !== 'user')) return unknown('scoped-registration');
    if (entries.length !== 1) return unknown('ambiguous-registration');
    const entry = entries[0];
    if (!semver.test(entry.version) || typeof entry.installPath !== 'string'
      || !path.isAbsolute(entry.installPath)) return unknown('invalid-registration');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(entry.installPath, '.claude-plugin', 'plugin.json'), 'utf8'));
      if (manifest.version !== entry.version
        || !['great_cto', 'great-cto'].includes(manifest.name)
        || !fs.statSync(path.join(entry.installPath, 'packages', 'board', 'server.mjs')).isFile()) {
        return unknown('incomplete-installation');
      }
    } catch { return unknown('incomplete-installation'); }
    candidates.push(entry.version);
  }
  // Even equal versions from two enabled marketplaces do not identify which
  // registration a restart will use. Never guess a winner by version ordering.
  if (candidates.length !== 1) return unknown(candidates.length ? 'ambiguous-installation' : 'no-enabled-user-installation');
  return { installed: candidates[0], installedSource: 'claude-user-registry', installedReason: null };
}
