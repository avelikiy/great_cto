/**
 * Whose state, whose agent — the two questions a hook must answer before it
 * writes anything or holds a turn.
 *
 * Hooks find "the project" by walking up from the working directory to the
 * first `.great_cto/PROJECT.md`. The home directory has one: ~/.great_cto is
 * the GLOBAL layer, read by every session of every project. So a session in a
 * repository without great_cto walked up to $HOME and treated the global layer
 * as its project — the learner did that until 3.49.1; on 07.10 the completion
 * check wrote a cut-off code-reviewer of one project into ~/.great_cto, and the
 * stall guard then told another session to resume it.
 *
 * And not every subagent is great_cto's: Explore, general-purpose, Plan and
 * other plugins' agents (`feature-dev:code-reviewer`) record no verdict and
 * were being asked for one.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function globalLayerDir(home = homedir()) {
  return resolve(home, '.great_cto');
}

/** The global layer is never a project's state directory. */
export function isGlobalLayer(dir, home = homedir()) {
  return resolve(String(dir || '.great_cto')) === globalLayerDir(home);
}

/**
 * A project's own state directory: not the global layer, and in use — set up
 * with PROJECT.md, or already holding verdicts (a project can run agents before
 * it is set up; one did, with a verdicts/ directory and no PROJECT.md).
 */
export function isProjectState(dir, home = homedir()) {
  const d = String(dir || '.great_cto');
  return !isGlobalLayer(d, home) && (existsSync(join(d, 'PROJECT.md')) || existsSync(join(d, 'verdicts')));
}

/** great_cto's agents, by name: the plugin's own agents/ directory (or GREAT_CTO_AGENTS_DIR). */
export function roster(dir = process.env.GREAT_CTO_AGENTS_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents')) {
  try { return new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))); } catch { return new Set(); }
}

/**
 * Is this subagent one of ours? `great-cto:qa-engineer` and `qa-engineer` are;
 * `feature-dev:code-reviewer` is another plugin's even though the name matches,
 * and `Explore` is Claude Code's. With no roster to compare against, a bare name
 * is given the benefit of the doubt — refusing every check is worse.
 */
export function isOurAgent(agentType, names = roster()) {
  const raw = String(agentType || '').trim();
  if (!raw) return false;
  const i = raw.lastIndexOf(':');
  const prefix = i > -1 ? raw.slice(0, i) : '';
  const name = i > -1 ? raw.slice(i + 1) : raw;
  if (prefix && !/^great[-_]cto$/.test(prefix)) return false;
  return names.size ? names.has(name) : true;
}
