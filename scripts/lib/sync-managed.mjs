#!/usr/bin/env node
/**
 * sync-managed — install every agent and command the plugin ships into
 * ~/.claude/agents and ~/.claude/commands, and remove only what great_cto wrote
 * and no longer ships.
 *
 * This replaces an inline SessionStart shell loop with two defects:
 *
 *   - It pruned every managed file whose source was "absent" under
 *     ${PLUGIN_DIR}, without asking whether ${PLUGIN_DIR} existed. On
 *     2026-09-11 `install-local --prune` deleted the version directory six open
 *     sessions still ran from; the next SessionStart in them found every source
 *     absent and deleted 38 of 44 commands and all 70 agents — then copied the
 *     "fresh" ones back from the directory that was gone.
 *   - Its copy half named 55 agents by hand, so the 15 added later reached
 *     ~/.claude/agents only through install-local, never through a session.
 *
 * The rules now: a source directory that is missing, unreadable or empty is no
 * reason to delete anything; every file in it is installed; a file is removed
 * only if it carries the marker and its source is gone; a file without the
 * marker that differs from the plugin's is the user's and is never overwritten.
 *
 * CLI: node sync-managed.mjs --plugin-dir <dir> [--report]
 *   Silent when both halves sync; one line per half that was skipped, and why.
 *   Always exits 0 — a session start is never blocked over this.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const MARKER = '<!-- great_cto-managed -->';

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const readOr = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

function syncOne({ src, dst, isSource, dstName, isOurs, sourceOf }) {
  const skipped = (why) => ({ state: 'skipped', why, copied: 0, pruned: 0, kept: 0 });
  if (!src || !isDir(src)) return skipped(`${src || 'the plugin directory'} is not a directory — nothing pruned, nothing copied`);
  let files;
  try { files = readdirSync(src).filter((f) => isSource(f) && isFile(join(src, f))); }
  catch { return skipped(`${src} could not be read — nothing pruned, nothing copied`); }
  if (!files.length) return skipped(`${src} ships nothing — an empty source is not a reason to delete`);

  mkdirSync(dst, { recursive: true });
  const shipped = new Set(files);
  let pruned = 0; let copied = 0; let kept = 0;

  for (const f of readdirSync(dst)) {
    if (!isOurs(f) || shipped.has(sourceOf(f))) continue;
    const text = readOr(join(dst, f));
    if (text === null || !text.includes(MARKER)) continue;   // not ours to remove
    try { unlinkSync(join(dst, f)); pruned += 1; } catch { /* left in place */ }
  }

  for (const f of files) {
    const out = join(dst, dstName(f));
    const existing = readOr(out);
    const body = readFileSync(join(src, f), 'utf8');
    // Ours: it carries the marker, or it is byte-for-byte the plugin's file. The
    // second case is real: commands/learn.md says "great_cto-managed" in prose,
    // the old shell loop's substring grep took that for the marker, and the copy
    // never got one — a strict marker test alone would freeze it as a user file.
    if (existing !== null && !existing.includes(MARKER) && existing !== body) { kept += 1; continue; }
    const next = body.includes(MARKER) ? body : `${body.endsWith('\n') ? body : `${body}\n`}${MARKER}\n`;
    if (existing !== next) writeFileSync(out, next);
    copied += 1;
  }
  return { state: 'synced', why: '', copied, pruned, kept };
}

export function syncManaged({ pluginDir, home = homedir() }) {
  const base = pluginDir ? String(pluginDir) : null;
  return {
    agents: syncOne({
      src: base && join(base, 'agents'),
      dst: join(home, '.claude', 'agents'),
      isSource: (f) => f.endsWith('.md') && !f.startsWith('_'),
      dstName: (f) => `great_cto-${f}`,
      isOurs: (f) => /^great_cto-.+\.md$/.test(f),
      sourceOf: (f) => f.slice('great_cto-'.length),
    }),
    commands: syncOne({
      src: base && join(base, 'commands'),
      dst: join(home, '.claude', 'commands'),
      isSource: (f) => f.endsWith('.md'),
      dstName: (f) => f,
      isOurs: (f) => f.endsWith('.md'),
      sourceOf: (f) => f,
    }),
  };
}

const invokedDirectly = (() => {
  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]); }
  catch { return false; }
})();

if (invokedDirectly) {
  const at = process.argv.indexOf('--plugin-dir');
  const report = process.argv.includes('--report');
  try {
    const r = syncManaged({ pluginDir: at > 0 ? process.argv[at + 1] : null });
    for (const [half, v] of Object.entries(r)) {
      if (v.state === 'skipped') process.stdout.write(`great_cto: ${half} not synced — ${v.why}\n`);
      else if (report) process.stdout.write(`${half}: ${v.copied} installed, ${v.pruned} retired, ${v.kept} user file(s) kept\n`);
    }
  } catch (e) {
    process.stdout.write(`great_cto: agents and commands not synced — ${e.message}\n`);
  }
  process.exit(0);
}
