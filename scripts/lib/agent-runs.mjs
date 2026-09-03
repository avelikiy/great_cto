/**
 * agent-runs — when each agent actually ran, so parallelism can be measured
 * rather than declared.
 *
 * Why this exists
 * ---------------
 * `shared/orchestrator.toml` has said `max_parallel_streams = 5` since it was
 * written. `orchestrator-check.mjs` prints that number at SubagentStart and
 * blocks inline `claude -p` dispatch — it caps the parallelism and forbids the
 * wrong way to get it, but nothing anywhere measures how much was used. A run
 * that dispatched five streams and a run that did every stage one after another
 * leave the same logs behind. The serial one is just slower, and slower is
 * invisible in a verdict.
 *
 * That is this repository's recurring defect wearing new clothes: a thing that
 * did not happen looking exactly like a thing that did. The fix is the same one
 * that worked for contrast and for CI parity — write down the measured number
 * next to the declared one and let them disagree out loud.
 *
 * Three states, and the third is the point
 * ----------------------------------------
 *   parallel    two or more agents were running at the same moment
 *   serial      agents ran, and never two at once
 *   unmeasured  nothing recorded when they ran
 *
 * `serial` and `unmeasured` are different findings with different fixes, and a
 * reader who is handed one when the other is true will go and optimise a
 * pipeline that was never observed. So an empty log reports `unmeasured` and a
 * peak of `null` — never a peak of zero, which reads like a measurement.
 *
 * The interval comes from the agent's own transcript (`transcriptStartedAt` in
 * agent-transcript.mjs) and the moment its dispatch hook fires. Neither depends
 * on the agent remembering to do anything: agents forget, which is exactly why
 * `cost=auto` spent months recording a measured zero.
 */

export const RUN_FORMAT_VERSION = 1;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** ms since epoch, an ISO string, or a Date → ISO seconds. Null if unusable. */
function toIso(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

/**
 * One run of one agent. Both ends are required.
 *
 * Nothing here defaults a missing end to `now`: that would manufacture an
 * interval for a run nobody timed, and an invented interval is indistinguishable
 * downstream from a real one. A run that cannot be timed is not recorded, and
 * its absence is what makes the report say `unmeasured`.
 */
export function makeRunRecord({ agent, startedAt, endedAt } = {}) {
  const name = String(agent ?? '').trim();
  if (!name) throw new Error('agent is required');

  const started_at = toIso(startedAt);
  if (!started_at) throw new Error('started_at is required and must be a time');
  const ended_at = toIso(endedAt);
  if (!ended_at) throw new Error('ended_at is required and must be a time');

  if (Date.parse(ended_at) < Date.parse(started_at)) {
    throw new Error('ended_at is before started_at');
  }
  return { v: RUN_FORMAT_VERSION, agent: name, started_at, ended_at };
}

/** Is this a record we can measure with? */
function usable(r) {
  return !!r && r.v === RUN_FORMAT_VERSION
    && typeof r.agent === 'string' && r.agent
    && typeof r.started_at === 'string' && ISO.test(r.started_at)
    && typeof r.ended_at === 'string' && ISO.test(r.ended_at)
    && Date.parse(r.ended_at) >= Date.parse(r.started_at);
}

/**
 * NDJSON → records. Lines that cannot be read are COUNTED, not dropped
 * silently: a log that is half unreadable and a log that is half empty give the
 * same peak, and only the count tells them apart.
 */
export function parseRunLog(text) {
  const runs = [];
  let malformed = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let rec = null;
    try { rec = JSON.parse(line); } catch { malformed++; continue; }
    if (usable(rec)) runs.push(rec); else malformed++;
  }
  return { runs, malformed };
}

/**
 * The peak number of agents running at the same moment.
 *
 * A sweep over start/end events: an interval is half-open, so a run that begins
 * exactly as another ends does not overlap it. Counting a boundary touch as
 * overlap would report parallelism in a pipeline that is strictly serial —
 * precisely the false positive that makes a measurement worthless.
 */
