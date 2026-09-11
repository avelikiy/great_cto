#!/usr/bin/env node
/**
 * prune-versions — which cached plugin versions `install-local --prune` may
 * delete.
 *
 * It deleted every version but the one just installed. An open Claude Code
 * session keeps running hooks from the version it started on — its
 * CLAUDE_PLUGIN_ROOT names that directory — so "other versions" included ones in
 * use. On 2026-09-11 six sessions pointed at the deleted 3.28.4, and the next
 * SessionStart in one of them wiped every managed agent and command.
 *
 * A version a live process names is kept. When the live processes cannot be
 * read, nothing is removed: not knowing who runs a directory is not permission
 * to delete it.
 *
 * CLI: node prune-versions.mjs --cache-root <dir> --keep <dir>
 *   stdout: one directory to remove per line; stderr: what was kept, and why.
 */
import { readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const norm = (p) => String(p).replace(/\/+$/, '');

/** Plugin roots named in process environments (`ps eww` output), each once. */
export function liveRootsFromPs(text) {
  const out = [];
  // The value runs to the next NAME= token or the end of the line, not to the next
  // space: `~/Library/Application Support/...` is one path, and a root cut at the
  // space would never match its version directory — which would then be deleted.
  for (const m of String(text ?? '').matchAll(/CLAUDE_PLUGIN_ROOT=(.+?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\s*$)/gm)) {
    const root = norm(m[1]);
    if (!out.includes(root)) out.push(root);
  }
  return out;
}

/**
 * @param {{versionDirs:string[], keep:string, liveRoots:string[]|null}} a
 * @returns {{remove:string[], kept:{dir:string, why:string}[], why:string}}
 */
export function pruneVersionsPlan({ versionDirs, keep, liveRoots }) {
  const k = norm(keep);
  const others = versionDirs.map(norm).filter((d) => d !== k);
  if (liveRoots == null) {
    return { remove: [], kept: others.map((dir) => ({ dir, why: 'open sessions could not be read' })),
      why: 'could not read which versions open sessions run from — removed nothing' };
  }
  const live = new Set(liveRoots.map(norm));
  const remove = []; const kept = [];
  for (const d of others) {
    if (live.has(d)) kept.push({ dir: d, why: 'a live session runs hooks from it' });
    else remove.push(d);
  }
  return { remove, kept, why: '' };
}

function readLiveRoots() {
  try {
    return liveRootsFromPs(execFileSync('ps', ['eww', '-A', '-o', 'command='],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return null; }
}

const invokedDirectly = (() => {
  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]); }
  catch { return false; }
})();

if (invokedDirectly) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const root = arg('--cache-root');
  const keep = arg('--keep');
  if (!root || !keep) { process.stderr.write('usage: prune-versions.mjs --cache-root <dir> --keep <dir>\n'); process.exit(2); }
  let versionDirs = [];
  try {
    versionDirs = readdirSync(root).map((f) => join(root, f))
      .filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } });
  } catch { process.exit(0); }
  const plan = pruneVersionsPlan({ versionDirs, keep, liveRoots: readLiveRoots() });
  if (plan.why) process.stderr.write(`  · ${plan.why}\n`);
  for (const k of plan.kept) process.stderr.write(`  · kept ${k.dir} — ${k.why}\n`);
  for (const d of plan.remove) process.stdout.write(`${d}\n`);
}
