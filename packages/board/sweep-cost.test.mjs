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
import { BD_CACHE_TTL_MS, SWEEP_MAX_AGE_MS } from './lib/beads.mjs';

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
