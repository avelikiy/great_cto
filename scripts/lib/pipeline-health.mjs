// Could the dispatcher dispatch here?
//
// Every way the pipeline broke this week failed by SILENCE. The map was resolved
// against the project instead of the plugin, so thirteen of seventeen registered
// projects hit `return process.exit(0)` and said nothing — no dispatch, no
// verdict, no task, and nowhere to look. The budget check was wired into
// `decideNext` and never passed its arguments, so it never ran. In both cases
// the machinery reported success while being incapable of acting.
//
// `guard-parity` asks whether a guard EXECUTES. `declared-consumed` asks whether
// a declaration is CONSUMED. This asks the question underneath both:
//
//   **Given a project, would the dispatcher be ABLE to act at all?**
//
// It checks the same preconditions the hook checks, in the same order, without
// running an agent. A project that cannot chain is reported with the reason and
// what would fix it — because the failure mode being closed here is not a broken
// pipeline, it is a pipeline that is broken and silent.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The map the dispatcher would use for `cwd`, and where it came from. */
export function pipelineMapFor(cwd, { pluginMap = join(REPO, 'shared', 'pipeline.toml') } = {}) {
  const local = join(cwd, 'shared', 'pipeline.toml');
  if (existsSync(local)) return { path: local, source: 'project' };
  if (existsSync(pluginMap)) return { path: pluginMap, source: 'plugin' };
  return { path: null, source: 'none' };
}

/**
 * One project's ability to run a pipeline.
 *
 * @returns {{slug, path, state: 'ready'|'not-a-project'|'blocked', why: string, mapSource: string}}
 *   `not-a-project` is a fine and common answer — a directory with no
 *   `.great_cto/` is not ours to dispatch in, and must not be reported as a
 *   fault. `blocked` means the project IS ours and the dispatcher could not act.
 */
export function projectPipelineHealth(entry, opts = {}) {
  const base = { slug: entry.slug || '?', path: entry.path || '', mapSource: 'none' };

  if (!entry.path || !existsSync(entry.path)) {
    return { ...base, state: 'not-a-project', why: 'the directory does not exist' };
  }
  if (!existsSync(join(entry.path, '.great_cto'))) {
    return { ...base, state: 'not-a-project', why: 'no .great_cto/ — not a great_cto project' };
  }

  const map = pipelineMapFor(entry.path, opts);
  if (!map.path) {
    return {
      ...base, state: 'blocked',
      why: 'no pipeline map — not in the project and not in the plugin, so the dispatcher exits before reading a verdict',
    };
  }

  let transitions = 0;
  try {
    const text = readFileSync(map.path, 'utf8');
    transitions = (text.match(/^\[transitions\./gm) || []).length;
  } catch (e) {
    return { ...base, state: 'blocked', mapSource: map.source, why: `the map at ${map.path} could not be read: ${e.message}` };
  }
  if (transitions === 0) {
    // A map that parses to nothing is the same silence with a file behind it.
    return { ...base, state: 'blocked', mapSource: map.source, why: `the map at ${map.path} declares no transitions` };
  }

  return {
    ...base, state: 'ready', mapSource: map.source,
    why: `${transitions} transitions, map from the ${map.source}`,
  };
}

/** Every registered project, judged. */
export function auditPipelineHealth({ registry = join(os.homedir(), '.great_cto', 'projects.json'), ...opts } = {}) {
  let entries = [];
  try {
    const raw = JSON.parse(readFileSync(registry, 'utf8'));
    const list = raw.projects ?? raw;
    entries = Array.isArray(list) ? list : Object.values(list);
  } catch (e) {
    // An unreadable registry is not an empty fleet. Reporting "0 projects, all
    // healthy" from a file we could not open is the defect this module exists
    // to prevent, one level up.
    return { state: 'unreadable', why: `could not read ${registry}: ${e.message}`, rows: [] };
  }

  const rows = entries.map((e) => projectPipelineHealth(e, opts));
  const blocked = rows.filter((r) => r.state === 'blocked');
  return {
    state: blocked.length ? 'blocked' : 'ready',
    why: blocked.length
      ? `${blocked.length} of ${rows.filter((r) => r.state !== 'not-a-project').length} project(s) cannot dispatch`
      : `every registered project can dispatch`,
    rows,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/pipeline-health.mjs [--strict] [--json]

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = auditPipelineHealth();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.state === 'ready' ? 0 : 1);
  }
  const projects = r.rows.filter((x) => x.state !== 'not-a-project');
  console.log(`pipeline-health: ${r.why}`);
  for (const x of r.rows.filter((y) => y.state === 'blocked')) {
    console.log(`\n  ${x.slug}\n    ${x.why}`);
  }
  if (r.state === 'ready') {
    const bySource = projects.reduce((a, x) => ({ ...a, [x.mapSource]: (a[x.mapSource] || 0) + 1 }), {});
    console.log(`  ${projects.length} project(s): ` +
      Object.entries(bySource).map(([k, v]) => `${v} using the ${k} map`).join(', '));
  }
  // `unreadable` fails under --strict too: a check that could not look must not
  // exit like one that looked and found nothing.
  process.exit(process.argv.includes('--strict') && r.state !== 'ready' ? 1 : 0);
}
