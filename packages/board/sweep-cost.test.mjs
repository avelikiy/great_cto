// A cache whose TTL is shorter than the sweep that fills it never hits.
//
// The board rendered empty while reporting "live · synced just now", and both
// halves were true: SSE was connected and every data request had timed out. It
// was not broken, it was saturated. Measured while it was happening:
//
//   - a `bd` child present in 9 of 10 samples taken 2 s apart
//   - `/api/version` — one readdirSync, no bd — answering in 1-10 s, because it
//     was queued behind work that holds the event loop
//   - 16 registered projects, `bd list` costing 2-6 s each = ~60 s per sweep
//   - three alert crons sweeping all of them every 5 minutes: ~190 s of
//     synchronous blocking per 300 s
//
// Two mechanisms, and either alone would have been survivable:
//
//   1. The TTL (30 s) was shorter than one sweep (~60 s), so the entries filled
//      at the start of a sweep had expired before it ended.
//   2. The file watchers invalidated — deleted — the cache entry for every one
//      of the sixteen on every file event in any of them, and a deleted entry
//      cannot be served at any staleness.
//
// Yesterday's fix raised the TTL from 2 s to 30 s after measuring a single call.
// It was measured against the wrong thing: the number that matters is the cost
// of the whole sweep, not of one call in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BD_CACHE_TTL_MS, SWEEP_MAX_AGE_MS, isSelfInflictedTouch } from './lib/beads.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(HERE, 'lib', f), 'utf8');

test('sweep freshness exceeds the cost of a sweep, by a margin', () => {
  // 16 projects x 6 s worst case = 96 s. A sweep budget under that reproduces
  // the incident exactly: every sweep re-runs every project.
  const WORST_CASE_SWEEP_MS = 16 * 6000;
  assert.ok(SWEEP_MAX_AGE_MS > WORST_CASE_SWEEP_MS * 2,
    `sweep freshness ${SWEEP_MAX_AGE_MS}ms must clear a ${WORST_CASE_SWEEP_MS}ms sweep with room`);
});

test('interactive freshness stays short — a person looking at one project', () => {
  // The two must not collapse into one number. Sweep freshness is chosen against
  // the sweep's cost; interactive freshness against what a reader expects.
  // The interactive bound is generous because it is a BACKSTOP: writes and the
  // watched project's file events both invalidate, so this only covers a change
  // that arrived through neither. It must still be far below the sweep budget,
  // or the two have collapsed into one number again.
  assert.ok(BD_CACHE_TTL_MS <= 10 * 60_000, 'the backstop cannot become the contract');
  assert.ok(SWEEP_MAX_AGE_MS > BD_CACHE_TTL_MS, 'and a background sweep does not');
});

test('every all-projects sweep reads at sweep freshness', () => {
  // The failure was not one careless call; it was that nothing distinguished a
  // sweep from a click. Any getTasks in alerts.mjs without the sweep option is
  // a sixteen-project synchronous read on a five-minute timer.
  const alerts = read('alerts.mjs');
  const calls = [...alerts.matchAll(/getTasks\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length > 0, 'located the sweeps');
  for (const args of calls) {
    assert.match(args, /SWEEP/, `getTasks(${args}) sweeps every project — it must read at sweep freshness`);
  }
});

test('the watchers invalidate only what someone is watching', () => {
  // Invalidation DELETES; a deleted entry defeats every staleness allowance
  // downstream, which is why raising the TTL alone would not have helped.
  const w = read('watchers.mjs');
  const fn = w.match(/const broadcast = \(dir\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(fn, 'located broadcast');
  assert.ok(fn.indexOf('_gctoCwd === dir') < fn.indexOf('bdCacheInvalidate'),
    'the watched check must come before the invalidation, not after');
  assert.match(fn, /if \(!watched\) return;/);
});

// ── The read that destroyed its own cache ───────────────────────────────────

test('a read does not invalidate the entry it just filled', () => {
  // The root cause, found only after the TTL had been raised three times to no
  // effect. `bd list` is a READ, and dolt writes anyway: it touches
  // `.dolt/noms/manifest` and `.dolt/noms/journal.idx` on every invocation. The
  // watcher watches exactly those files — deliberately, since `bd create` writes
  // only to dolt and never to interactions.jsonl, making them the only signal
  // for a new issue.
  //
  // So: request runs `bd list` → dolt touches the journal → watcher fires →
  // entry invalidated → next request runs `bd list`. The entry was never
  // expiring, it was being deleted, which is why 2 s, 30 s and 5 minutes all
  // behaved identically.
  const w = readFileSync(join(HERE, 'lib', 'watchers.mjs'), 'utf8');
  const fn = w.match(/const broadcast = \(dir\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(fn, 'located broadcast');
  assert.ok(fn.indexOf('isSelfInflictedTouch') < fn.indexOf('bdCacheInvalidate'),
    'the self-touch check must run BEFORE the invalidation it exists to prevent');
});

test('the self-touch window is short enough to still catch a real write', () => {
  // A real external write inside the window is missed by the watcher and picked
  // up by the next event or the TTL. The alternative is the loop, which costs
  // every single read.
  const beads = readFileSync(join(HERE, 'lib', 'beads.mjs'), 'utf8');
  const m = beads.match(/const SELF_TOUCH_WINDOW_MS = (\d+);/);
  assert.ok(m, 'located the window');
  assert.ok(Number(m[1]) <= 10_000, 'a long window starts swallowing real writes');
  assert.ok(Number(m[1]) >= 1_000, 'a short one lets the echo through and the loop returns');
});

test('an unrelated directory is never treated as self-touched', () => {
  assert.equal(isSelfInflictedTouch('/nowhere-we-have-ever-run-bd'), false);
});

test('the run is stamped on both sides of the call', () => {
  // `bd list` takes seconds and the touch lands DURING it. Stamping only before
  // leaves a window where our own echo arrives after the mark has aged out.
  const beads = readFileSync(join(HERE, 'lib', 'beads.mjs'), 'utf8');
  const fn = beads.match(/function bdList\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located bdList');
  assert.equal((fn.match(/lastBdRunAt\.set/g) || []).length, 2,
    'stamped before and after the runner call');
});
