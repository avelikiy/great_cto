#!/usr/bin/env node
/**
 * PostToolUse hook for Edit | Write | MultiEdit.
 *
 * Regenerates docs/reference/ when a file the reference is DERIVED FROM changes.
 *
 * ci-local has a `docs-reference in sync` gate, and it works — it caught a stale
 * page twice in one session, once after editing a command and once after editing
 * an agent. The complaint was never that the gate is wrong. It is that the only
 * feedback is a red gate minutes later, on work that was finished and correct,
 * for a file the author never touched by hand. That is the shape that teaches
 * people to reach for --no-verify.
 *
 * Which files count is NOT listed here. `GROUPS` in scripts/lib/system-map.mjs is
 * what the generator actually reads, so this asks it. Hardcoding a copy would
 * mean a group added there is silently not watched here — the same
 * declared-in-one-place, enforced-in-another defect this repository keeps
 * closing. A test asserts this hook fires for every directory GROUPS names.
 *
 * Non-blocking: any failure is logged and swallowed. A generator that cannot run
 * must not stop an edit from completing — the gate still has the last word, and
 * this hook is a convenience in front of it, never a replacement for it.
 *
 * Opt-out: GREAT_CTO_DISABLE_DOCS_SYNC=1
 *
 * @see docs/HOOKS.md
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Two roots, and conflating them made this hook regenerate the wrong tree.
 *
 * PLUGIN_ROOT is where this script and the generator live. When the hook runs
 * from an installed plugin that is the CACHE — ~/.claude/plugins/cache/…/3.21.0
 * -- not the repository the author is editing. The first version used it for
 * both, so the one time it fired it rewrote docs/reference/agents.md INSIDE the
 * cache, left the repository stale, and logged "regenerated" either way. The
 * gate then failed on the file the hook was added to keep in sync.
 *
 * PROJECT_ROOT is the tree the EDITED FILE belongs to, found by walking up from
 * it to the nearest .git. That is the only thing that identifies which
 * repository this edit is in — the script's own location cannot know.
 */
const PLUGIN_ROOT = resolve(HERE, '..', '..');

function projectRootFor(filePath) {
  let dir = dirname(resolve(filePath));
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
const LOG_PATH = '.great_cto/docs-sync.log';

function log(line) {
  try {
    mkdirSync('.great_cto', { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch { /* the log is a convenience; losing it must not fail the hook */ }
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractFilePath(input) {
  try {
    const parsed = JSON.parse(input);
    return parsed.tool_input?.file_path || parsed.file_path || '';
  } catch { return ''; }
}

/**
 * Does this path feed docs/reference/?
 *
 * Asks GROUPS rather than restating it. Exported so the test can drive it with
 * every directory GROUPS names, instead of a list written twice.
 *
 * @returns {boolean}
 */
export function feedsReference(filePath, groups, root) {
  if (!filePath || !root) return false;
  const rel = relative(root, resolve(filePath));
  // Outside the repository, or escaping it — not ours.
  if (!rel || rel.startsWith('..') || rel.startsWith(sep)) return false;
  const parts = rel.split(sep);
  // Mirrors system-map's own SKIP: a generated or vendored tree is not a source.
  if (parts.some((p) => ['node_modules', 'dist', 'build', '.git', 'coverage', 'vendor'].includes(p))) return false;
  return groups.some((g) =>
    g.dirs.some((d) => rel === d || rel.startsWith(d + sep)) &&
    g.ext.some((x) => rel.endsWith(x)));
}

async function main() {
  if (process.env.GREAT_CTO_DISABLE_DOCS_SYNC === '1') return;

  const file = extractFilePath(readStdin());
  if (!file) return;

  let GROUPS;
  try {
    ({ GROUPS } = await import(join(PLUGIN_ROOT, 'scripts', 'lib', 'system-map.mjs')));
  } catch (err) {
    log(`skip ${file}: cannot read GROUPS (${err?.code || err?.message})`);
    return;
  }

  // The tree the EDIT is in, not the tree this script is in.
  const projectRoot = projectRootFor(file);
  if (!projectRoot) { log(`skip ${file}: no .git above it — cannot tell which repository this edit is in`); return; }

  if (!feedsReference(file, GROUPS, projectRoot)) return;

  // The generator is the plugin's; the tree it writes is the project's.
  const gen = join(PLUGIN_ROOT, 'scripts', 'gen-docs-reference.mjs');
  if (!existsSync(gen)) { log(`skip ${file}: generator missing at ${gen}`); return; }

  const r = spawnSync(process.execPath, [gen], { cwd: projectRoot, encoding: 'utf8', timeout: 20_000 });
  if (r.status === 0) log(`regenerated ${projectRoot}/docs/reference after ${file}`);
  else log(`FAILED after ${file}: status=${r.status}${r.signal ? ` signal=${r.signal}` : ''} ${(r.stderr || '').trim().slice(0, 200)}`);
}

// Only run when invoked as the hook, so the test can import feedsReference.
//
// Compared through realpath, because resolve() does not follow symlinks and the
// two sides can disagree about the same file: on macOS /tmp is a link to
// /private/tmp, so argv[1] arrives as /tmp/… while import.meta.url reports
// /private/tmp/…. The comparison then fails and the hook does nothing, silently
// — which is exactly how it behaves when it is working and has nothing to do.
const sameFile = (a, b) => {
  try { return realpathSync(a) === realpathSync(b); } catch { return resolve(a) === resolve(b); }
};
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((err) => { log(`unhandled: ${err?.message}`); });
}
