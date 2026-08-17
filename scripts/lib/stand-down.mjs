// The record a gate leaves when it stands down instead of waiting.
//
// Six days ago `gate-tiering: evidence` started dropping gates to notify-only.
// `pipelinePosition` returns `ready-to-dispatch` with the gate named in
// `notified`, and the pipeline proceeds. The board's inbox is assembled from
// beads and verdicts, so the intent was that the entry still reaches a human.
//
// Nothing guaranteed it. If that write failed the stage proceeded anyway and the
// entry never appeared — and a gate that stood down is then indistinguishable
// from a gate that stood down and told nobody. That is precisely the defect the
// tiering feature was built to avoid reintroducing, and it shipped inside it.
//
// The invariant, taken from `deepseek-ai/deepseek-harness`, whose approval model
// is otherwise nothing like ours: **a decision that could not be logged is
// refused.** Their `approval/asked` + `approval/decided` pair is atomic with the
// outcome. Ours is one append that must succeed before the pipeline is told it
// may proceed.
//
// Append-only, beside the verdicts, in the shape they use. A notification is an
// event: overwriting state would lose the sequence, and the sequence is the
// audit.
//
// Fail-closed everywhere. Every path that cannot produce a durable record
// returns `recorded: false`, and the caller's contract is that this restores the
// gate. There is no path here that returns success on doubt.

import { openSync, writeSync, fsyncSync, closeSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const STAND_DOWN_PATH = join('.great_cto', 'stand-downs.jsonl');

/**
 * Write one stand-down record, durably.
 *
 * `fsync` rather than a bare append: `appendFileSync` returning means the bytes
 * reached the OS, not the disk. For a record whose entire purpose is to survive
 * so a human can audit a decision nobody was asked about, "probably written" is
 * the same failure in slower motion.
 *
 * @param {string} cwd
 * @param {{gate: string, agent: string, tier: string, evidence: string, at?: number}} rec
 * @returns {{recorded: boolean, why: string, path?: string}}
 */
export function recordStandDown(cwd, { gate, agent, tier, evidence, at = null } = {}) {
  // A record that cannot name what stood down is not a record. Refusing here
  // rather than writing a partial line keeps the file's meaning intact: every
  // line in it identifies a specific gate and a specific agent.
  if (!gate || !agent) {
    return { recorded: false, why: 'a stand-down record must name both the gate and the agent' };
  }
  if (at === null) {
    // Injected, never read from the clock here — the callers in this repository
    // all resolve one `now` at startup so a run is reproducible, and a module
    // that reaches for Date.now() quietly opts out of that.
    return { recorded: false, why: 'no timestamp supplied — the record must say when' };
  }

  const path = join(cwd, STAND_DOWN_PATH);
  let fd = null;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const line = JSON.stringify({
      v: 1,
      ts: new Date(at).toISOString(),
      gate,
      agent,
      tier: tier || 'unknown',
      evidence: evidence || '(none recorded)',
    }) + '\n';
    fd = openSync(path, 'a');
    writeSync(fd, line);
    fsyncSync(fd);
    return { recorded: true, why: `recorded gate:${gate} standing down for ${agent}`, path };
  } catch (e) {
    // The real error, not a guess about it. A catch that invents its cause is
    // how a ReferenceError once reported itself as a missing build.
    return { recorded: false, why: `could not write ${STAND_DOWN_PATH}: ${String(e?.message || e)}` };
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* the record is already fsynced */ } }
  }
}

/**
 * A recorder bound to one project, in the shape `pipelinePosition` injects.
 *
 * The position lib is forbidden to write (ARCH-pipeline-position S2, with a test
 * asserting it performs no fs-write). So the write lives here and is handed in,
 * which also means the default in that lib can be "no recorder", and no recorder
 * means no stand-down.
 */
export function standDownRecorder(cwd, { at = null } = {}) {
  return (rec) => recordStandDown(cwd, { ...rec, at: rec?.at ?? at });
}

/**
 * The records, newest last.
 *
 * A file that cannot be read returns `null` rather than `[]`. "I could not look"
 * and "I looked and there were none" are different answers, and an empty array
 * for both is the shape this module exists to remove.
 *
 * @returns {Array<object>|null}
 */
export function readStandDowns(cwd, { limit = 0 } = {}) {
  const path = join(cwd, STAND_DOWN_PATH);
  if (!existsSync(path)) return [];
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch { return null; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn line is not a record */ }
  }
  return limit > 0 ? out.slice(-limit) : out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/stand-down.mjs [--limit N] [--json]
//
// "Which gates stopped asking me, and on what evidence" — the question the
// board's inbox answers for gates that waited, and nothing answered for gates
// that did not.

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const li = argv.indexOf('--limit');
  const limit = li !== -1 ? Number(argv[li + 1]) : 0;

  const rows = readStandDowns(process.cwd(), { limit: Number.isFinite(limit) ? limit : 0 });
  if (rows === null) {
    console.error(`stand-down: ${STAND_DOWN_PATH} exists but could not be read — that is not "no stand-downs"`);
    process.exit(2);
  }
  if (argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

  if (!rows.length) {
    console.log('stand-down: no gate has stood down on this project.');
    process.exit(0);
  }
  console.log(`stand-down: ${rows.length} gate(s) proceeded without being asked\n`);
  for (const r of rows) {
    console.log(`  ${r.ts}  gate:${r.gate}  ${r.agent}  [${r.tier}]`);
    console.log(`    ${r.evidence}`);
  }
}
