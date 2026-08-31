/**
 * Is the session reading the plugin you are editing?
 *
 * great_cto is developed from source and LOADED from a versioned cache
 * (`~/.claude/plugins/cache/local/great_cto/<version>/`), populated by rsync via
 * `scripts/install-local.sh`. An edit to `agents/` or `shared/` therefore does
 * not change what a running session reads. Nothing said so.
 *
 * Measured after a week of contract work: installed 3.16.0 against a repo at
 * 3.18.0, and ELEVEN of 69 agents diverged — exactly the eleven edited that week.
 * Every one of those changes was invisible to the session making them. The board
 * already knew and reported `stale: "ahead"`; the console did not.
 *
 * Only meaningful when the repository IS the plugin. In another project the
 * installed plugin is the source of truth, and a warning there would be noise —
 * which is how a warning stops being read.
 *
 * Four states, because "could not compare" is not "compared and fine":
 *   not-applicable · match · ahead · unknown
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

/** What the SessionStart hook copies, plus the agents it refreshes. */
const WATCHED_DIRS = ['agents', 'shared', join('skills', 'great_cto')];

const DEFAULT_CACHE = join(os.homedir(), '.claude', 'plugins', 'cache', 'local', 'great_cto');

/** Highest version directory in the cache, or null. */
function installedDir(cacheRoot) {
  let entries;
  try { entries = readdirSync(cacheRoot); } catch { return null; }
  const versions = entries
    .filter((e) => { try { return statSync(join(cacheRoot, e)).isDirectory(); } catch { return false; } })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return versions.length ? join(cacheRoot, versions[versions.length - 1]) : null;
}

function readVersion(dir) {
  try { return JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version || null; }
  catch { return null; }
}

/** Files under `dir` that the plugin ships, relative to the root. */
function shippedFiles(root) {
  const out = [];
  const walk = (rel, depth = 0) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const next = join(rel, e.name);
      if (e.isDirectory()) walk(next, depth + 1);
      else if (/\.(md|toml)$/.test(e.name)) out.push(next);
    }
  };
  for (const d of WATCHED_DIRS) walk(d);
  return out.sort();
}

/**
 * @param {string} repoRoot
 * @param {{cacheRoot?: string, max?: number}} [opts]
 * @returns {{state:'not-applicable'|'match'|'ahead'|'unknown', repo:string|null,
 *            installed:string|null, files:string[], sentence:string}}
 */
export function installDrift(repoRoot, { cacheRoot = DEFAULT_CACHE, max = 200 } = {}) {
  const repo = readVersion(repoRoot);
  let isPlugin = false;
  try {
    isPlugin = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8')).name === 'great_cto';
  } catch { /* not the plugin */ }
  if (!isPlugin) {
    return { state: 'not-applicable', repo: null, installed: null, files: [], sentence: '' };
  }

  const dir = installedDir(cacheRoot);
  if (!dir) {
    return {
      state: 'unknown', repo, installed: null, files: [],
      sentence: 'No installed great_cto plugin found, so what this session reads could not be '
        + 'compared with this working tree. → bash scripts/install-local.sh',
    };
  }
  const installed = readVersion(dir) || dir.split('/').pop();

  // Byte comparison, not version comparison. The common case while developing is
  // editing WITHOUT bumping: a version check alone reports "match" over eleven
  // changed agents, which is the reassuring answer and the wrong one.
  const files = [];
  for (const rel of shippedFiles(repoRoot)) {
    if (files.length >= max) break;
    let a, b;
    try { a = readFileSync(join(repoRoot, rel), 'utf8'); } catch { continue; }
    try { b = readFileSync(join(dir, rel), 'utf8'); } catch { files.push(rel); continue; }
    if (a !== b) files.push(rel);
  }

  if (!files.length && installed === repo) {
    return { state: 'match', repo, installed, files: [], sentence: '' };
  }
  const n = files.length;
  const count = `${n} file${n === 1 ? ' differs' : 's differ'}`;
  // Same version, different bytes, is the ordinary case while developing: edited
  // without bumping. Printing the version twice reads as a contradiction, so that
  // case says what actually happened instead.
  const lede = installed === repo
    ? `This working tree has not been reinstalled since it was last edited (both ${repo}).`
    : `This working tree is great_cto ${repo}; the session is reading the installed plugin ${installed}.`;
  return {
    state: 'ahead', repo, installed, files,
    sentence: `${lede} ${count}, so ${n === 1 ? 'that change is' : 'those changes are'} not in `
      + 'effect here. → bash scripts/install-local.sh, then restart the session.',
  };
}
