// A migration that stopped halfway must not read as one that finished.
//
// The migration this repository already ships rewrote each target with a plain
// writeFileSync and announced success only at the very end. A run that died on
// the third project of seven printed nothing — indistinguishable, to the next
// operator, from a run that found nothing to do. Re-running was documented as
// safe, which is a claim about the happy path; after a crash nobody could check
// it, because nothing recorded how far it got.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runMigration, migrationState, backupOnce, atomicWrite, markerPath, progressPath, readProgress,
} from '../../scripts/lib/migration.mjs';

const root = () => mkdtempSync(join(tmpdir(), 'gcto-mig-'));
const at = () => new Date('2026-08-28T10:00:00Z');

test('three states, because "no marker" is not "never ran"', () => {
  const r = root();
  assert.equal(migrationState(r, 'x'), 'never');

  // A crash leaves progress behind and no marker. That is PARTIAL, and the
  // difference from `never` is the whole reason the progress file exists.
  writeFileSync(progressPath(r, 'x'), JSON.stringify({ units: { a: { verified: true } } }));
  assert.equal(migrationState(r, 'x'), 'partial');

  writeFileSync(markerPath(r, 'x'), 'done\n');
  assert.equal(migrationState(r, 'x'), 'done');
});

test('the marker is written only when every unit verified', () => {
  const r = root();
  const res = runMigration({
    root: r, name: 'ok', apply: true, now: at,
    units: ['a', 'b', 'c'],
    id: (u) => u,
    migrate: () => true,
    verify: () => true,
  });
  assert.equal(res.state, 'done');
  assert.deepEqual(res.done, ['a', 'b', 'c']);
  assert.ok(existsSync(res.marker));
  assert.equal(existsSync(progressPath(r, 'ok')), false, 'spent progress is cleared');
});

test('one failure withholds the marker, and says which unit', () => {
  const r = root();
  const res = runMigration({
    root: r, name: 'half', apply: true, now: at,
    units: ['a', 'b', 'c'],
    id: (u) => u,
    migrate: (u) => { if (u === 'b') throw new Error('disk full'); return true; },
    verify: () => true,
  });
  assert.equal(res.state, 'partial');
  assert.equal(res.marker, null, 'no marker — this did not finish');
  assert.deepEqual(res.done, ['a', 'c']);
  assert.deepEqual(res.failed, [{ unit: 'b', why: 'disk full' }]);
  assert.equal(migrationState(r, 'half'), 'partial');
  assert.equal(readProgress(r, 'half').units.b.verified, false);
});

test('a unit that wrote but did not verify is a failure, not a pass', () => {
  // The case that makes verification worth running at all: migrate() returned
  // without throwing, and the result is still wrong.
  const r = root();
  const res = runMigration({
    root: r, name: 'lie', apply: true, now: at,
    units: ['a'], id: (u) => u,
    migrate: () => 'wrote something',
    verify: () => false,
  });
  assert.equal(res.marker, null);
  assert.deepEqual(res.failed, [{ unit: 'a', why: 'verification returned false' }]);
});

test('a resumed run skips what already verified and finishes the rest', () => {
  const r = root();
  let attempts = 0;
  const opts = {
    root: r, name: 'resume', apply: true, now: at,
    units: ['a', 'b'], id: (u) => u,
    migrate: (u) => { attempts += 1; if (u === 'b' && attempts <= 2) throw new Error('flaky'); return true; },
    verify: () => true,
  };
  const first = runMigration(opts);
  assert.equal(first.marker, null);
  assert.deepEqual(first.done, ['a']);

  const second = runMigration(opts);
  assert.deepEqual(second.skipped, ['a'], 'a verified unit is not redone');
  assert.equal(second.state, 'done');
  assert.ok(existsSync(second.marker));
});

test('a completed migration refuses to run again', () => {
  const r = root();
  const o = { root: r, name: 'once', apply: true, now: at, units: ['a'], id: (u) => u,
              migrate: () => true, verify: () => true };
  runMigration(o);
  let ran = 0;
  const again = runMigration({ ...o, migrate: () => { ran += 1; return true; } });
  assert.equal(ran, 0, 'the marker is the answer to "has this already run"');
  assert.equal(again.state, 'done');
});

test('planning writes nothing at all', () => {
  const r = root();
  let ran = 0;
  const res = runMigration({
    root: r, name: 'plan', apply: false, units: ['a', 'b'], id: (u) => u,
    migrate: () => { ran += 1; return true; }, verify: () => true,
  });
  assert.equal(ran, 0);
  assert.equal(res.state, 'planned');
  assert.equal(existsSync(progressPath(r, 'plan')), false);
  assert.equal(existsSync(markerPath(r, 'plan')), false);
});

test('the backup holds the ORIGINAL, even on a second run', () => {
  // The failure this guards: a re-run backing up the already-migrated file and
  // overwriting the only copy of what was there before.
  const r = root();
  const f = join(r, 'verdicts.log');
  writeFileSync(f, 'original\n');

  const b1 = backupOnce(f, { now: at });
  assert.equal(readFileSync(b1, 'utf8'), 'original\n');

  atomicWrite(f, 'migrated\n');
  const b2 = backupOnce(f, { now: () => new Date('2026-09-01T10:00:00Z') });
  assert.equal(b2, b1, 'the same backup is reused');
  assert.equal(readFileSync(b2, 'utf8'), 'original\n', 'and it still holds the original');
  assert.equal(readdirSync(r).filter((n) => n.includes('pre-migration')).length, 1);
});

test('backing up something that is not there is not an error', () => {
  const r = root();
  assert.equal(backupOnce(join(r, 'absent.log'), { now: at }), null);
});

test('an interrupted write cannot truncate the original', () => {
  // atomicWrite is temp-then-rename, so the target is either the old content or
  // the new one — never a half file. Asserted through the leftover temp name.
  const r = root();
  const f = join(r, 'a.log');
  writeFileSync(f, 'before\n');
  atomicWrite(f, 'after\n');
  assert.equal(readFileSync(f, 'utf8'), 'after\n');
  assert.deepEqual(readdirSync(r).filter((n) => n.includes('.tmp-')), [], 'no temp file survives');
});
