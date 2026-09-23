/**
 * contract-path — which pipeline contract a hook reads: the plugin's, or a
 * project's deliberate override.
 *
 * SessionStart used to copy the plugin's `shared/pipeline.toml` and
 * `shared/orchestrator.toml` into every project, every session. So every
 * release showed up as a diff in every project, and nothing a project wrote there
 * survived the next session — the "override" the readers honoured could not exist.
 *
 * The copy is gone. A project file counts only when it says so: its first lines
 * carry `great_cto: project override`. An unmarked file is a copy left by the old
 * SessionStart and is ignored — honouring it would freeze that project on the
 * contract of whatever version last copied it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './project-root.mjs';

export const OVERRIDE_MARK = 'great_cto: project override';
export const PLUGIN_SHARED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared');

export function isOverride(text) {
  return String(text || '').split('\n').slice(0, 5).some((l) => l.includes(OVERRIDE_MARK));
}

/** Absolute path of the contract `name` (e.g. 'pipeline.toml') to read. */
export function contractPath(name, { cwd = process.cwd(), pluginShared = PLUGIN_SHARED } = {}) {
  const local = join(projectRoot(cwd), 'shared', name);
  if (existsSync(local)) {
    try { if (isOverride(readFileSync(local, 'utf8'))) return local; } catch { /* unreadable: use the plugin's */ }
  }
  return join(pluginShared, name);
}
