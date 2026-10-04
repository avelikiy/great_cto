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
 * CLI: node prune-versions.mjs --cache-root <dir> --keep <dir> [--keep-newest N]
 *   --keep-newest keeps the N newest versions as well (by version, not name order);
 *   SessionStart's cache cleanup uses 3.
 *   stdout: one directory to remove per line; stderr: what was kept, and why.
 */
import { readdirSync, lstatSync, realpathSync, rmSync, mkdirSync, rmdirSync } from 'node:fs';
import { join, dirname, basename, isAbsolute, resolve } from 'node:path';
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

/** "3.10.0" after "3.9.0": compare dotted numbers, not strings. */
const versionKey = (dir) => (norm(dir).split('/').pop() || '').split('.').map((n) => Number.parseInt(n, 10) || 0);
const byVersionDesc = (a, b) => {
  const x = versionKey(a); const y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};

/**
 * @param {{versionDirs:string[], keep:string, liveRoots:string[]|null, keepNewest?:number}} a
 * @returns {{remove:string[], kept:{dir:string, why:string}[], why:string}}
 */
export function pruneVersionsPlan({ versionDirs, keep, liveRoots, keepNewest = 0 }) {
  const k = norm(keep);
  const others = versionDirs.map(norm).filter((d) => d !== k);
  if (liveRoots == null) {
    return { remove: [], kept: others.map((dir) => ({ dir, why: 'open sessions could not be read' })),
      why: 'could not read which versions open sessions run from — removed nothing' };
  }
  const live = new Set(liveRoots.map(norm));
  const newest = new Set([...versionDirs.map(norm)].sort(byVersionDesc).slice(0, Math.max(0, keepNewest)));
  const remove = []; const kept = [];
  for (const d of others) {
    if (live.has(d)) kept.push({ dir: d, why: 'a live session runs hooks from it' });
    else if (newest.has(d)) kept.push({ dir: d, why: `one of the newest ${keepNewest}` });
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

export function applyPrunePlan({ root, keep, remove }) {
  if (!isAbsolute(root) || lstatSync(root).isSymbolicLink()) throw new Error('unsafe prune root');
  const canonical = realpathSync(root);
  const current = realpathSync(keep);
  if (dirname(current) !== canonical || lstatSync(keep).isSymbolicLink()) throw new Error('unsafe kept version');
  const lock = join(canonical, '.local-install-lock');
  mkdirSync(lock, { mode: 0o700 });
  try {
    // Validate ALL paths before the first removal, not just a lexical prefix.
    const targets = remove.map(dir => {
      if (!isAbsolute(dir) || dirname(resolve(dir)) !== resolve(root)
        || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:[-+][0-9A-Za-z.+-]+)?$/.test(basename(dir))) {
        throw new Error('prune target is not a direct version child');
      }
      const stat = lstatSync(dir);
      const actual = realpathSync(dir);
      if (stat.isSymbolicLink() || !stat.isDirectory() || dirname(actual) !== canonical || actual === current) {
        throw new Error('unsafe prune target');
      }
      return actual;
    });
    for (const target of targets) rmSync(target, { recursive: true, force: false });
    return targets.length;
  } finally { rmdirSync(lock); }
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
    if (!isAbsolute(root) || lstatSync(root).isSymbolicLink()) throw new Error('unsafe cache root');
    versionDirs = readdirSync(root).map((f) => join(root, f))
      .filter((p) => { try { const s = lstatSync(p); return !s.isSymbolicLink() && s.isDirectory() && !basename(p).startsWith('.'); } catch { return false; } });
  } catch (error) { process.stderr.write(`prune refused: ${error.message}\n`); process.exit(1); }
  const keepNewest = Number.parseInt(arg('--keep-newest') || '0', 10) || 0;
  const plan = pruneVersionsPlan({ versionDirs, keep, liveRoots: readLiveRoots(), keepNewest });
  if (plan.why) process.stderr.write(`  · ${plan.why}\n`);
  for (const k of plan.kept) process.stderr.write(`  · kept ${k.dir} — ${k.why}\n`);
  if (process.argv.includes('--apply')) {
    try { process.stdout.write(`pruned ${applyPrunePlan({ root, keep, remove: plan.remove })} version(s)\n`); }
    catch (error) { process.stderr.write(`prune refused: ${error.message}\n`); process.exit(1); }
  } else for (const d of plan.remove) process.stdout.write(`${d}\n`);
}
