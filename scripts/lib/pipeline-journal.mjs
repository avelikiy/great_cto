// What the dispatcher decided, including when it decided nothing.
//
// The dispatcher printed text into a session and forgot. Everything it knew —
// which edge fired, which stage held, which chain ended, and above all why a
// run produced no output at all — existed for the length of one turn and then
// did not exist.
//
// That is why every pipeline defect this week was found by a person asking "why
// is nothing happening" instead of by anything in the repository. The map was
// resolved against the project rather than the plugin and thirteen of seventeen
// projects silently exited; the budget check was wired and never passed its
// arguments. Neither left a trace, because there was nowhere for a trace to go.
//
// A silent exit is the most valuable record here, not the least. "Nothing should
// happen" and "nothing could happen" produce identical output — no output — and
// the only thing that separates them is a reason written down at the moment.
//
// Append-only, fsynced, and never able to fail a dispatch: a journal that loses
// the run it was describing is worse than none, and a journal whose failure
// stops the pipeline is very much worse.

import { openSync, writeSync, fsyncSync, closeSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const JOURNAL_FILE = 'pipeline-runs.jsonl';

/**
 * Outcomes worth telling apart. The first four are decisions; the rest are the
 * ways a run ends without one, each of which used to look like the others.
 */
export const OUTCOMES = Object.freeze([
  'dispatch',        // one or more next stages named
  'hold',            // a join is incomplete, or a gate is waiting
  'stop',            // the chain ended, deliberately
  'blocked-budget',  // every next stage is over its cap
  'no-verdict',      // the agent ran and wrote nothing this run could read
  'no-rule',         // the agent has no edge in the map
  'unknown-verdict', // it wrote a token no branch and no `on` list handles
  'no-map',          // no pipeline map, in the project or the plugin
  'disabled',        // switched off by env
]);

/**
 * Append one record. Never throws.
 *
 * @returns {{ok: true} | {ok: false, why: string}} — the caller may report the
 *   failure but must not act on it. `recorded` is not the same as `happened`,
 *   and a dispatch that occurred is a fact whether or not we managed to say so.
 */
export function recordRun(cwd, entry) {
  const path = join(cwd, '.great_cto', JOURNAL_FILE);
  const line = JSON.stringify({
    v: 1,
    ts: entry.at ? new Date(entry.at).toISOString() : new Date().toISOString(),
    // `ts` is when the run ENDED; `started_at` is when it began. The pair is
    // what makes parallelism measurable rather than merely declared — the
    // contract has capped `max_parallel_streams` since it was written and
    // nothing ever recorded how many streams a run actually used, so a serial
    // pipeline and a five-way one left identical journals.
    //
    // Null when the transcript could not be timed. NOT defaulted to `ts`, which
    // would hand the run a zero-length interval — an invented measurement that
    // reads downstream exactly like a real one.
    started_at: entry.startedAt ? new Date(entry.startedAt).toISOString() : null,
    agent: entry.agent ?? null,
    verdict: entry.verdict ?? null,
    outcome: entry.outcome,
    next: entry.next ?? [],
    why: entry.why ?? null,
    // Which map answered decides whether a finding is about this project or
    // about the chain everybody shares.
    map: entry.mapSource ?? null,
  }) + '\n';

  let fd;
  try {
    mkdirSync(dirname(path), { recursive: true });
    fd = openSync(path, 'a');
    writeSync(fd, line);
    // "The bytes reached the OS" is the same failure as "the bytes were never
    // written", in slower motion.
    fsyncSync(fd);
    return { ok: true };
  } catch (e) {
    return { ok: false, why: String(e?.message || e) };
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* nothing left to do */ } }
  }
}

/**
 * Read a project's journal.
 *
 * @returns {{state:'none'|'some'|'unreadable', why:string, rows:object[]}}
 *   Three states, because a journal that exists and cannot be read must never
 *   render the same as one that is empty — the whole reason it exists is that a
 *   run nobody can see is indistinguishable from a run that never happened.
 */
export function readRuns(cwd) {
  const path = join(cwd, '.great_cto', JOURNAL_FILE);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (e) {
    if (e?.code === 'ENOENT') return { state: 'none', why: 'no runs recorded yet', rows: [] };
    return { state: 'unreadable', why: `${path}: ${String(e?.message || e)}`, rows: [] };
  }
  const rows = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { skipped++; }
  }
  if (!rows.length && skipped) {
    return { state: 'unreadable', why: `${skipped} line(s) present and none parsed`, rows: [] };
  }
  return {
    state: rows.length ? 'some' : 'none',
    why: skipped ? `${rows.length} run(s), ${skipped} unparseable line(s) skipped` : `${rows.length} run(s)`,
    rows,
  };
}
