/**
 * migration — a partial migration must not look like a finished one.
 *
 * Borrowed from opencode-mem, whose SQLite→Turso upgrade backs up each shard,
 * tracks progress per shard, and writes its global `.turso-migrated` marker
 * ONLY after every shard verifies. That last clause is the whole idea, and it is
 * this repository's own three-states discipline pointed at a one-shot script:
 *
 *   done | partial | never-ran        — never just done | not-done
 *
 * WHAT GOES WRONG WITHOUT IT
 * --------------------------
 * `scripts/migrate-verdicts-to-projects.mjs` rewrote each target log with a
 * plain `writeFileSync`. Interrupt it between read and write and the project's
 * verdict history is a truncated file with no backup beside it — the same shape
 * as the `cat >` that destroyed a stored API key in `~/.great_cto/secrets.env`.
 * And it announced success only at the very end, so a run that died on the third
 * project of seven printed nothing at all: indistinguishable, to the next
 * operator, from a run that found nothing to do.
 *
 * Re-running was documented as safe. That is a claim about the happy path; after
 * a crash nobody could check it, because nothing recorded how far it got.
 *
 * WHAT THIS PROVIDES
 * ------------------
 *   backup      a timestamped copy before the first modification of a file
 *   atomic      temp file + rename, so an interrupted write cannot truncate
 *   progress    per-unit state on disk, survives a crash, makes resume possible
 *   verify      each unit is checked AFTER writing, by a caller-supplied predicate
 *   marker      written only when every unit verified — the one honest "done"
 *
 * The marker is not an optimisation. It is the answer to "has this already run",
 * and its absence must mean "not known to have finished", never "not started".
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync, unlinkSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';

/** `.<name>.migration.json` — per-unit progress, readable and hand-editable. */
export const progressPath = (root, name) => path.join(root, `.${name}.migration.json`);
/** `.<name>.migrated` — the only claim that the whole thing finished. */
export const markerPath = (root, name) => path.join(root, `.${name}.migrated`);

/** @returns {'done'|'partial'|'never'} — three states, deliberately. */
export function migrationState(root, name) {
  if (existsSync(markerPath(root, name))) return 'done';
  if (existsSync(progressPath(root, name))) return 'partial';
  return 'never';
}

export function readProgress(root, name) {
  try { return JSON.parse(readFileSync(progressPath(root, name), 'utf8')); }
  catch { return { units: {} }; }
}

/**
 * Copy a file aside before touching it, once.
 *
 * Once, because a second run must not overwrite the backup taken before the
 * FIRST modification — that is the copy holding the original content.
 *
 * @returns {string|null} the backup path, or null when there was nothing to back up
 */
export function backupOnce(file, { now = () => new Date(), suffix = 'pre-migration' } = {}) {
  if (!existsSync(file)) return null;
  const dir = path.dirname(file);
  const base = path.basename(file);
  // Any earlier backup of this file means the original is already preserved.
  let existing = null;
  try { existing = readdirSync(dir).find((f) => f.startsWith(`${base}.${suffix}-`)) || null; }
  catch { existing = null; }
  if (existing) return path.join(dir, existing);
  const stamp = now().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
  const dest = `${file}.${suffix}-${stamp}`;
  copyFileSync(file, dest);
  return dest;
}

/** Temp file then rename: an interrupted write leaves the original intact. */
export function atomicWrite(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/**
 * Run a migration over units, recording each one and marking done only at the end.
 *
 * @param {object} o
 * @param {string} o.root      where progress and marker live
 * @param {string} o.name      migration id, used in both filenames
 * @param {Array}  o.units     anything; `id(unit)` names it
 * @param {(u:any)=>string} o.id
 * @param {(u:any)=>any} o.migrate   does the work for one unit
 * @param {(u:any, r:any)=>boolean} o.verify  checked AFTER migrate, per unit
 * @param {boolean} [o.apply]  false → plan only, nothing written
 * @param {(m:string)=>void} [o.log]
 * @returns {{state:string, done:string[], failed:object[], skipped:string[], marker:string|null}}
 */
export function runMigration({
  root, name, units, id, migrate, verify, apply = false, log = () => {}, now = () => new Date(),
}) {
  const state = migrationState(root, name);
  if (state === 'done') {
    log(`${name}: already complete (${markerPath(root, name)})`);
    return { state: 'done', done: [], failed: [], skipped: units.map(id), marker: markerPath(root, name) };
  }

  const progress = readProgress(root, name);
  progress.units = progress.units || {};
  const done = [];
  const failed = [];
  const skipped = [];

  for (const unit of units) {
    const key = id(unit);
    if (progress.units[key]?.verified) { skipped.push(key); continue; }
    if (!apply) { done.push(key); continue; }

    let result;
    try { result = migrate(unit); }
    catch (e) {
      failed.push({ unit: key, why: e?.message || String(e) });
      progress.units[key] = { verified: false, error: e?.message || String(e), at: now().toISOString() };
      writeProgress(root, name, progress);
      continue;
    }

    let ok = false;
    try { ok = !!verify(unit, result); }
    catch (e) { failed.push({ unit: key, why: `verify threw: ${e?.message || e}` }); }

    progress.units[key] = { verified: ok, at: now().toISOString() };
    writeProgress(root, name, progress);
    if (ok) done.push(key);
    else if (!failed.some((f) => f.unit === key)) failed.push({ unit: key, why: 'verification returned false' });
  }

  // The marker goes down last, and only if nothing is outstanding. A migration
  // that skipped a unit it could not read has not finished — it has stopped.
  let marker = null;
  if (apply && failed.length === 0 && units.every((u) => progress.units[id(u)]?.verified)) {
    marker = markerPath(root, name);
    atomicWrite(marker, `${now().toISOString()} ${units.length} unit(s) verified\n`);
    try { unlinkSync(progressPath(root, name)); } catch { /* progress is spent */ }
  }

  return { state: apply ? (marker ? 'done' : 'partial') : 'planned', done, failed, skipped, marker };
}

function writeProgress(root, name, progress) {
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  atomicWrite(progressPath(root, name), JSON.stringify(progress, null, 2) + '\n');
}
