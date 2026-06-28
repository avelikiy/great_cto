// scripts/lib/stall-triage.mjs — liveness / stall triage for parallel lanes
// (architect-loop R9, first slice). When the coordinator dispatches parallel
// builders, a silently-hung lane blocks the whole loop. This flags lanes that have
// produced no output past a threshold and orders the response "kill narrowest
// first" — recover the stall without sacrificing the big productive lanes.
//
// SCOPE: a decision helper over lane state {id, lastOutputMs, filesChanged}. It does
// not kill processes itself (Claude Code's Task tool owns lifecycle); it tells the
// coordinator what's stalled and what to kill first.
//
// Usage:
//   node scripts/lib/stall-triage.mjs --state lanes.json [--threshold-sec 180]
//   (lanes.json: [{"id":"lane-a","lastOutputMs":1700000000000,"filesChanged":1}])

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A lane is stalled if it produced no output within thresholdMs of `now`. */
export function isStalled(lastOutputMs, now, thresholdMs) {
  if (!Number.isFinite(lastOutputMs)) return true; // never produced output → stalled
  return (now - lastOutputMs) > thresholdMs;
}

/**
 * Triage lanes. Returns the stalled ones ordered "narrowest first" (fewest
 * filesChanged → smallest blast radius → kill first), so recovery sacrifices the
 * least work.
 * @returns {{stalled:Array, killOrder:Array}}
 */
export function triage(lanes, now, thresholdMs) {
  const stalled = (lanes || [])
    .filter(l => isStalled(l.lastOutputMs, now, thresholdMs))
    .map(l => ({ ...l, idleMs: Number.isFinite(l.lastOutputMs) ? now - l.lastOutputMs : Infinity }));
  // narrowest first: ascending scope, ties broken by longest idle
  const killOrder = [...stalled].sort((a, b) =>
    (a.filesChanged ?? 0) - (b.filesChanged ?? 0) || (b.idleMs - a.idleMs));
  return { stalled, killOrder };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
  const state = get('--state');
  const thresholdMs = (parseInt(get('--threshold-sec') || '180', 10)) * 1000;
  if (!state) { console.error('Usage: stall-triage.mjs --state lanes.json [--threshold-sec 180]'); process.exit(2); }

  let lanes;
  try { lanes = JSON.parse(readFileSync(state, 'utf8')); } catch (e) { console.error(`ERROR reading ${state}: ${e.message}`); process.exit(2); }
  const { stalled, killOrder } = triage(lanes, Date.now(), thresholdMs);

  if (stalled.length === 0) { console.log(`stall-triage: all ${lanes.length} lane(s) live (threshold ${thresholdMs / 1000}s).`); process.exit(0); }
  console.log(`stall-triage: ${stalled.length} stalled lane(s) — kill narrowest first:`);
  for (const l of killOrder) {
    const idle = l.idleMs === Infinity ? 'never produced output' : `idle ${Math.round(l.idleMs / 1000)}s`;
    console.log(`  ⚠ ${l.id}  (files=${l.filesChanged ?? '?'}, ${idle})`);
  }
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