export function concurrency(runs) {
  const usableRuns = (runs ?? []).filter(usable);
  if (usableRuns.length === 0) {
    return { state: 'unmeasured', max: null, measured: 0 };
  }

  const events = [];
  for (const r of usableRuns) {
    events.push({ t: Date.parse(r.started_at), delta: +1 });
    events.push({ t: Date.parse(r.ended_at), delta: -1 });
  }
  // Ends before starts at the same instant — that is what makes the interval
  // half-open and keeps a hand-off from reading as an overlap.
  events.sort((a, b) => (a.t - b.t) || (a.delta - b.delta));

  let live = 0, max = 0;
  for (const e of events) {
    live += e.delta;
    if (live > max) max = live;
  }
  return {
    state: max >= 2 ? 'parallel' : 'serial',
    max,
    measured: usableRuns.length,
  };
}

/**
 * The declared ceiling against the measured peak.
 *
 * This never fails a run. A pipeline whose work genuinely has no independent
 * streams SHOULD be serial, and a guard that punished that would push people to
 * parallelise things that share state — the one outcome worse than being slow.
 * It reports, and the reader decides.
 */
export function parallelismReport({ runs, declaredMax, untimed = 0 } = {}) {
  const c = concurrency(runs);
  const declared = Number.isFinite(declaredMax) ? declaredMax : null;

  let summary;
  if (c.state === 'unmeasured') {
    summary = untimed > 0
      ? `parallelism NOT MEASURED — ${untimed} run(s) recorded without a start time`
      : 'parallelism NOT MEASURED — no run intervals recorded';
  } else {
    const of = declared === null ? '' : ` of ${declared}`;
    summary = c.state === 'parallel'
      ? `peak ${c.max}${of} streams, over ${c.measured} run(s)`
      : `serial — peak ${c.max}${of} streams, over ${c.measured} run(s)`;
  }

  return { state: c.state, max: c.max, measured: c.measured, declaredMax: declared, untimed, summary };
}

// ── Reading the journal ─────────────────────────────────────────────────────
//
// No log of its own. `pipeline-runs.jsonl` is already appended on every subagent
// completion and already distinguishes a journal that is empty from one that
// cannot be read; a second log beside it would be a second thing to keep in
// sync and a second thing to forget. It now carries `started_at` next to `ts`,
// which is the whole of what was missing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Journal rows → measurable intervals.
 *
 * A row with no `started_at` is `untimed`, which is NOT malformed: the row is
 * perfectly well-formed, the transcript simply could not be timed. Reporting it
 * as corruption would send someone to fix a parser that is working.
 */
export function runsFromJournal(rows) {
  const runs = [];
  let untimed = 0;
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object' || !r.agent) continue;
    if (!r.started_at || !r.ts) { untimed++; continue; }
    try {
      runs.push(makeRunRecord({ agent: r.agent, startedAt: r.started_at, endedAt: r.ts }));
    } catch { untimed++; }
  }
  return { runs, untimed };
}

/** The project's journal rows, as intervals. A missing journal is unmeasured. */
export function readJournalRuns(projectRoot) {
  let text = '';
  try {
    text = readFileSync(join(projectRoot || '.', '.great_cto', 'pipeline-runs.jsonl'), 'utf8');
  } catch { return { runs: [], untimed: 0 }; }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* counted below as untimed */ }
  }
  return runsFromJournal(rows);
}

/**
 * `max_parallel_streams` from the orchestrator contract.
 *
 * A small regex rather than a TOML parser: this runs inside a hook on every
 * subagent start, the field is one integer, and `orchestrator-check.mjs` already
 * reads the same file with its own minimal parser. Null means the contract
 * declared no ceiling — which is not the same as declaring zero.
 */
export function declaredMaxStreams(tomlText) {
  const m = String(tomlText ?? '').match(/^\s*max_parallel_streams\s*=\s*(\d+)/m);
  return m ? Number(m[1]) : null;
}
