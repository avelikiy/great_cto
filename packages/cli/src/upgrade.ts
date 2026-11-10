/** Legacy companion upgrades refuse before any unadmitted acquisition or mutation. */
import { COMPANION_PLUGINS, COMPANION_ADMISSION_REQUIRED, type CompanionPlugin } from "./companion.js";

export interface UpgradeResult {
  name: string;
  status: "upgraded" | "already_latest" | "skipped";
  fromVersion: string;
  toVersion: string;
  reason?: string;
}

/** Existing caches are operator state, not publisher admission. */
export async function upgradePlugin(plugin: CompanionPlugin): Promise<UpgradeResult> {
  return { name: plugin.name, status: "skipped", fromVersion: "—", toVersion: "—", reason: COMPANION_ADMISSION_REQUIRED };
}

export async function upgradeAll(): Promise<UpgradeResult[]> {
  return Promise.all(COMPANION_PLUGINS.map(upgradePlugin));
}
