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
/**
 * Do two claimed path patterns describe any file in common?
 *
 * The previous implementation compared normalised strings, so `src/auth/*.ts`
 * and `src/auth/login.ts` were disjoint and the checker green-lit fanning two
 * agents onto the same file. coordinator.md meanwhile told readers globs were
 * expanded, which is how it went unnoticed — the docs described the behaviour
 * everybody assumed was there.
 *
 * Patterns are compared to each other, NOT expanded against the filesystem:
 * this runs at planning time, when the files a packet will create do not exist
 * yet. Expanding on disk would call every not-yet-written file disjoint from
 * everything — the same false green, arrived at more expensively.
 *
 * The asymmetry that decides every uncertain case: a false overlap costs some
 * parallelism; a missed overlap costs two agents racing on one file, which is
 * how work gets lost. Undecidable means overlapping.
 */

/** `src/auth` (no extension) is a directory claim: it owns what is under it. */
function segmentsOf(pattern) {
  const p = String(pattern).replace(/^\.\//, '').replace(/\/+$/, '');
  const segs = p.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  const isDirClaim = !!last && !last.includes('.') && !last.includes('*');
  return isDirClaim ? [...segs, '**'] : segs;
}

/** Can one path segment satisfy both patterns? */
function segmentsIntersect(a, b) {
  const aStar = a.includes('*');
  const bStar = b.includes('*');
  if (!aStar && !bStar) return a === b;

  const toRe = (g) => new RegExp(`^${g.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
  if (!bStar) return toRe(a).test(b);
  if (!aStar) return toRe(b).test(a);

  // Both are patterns. Compare the fixed text before the first star and after
  // the last: `*.ts` and `*.sql` cannot meet, `log*.ts` and `*.ts` can. Anything
  // these two probes do not settle is treated as meeting, per the asymmetry.
  const pre = (g) => g.slice(0, g.indexOf('*'));
  const suf = (g) => g.slice(g.lastIndexOf('*') + 1);
  const shorter = (x, y) => (x.length <= y.length ? [x, y] : [y, x]);
  const [p1, p2] = shorter(pre(a), pre(b));
  if (!p2.startsWith(p1)) return false;
  const [s1, s2] = shorter(suf(a), suf(b));
  return s2.endsWith(s1);
}

/** Do two segment lists describe any common path? `**` spans any depth. */
function pathsIntersect(a, b) {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0) return b.every((s) => s === '**');
  if (b.length === 0) return a.every((s) => s === '**');

  if (a[0] === '**') return pathsIntersect(a.slice(1), b) || pathsIntersect(a, b.slice(1));
  if (b[0] === '**') return pathsIntersect(a, b.slice(1)) || pathsIntersect(a.slice(1), b);

  return segmentsIntersect(a[0], b[0]) && pathsIntersect(a.slice(1), b.slice(1));
}

/** Do two claims overlap? Exported so the WPL checker uses the same rule. */
export function claimsOverlap(a, b) {
  return pathsIntersect(segmentsOf(a), segmentsOf(b));
}

/** The more specific of two claims, for naming the conflict. */
function moreSpecific(a, b) {
  const stars = (x) => (x.match(/\*/g) || []).length;
  if (stars(a) !== stars(b)) return stars(a) < stars(b) ? a : b;
  return a.length >= b.length ? a : b;
}

/**
 * Pure core. lanes: [{lane, files:[...]}]. Returns conflicts: for each contested
 * path, the path and the lanes claiming it.
 *
 * Compared pairwise across lanes rather than by exact-string bucketing, because
 * two lanes can collide on patterns that are not the same string — which was the
 * entire bug.
 */
export function laneOverlaps(lanes) {
  const claims = [];
  for (const { lane, files = [] } of lanes ?? []) {
    for (const f of files) if (f) claims.push({ lane, pattern: String(f) });
  }

  const byPath = new Map(); // representative path -> Set(lane)
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      // A lane may claim the same file twice; that is bookkeeping, not a race.
      if (claims[i].lane === claims[j].lane) continue;
      if (!claimsOverlap(claims[i].pattern, claims[j].pattern)) continue;
      const key = moreSpecific(claims[i].pattern, claims[j].pattern);
      if (!byPath.has(key)) byPath.set(key, new Set());
      byPath.get(key).add(claims[i].lane).add(claims[j].lane);
    }
  }

  return [...byPath.entries()]
    .map(([file, ls]) => ({ file, lanes: [...ls].sort() }))
    .sort((x, y) => x.file.localeCompare(y.file));
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
