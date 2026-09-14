// Agent activity for the board (ADR-021, phase 1).
//
// The hooks append agent events to <project>/.great_cto/events.jsonl through
// scripts/lib/agent-events.mjs; this reads them for one project, and gives the
// watcher a cheap stamp to notice that something new arrived.
//
// Three states come straight from the reader and are passed through unchanged:
// `none` (no file — no events recorded, which is not an idle agent), `live`, and
// `unreadable` (a file the board could not read — not zero events). `attention`
// is the pipeline events whose outcome means the chain did not move: on
// 2026-09-14 a run stopped on `no-rule` and nothing on the board said so.

import fs from 'fs';
import path from 'path';
import { readEvents, readEventsSince, EVENTS_FILE } from '../../../scripts/lib/agent-events.mjs';

/** Journal outcomes after which the pipeline did not move on. */
export const STALLED_OUTCOMES = Object.freeze(['no-rule', 'no-verdict', 'unknown-verdict', 'no-map', 'breaker', 'blocked-budget']);

export function agentActivity(cwd, { limit = 20 } = {}) {
  const r = readEvents(path.join(cwd, '.great_cto'), { limit });
  const attention = r.events.filter((e) => e.kind === 'pipeline' && STALLED_OUTCOMES.includes(e.outcome)).slice(-3);
  return { state: r.state, why: r.why ?? null, events: r.events, attention, bad: r.bad ?? 0 };
}

/**
 * The same, resumable (ADR-021 phase 2): events after `cursor` as a `delta`, or a
 * `snapshot` when the cursor no longer points into this project's file. `cursor` is
 * what the next call should pass; `gap` says a snapshot replaced more events than a
 * replay sends. `attention` covers only the events returned — the page merges.
 */
export function agentActivitySince(cwd, cursor, { limit = 20 } = {}) {
  const r = readEventsSince(path.join(cwd, '.great_cto'), cursor, { limit });
  const attention = r.events.filter((e) => e.kind === 'pipeline' && STALLED_OUTCOMES.includes(e.outcome)).slice(-3);
  return {
    state: r.state, mode: r.mode ?? 'snapshot', why: r.why ?? null, events: r.events, attention,
    bad: r.bad ?? 0, cursor: r.cursor, gap: r.gap === true,
  };
}

/**
 * What the watcher compares between polls. `none` when there is no file; the
 * error code when it cannot be stat'ed, so a file that turns unreadable is a
 * change too.
 */
export function activityStamp(cwd) {
  try {
    const s = fs.statSync(path.join(cwd, '.great_cto', EVENTS_FILE));
    return `${s.size}:${s.mtimeMs}`;
  } catch (err) {
    return err?.code === 'ENOENT' ? 'none' : `error:${err?.code || 'unknown'}`;
  }
}
