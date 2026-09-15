#!/usr/bin/env node
/**
 * lane-diff — did a builder's actual diff stay inside the write zone it claimed?
 *
 * Why this exists
 * ---------------
 * wpl.mjs checks the PLAN: before a fan-out, no two packets claim the same file.
 * Nothing checked the RESULT. A packet that claimed `src/auth/*.ts` and also
 * edited `src/db/pool.ts` passed every guard this repository had, and the
 * orchestrator committed it — while another packet, which did own
 * `src/db/pool.ts`, was editing the same file in its own worktree. The plan was
 * disjoint; the work was not. That is the race the matrix exists to prevent,
 * arriving through the one door nobody watched.
 *
 * It has to run before the orchestrator commits. After the commit the work is
 * one diff with no author, and "which packet wrote this line" can no longer be
 * answered from the tree. (Method borrowed from headcount's `agent-guard diff`,
 * MIT — split by write surface, check the plan AND the diff.)
 *
 * States — six, because each sends the reader somewhere different:
 *   inside        every changed file is inside the packet's claim
 *   empty         the packet changed nothing
 *   stray         at least one changed file is outside the claim
 *   unknown-lane  no packet by that name in the matrix
 *   absent        no matrix to check against
 *   malformed     a matrix that cannot be read
 *
 * A stray file is reported with the lanes that DO own it. Stray into another
 * packet's zone is a race; stray into no one's zone is drift. Both fail, but the
 * first one means another agent's work may already be overwritten.
 *
 * Usage:
 *   node scripts/lib/lane-diff.mjs <wpl.md> --lane "<packet name>" [--base <ref>] [--cwd DIR] [--json]
 *   git diff --name-only main | node scripts/lib/lane-diff.mjs <wpl.md> --lane "<name>" --files -
 * Exit: 0 inside/empty · 1 stray/unknown-lane · 2 usage · 3 not checked (no matrix, unreadable matrix, git failed)
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseWpl, lanesFromWpl } from './wpl.mjs';
import { fileInClaim } from './check-lane-overlap.mjs';

export const EXIT = Object.freeze({ INSIDE: 0, STRAY: 1, USAGE: 2, NOT_CHECKED: 3 });

/**
 * Paths an agent session writes as a side effect, whatever its task: the event
 * log, turn records, the task tracker. Counting them would make every packet
 * stray and the check would be switched off within a day. They are reported as
 * ignored, never silently dropped.
 */
export const ALWAYS_ALLOWED = Object.freeze(['.great_cto/**', '.beads/**']);

const READS = /^(research|verification)$/i;
const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Pure core.
 *
 * @param {{markdown:string, lane:string, changed:string[], allowed?:string[]}} opts
 * @returns {{ok:boolean, state:string, lane:string, inside:string[], stray:{file:string, ownedBy:string[]}[], ignored:string[], summary:string}}
 */
export function checkLaneDiff({ markdown, lane, changed = [], allowed = ALWAYS_ALLOWED }) {
  const base = { lane, inside: [], stray: [], ignored: [] };
  const { state, packets, problems } = parseWpl(markdown);

  if (state === 'absent') {
    return { ...base, ok: false, state, summary: 'no Work Packet List — nothing to check the diff against' };
  }
  if (state === 'malformed') {
    return { ...base, ok: false, state, summary: `Work Packet List is malformed — ${problems[0] ?? 'unreadable'}` };
  }

  const packet = packets.find((p) => norm(p.name) === norm(lane));
  if (!packet) {
    const names = packets.map((p) => p.name).filter(Boolean).join(', ');
    return { ...base, ok: false, state: 'unknown-lane', summary: `no packet named "${lane}" in the matrix (packets: ${names || 'none'})` };
  }

  // A Research or Verification packet reads. If it wrote, every file it wrote is
  // outside its zone, whatever its Owned-files cell happens to say.
  const claims = READS.test(packet.cls || '') ? [] : packet.files;
  const others = lanesFromWpl(packets).filter((l) => norm(l.lane) !== norm(packet.name));

  const files = [...new Set(changed.map((f) => String(f).trim()).filter(Boolean))].sort();
  for (const file of files) {
    if (allowed.some((a) => fileInClaim(file, a))) { base.ignored.push(file); continue; }
    if (claims.some((c) => fileInClaim(file, c))) { base.inside.push(file); continue; }
    const ownedBy = others.filter((l) => l.files.some((c) => fileInClaim(file, c))).map((l) => l.lane);
    base.stray.push({ file, ownedBy });
  }

  if (base.stray.length) {
    const races = base.stray.filter((s) => s.ownedBy.length).length;
    return { ...base, ok: false, state: 'stray',
      summary: `${base.stray.length} file(s) outside "${packet.name}"'s write zone` +
        (races ? ` — ${races} of them owned by another packet (a race: check that packet's work before committing)` : '') };
  }
  if (base.inside.length === 0) {
    return { ...base, ok: true, state: 'empty', summary: `"${packet.name}" changed nothing` + (base.ignored.length ? ` (${base.ignored.length} session file(s) ignored)` : '') };
  }
  return { ...base, ok: true, state: 'inside', summary: `${base.inside.length} file(s), all inside "${packet.name}"'s write zone` };
}

/**
 * Changed files in a working tree: everything that differs from `base` —
 * committed on the branch, staged, or not — plus untracked files. `--no-renames`
 * lists both sides of a rename: moving a file out of someone else's zone is a
 * change to that zone.
 */
export function changedFiles({ cwd = process.cwd(), base = 'HEAD' } = {}) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const tracked = git(['diff', '--name-only', '--no-renames', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  return [...new Set(`${tracked}\n${untracked}`.split('\n').map((l) => l.trim()).filter(Boolean))];
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const flags = new Set(['--lane', '--base', '--cwd', '--files']);
  const wplFile = argv.find((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]));
  const lane = arg('--lane');
  if (!wplFile || !lane) {
    console.error('usage: lane-diff.mjs <wpl.md> --lane "<packet name>" [--base <ref>] [--cwd DIR] [--files -] [--json]');
    process.exit(EXIT.USAGE);
  }

  let markdown;
  try { markdown = readFileSync(wplFile, 'utf8'); } catch (e) {
    console.error(`cannot read ${wplFile}: ${e.message}`);
    process.exit(EXIT.USAGE);
  }

  let changed;
  try {
    changed = arg('--files') === '-'
      ? readFileSync(0, 'utf8').split('\n')
      : changedFiles({ cwd: arg('--cwd') || process.cwd(), base: arg('--base') || 'HEAD' });
  } catch (e) {
    // A diff that could not be read is not a clean diff.
    console.error(`lane-diff: not checked — git failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    process.exit(EXIT.NOT_CHECKED);
  }

  const v = checkLaneDiff({ markdown, lane, changed });
  if (argv.includes('--json')) {
    console.log(JSON.stringify(v, null, 2));
  } else {
    console.log(`lane-diff: ${v.state} — ${v.summary}`);
    for (const s of v.stray) console.log(`  STRAY  ${s.file}${s.ownedBy.length ? `  (owned by ${s.ownedBy.join(', ')})` : '  (owned by no packet)'}`);
    if (v.ignored.length) console.log(`  ignored (session files): ${v.ignored.length}`);
  }
  if (v.state === 'absent' || v.state === 'malformed') process.exit(EXIT.NOT_CHECKED);
  process.exit(v.ok ? EXIT.INSIDE : EXIT.STRAY);
}
