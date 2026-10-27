/** Companion metadata is discoverable; installation requires separate artifact admission. */

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
  /** Legacy result shape is retained; unadmitted installers always skip. */
  status: "installed" | "already_present" | "skipped";
  version: string;
  reason?: string;
}

/** Third-party snapshots have no publisher admission or managed recovery contract. */
export const COMPANION_ADMISSION_REQUIRED =
  "UNSUPPORTED: companion artifact admission and managed activation are not established; no files changed";

/** Refuse before network, cache inspection, settings enablement or overlay writes. */
export function installCompanionPlugin(plugin: CompanionPlugin): CompanionInstallResult {
  return { name: plugin.name, status: "skipped", version: "—", reason: COMPANION_ADMISSION_REQUIRED };
}

export function installAllCompanions(): CompanionInstallResult[] {
  return COMPANION_PLUGINS.map(installCompanionPlugin);
}
