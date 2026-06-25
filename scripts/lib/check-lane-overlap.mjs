#!/usr/bin/env node
/**
 * check-lane-overlap — file-set overlap check before parallel dispatch
 * (architect-loop R8, MIT): split a slice into 1-4 lanes whose declared file
 * sets are DISJOINT, each builder in its own worktree. Naive shared-file
 * coordination collapses throughput and loses work — so the planner (pm)
 * verifies the lanes don't overlap BEFORE dispatching builders.
 *
 * (This is the mechanical version of the concurrency-safety rule in SKILL.md:
 * "parallel writes ONLY if owned files are disjoint." A shared-tree race is
 * exactly what this catches.)
 *
 * Usage:
 *   node scripts/lib/check-lane-overlap.mjs lanes.json      # [{"lane":"A","files":[...]}, ...]
 *   echo '<json>' | node scripts/lib/check-lane-overlap.mjs --stdin [--json]
 * Exit: 0 = disjoint (safe to fan out), 1 = overlap (serialize or re-split), 2 = usage.
 */

import { readFileSync } from 'node:fs';

/**
 * Pure core. lanes: [{lane, files:[...]}]. Returns conflicts: for each file
 * claimed by >1 lane, the file and the lanes claiming it.
 */
export function laneOverlaps(lanes) {
  const owners = new Map(); // file -> [lane,...]
  for (const { lane, files = [] } of lanes) {
    for (const f of files) {
      const norm = f.replace(/^\.\//, '').replace(/\/+$/, '');
      if (!owners.has(norm)) owners.set(norm, []);
      const arr = owners.get(norm);
      if (!arr.includes(lane)) arr.push(lane);
    }
  }
  return [...owners.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([file, ls]) => ({ file, lanes: ls.sort() }));
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let raw;
  if (argv.includes('--stdin')) raw = readFileSync(0, 'utf8');
  else {
    const file = argv.find((a) => !a.startsWith('--'));
    if (!file) { console.error('usage: check-lane-overlap.mjs <lanes.json> | --stdin'); process.exit(2); }
    raw = readFileSync(file, 'utf8');
  }
  let lanes;
  try { lanes = JSON.parse(raw); } catch (e) { console.error('invalid JSON:', e.message); process.exit(2); }
  if (!Array.isArray(lanes)) { console.error('expected an array of {lane, files[]}'); process.exit(2); }

  const conflicts = laneOverlaps(lanes);
  if (json) { console.log(JSON.stringify({ ok: conflicts.length === 0, conflicts }, null, 2)); }

  if (conflicts.length) {
    if (!json) {
      console.error(`LANE OVERLAP — ${conflicts.length} file(s) claimed by >1 lane. Do NOT fan out:`);
      for (const c of conflicts) console.error(`  ${c.file}  ← ${c.lanes.join(', ')}`);
      console.error('Re-split so each file has exactly one owner lane, or run these lanes sequentially.');
    }
    process.exit(1);
  }
  if (!json) console.log(`✓ ${lanes.length} lane(s) are file-disjoint — safe to dispatch in parallel worktrees.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
