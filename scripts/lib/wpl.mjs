#!/usr/bin/env node
/**
 * wpl — read the Work Packet List as data, and check it mechanically.
 *
 * Why this exists
 * ---------------
 * `decomposition_matrix_required = true` has been in shared/orchestrator.toml
 * since it was written, and the only consequence was that the words got printed
 * at SubagentStart. Nothing ever read a matrix, so a run that produced a good
 * one and a run that produced none at all were indistinguishable afterwards —
 * the same defect this repository keeps finding in its own guards.
 *
 * The overlap checker already existed and already answers "why parallel-safe"
 * mechanically. What stood between the table and the checker was a hand-written
 * lanes.json, and a hand-written intermediate step is a step that gets skipped —
 * exactly how `cost=auto` spent months recording a measured zero. This takes the
 * table itself.
 *
 * Three states, and the third is why the checker is worth having:
 *   parsed     a matrix that can be read
 *   malformed  a table that cannot answer the question the matrix exists for
 *   absent     no matrix at all
 *
 * `absent` means "write one"; `malformed` means "fix the one you wrote". A
 * checker that rendered them the same would send half its readers the wrong way.
 *
 * Usage:
 *   node scripts/lib/wpl.mjs <file.md>        # or --stdin
 * Exit: 0 disjoint · 1 overlap or no matrix · 2 usage
 */
import { readFileSync } from 'node:fs';
import { claimsOverlap, laneOverlaps } from './check-lane-overlap.mjs';

/**
 * Columns the contract names — in BOTH spellings it is written in.
 *
 * CLAUDE.md specifies the matrix as `Stream | Write-zone | Depends on | Why
 * parallel-safe`; coordinator.md emits the WPL, `# | Name | Class | Owned files
 * | …`, and states that the WPL IS the decomposition matrix with those columns
 * mapped onto each other. A reader that knew only one spelling would call the
 * other form absent — reporting "no matrix" at a document that is nothing but
 * the matrix, which is worse than not checking at all.
 */
const WANT = {
  name: /^(name|stream)$/i,
  cls: /^class$/i,
  // A parenthesised gloss is part of the heading in CLAUDE.md's spelling:
  // `Write-zone (files/dirs)`. Tolerated rather than required.
  files: /^(owned files?|write[- ]zone)(\s*\(.*\))?$/i,
};

/** A cell that claims no write zone. Research and Verification packets read. */
const READ_ONLY = /^\(?\s*(read[- ]only|none|—|-|n\/a)\s*\)?$/i;

const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
const isDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/**
 * Markdown → packets.
 *
 * @returns {{state:'parsed'|'malformed'|'absent', packets:object[], problems:string[]}}
 */
export function parseWpl(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    if (!lines[i + 1] || !isDivider(lines[i + 1])) continue;

    const header = cells(lines[i]);
    const idx = {};
    for (const [key, re] of Object.entries(WANT)) {
      idx[key] = header.findIndex((h) => re.test(h));
    }

    // A table without a write-zone column cannot answer the only question the
    // matrix exists for, so it is malformed rather than simply another table.
    if (idx.files < 0) {
      problems.push(`table at line ${i + 1} has no write-zone column ("Owned files" or "Write-zone"): ${header.join(' | ')}`);
      continue;
    }
    if (idx.name < 0) problems.push(`table at line ${i + 1} has no "Name" column`);

    const packets = [];
    for (let j = i + 2; j < lines.length; j++) {
      if (!lines[j].includes('|')) break;
      const row = cells(lines[j]);
      if (row.length < header.length - 1) { problems.push(`row ${j + 1} has ${row.length} cells, header has ${header.length}`); continue; }
      const raw = row[idx.files] ?? '';
      packets.push({
        name: idx.name >= 0 ? row[idx.name] : '',
        cls: idx.cls >= 0 ? row[idx.cls] : '',
        files: READ_ONLY.test(raw) ? [] : raw.split(',').map((f) => f.trim()).filter(Boolean),
        raw,
      });
    }

    if (packets.length === 0) {
      problems.push(`table at line ${i + 1} has a header and no packets`);
      return { state: 'malformed', packets: [], problems };
    }
    return { state: problems.length ? 'malformed' : 'parsed', packets, problems };
  }

  return { state: problems.length ? 'malformed' : 'absent', packets: [], problems };
}

/**
 * Packets → lanes for the overlap check.
 *
 * Only packets that WRITE claim a lane. Treating `(read-only)` as an owned path
 * would make every research packet collide with every other one and bury the
 * real finding under noise. A packet with no Class column is assumed to write:
 * assuming otherwise would drop it out of the check silently.
 */
export function lanesFromWpl(packets) {
  return (packets ?? [])
    // Two independent reasons a packet claims no lane, and both are needed: the
    // Class column says a packet reads, and the cell itself says so. The WPL has
    // both; the CLAUDE.md matrix has no Class column at all, and there the cell
    // is the only signal there is.
    .filter((p) => p.files?.length && !/^(research|verification)$/i.test(p.cls || ''))
    .map((p, i) => ({ lane: p.name || `packet-${i + 1}`, files: p.files }));
}

/**
 * Parse and check in one call.
 *
 * @returns {{ok:boolean, state:string, lanes:number, conflicts:object[], problems:string[], summary:string}}
 */
export function checkWpl(markdown) {
  const { state, packets, problems } = parseWpl(markdown);

  if (state === 'absent') {
    return { ok: false, state, lanes: 0, conflicts: [], problems, packets: [],
      summary: 'no Work Packet List found — the contract requires a decomposition matrix before a Large task starts' };
  }
  if (state === 'malformed') {
    return { ok: false, state, lanes: 0, conflicts: [], problems, packets,
      summary: `Work Packet List is malformed — ${problems[0] ?? 'unreadable'}` };
  }

  const lanes = lanesFromWpl(packets);
  const conflicts = laneOverlaps(lanes);
  const summary = conflicts.length
    ? `${conflicts.length} write zone(s) claimed by more than one packet — force sequential or re-split`
    : `${lanes.length} write zone(s), disjoint — safe to fan out`;

  return { ok: conflicts.length === 0, state, lanes: lanes.length, conflicts, problems, packets, summary };
}

export { claimsOverlap };

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  let text;
  if (argv.includes('--stdin')) {
    text = readFileSync(0, 'utf8');
  } else {
    const file = argv.find((a) => !a.startsWith('--'));
    if (!file) { console.error('usage: wpl.mjs <file.md> | --stdin [--json]'); process.exit(2); }
    try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(2); }
  }

  const v = checkWpl(text);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(v, null, 2));
  } else {
    console.log(`WPL: ${v.state} — ${v.summary}`);
    for (const p of v.problems) console.log(`  problem: ${p}`);
    for (const c of v.conflicts) console.log(`  OVERLAP  ${c.file}  ← ${c.lanes.join(', ')}`);
  }
  process.exit(v.ok ? 0 : 1);
}
