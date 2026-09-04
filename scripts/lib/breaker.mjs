// breaker — stop after N consecutive runs that went nowhere.
//
// Why this exists
// ---------------
// `provider-exhaustion` answers a question about ONE error: does this kind mean
// every later call fails identically? It is the right question for a 402, and
// it cannot see the other shape — five different, individually retryable
// failures in a row while the pipeline does not advance. Each run looks like a
// run. Nothing is obviously broken, and nothing happens.
//
// Borrowed in spirit from MaxMiksa/Auto-Company (MAX_CONSECUTIVE_ERRORS=5), with
// its best detail: a run that timed out but changed the shared state counts as
// progress and zeroes the counter. No code taken — that repository ships no
// licence.
//
// What this is careful about
// --------------------------
// A breaker that fires on a healthy pipeline is worse than none, because the
// first thing anyone does with a false alarm is disable it. So a DELIBERATE
// stop is not a failure: `hold` means a gate is waiting for a human and may sit
// for days; `blocked-budget` means a cap did its job. Counting either would trip
// the breaker on the machinery working correctly.

/**
 * Outcomes that mean the run produced nothing the pipeline could use.
 *
 * Explicit, and an unlisted outcome counts as NOT a failure: a new outcome
 * added to the journal should be classified by someone who thought about it,
 * rather than defaulting into tripping a breaker nobody expected.
 */
export const FAILURE_OUTCOMES = Object.freeze([
  'no-verdict',       // the agent ran and wrote nothing readable
  'unknown-verdict',  // it wrote a token no branch handles
  'no-rule',          // no edge in the map for this agent
  'no-map',           // no pipeline map at all
]);

/**
 * How many runs, counting back from the most recent, went nowhere.
 *
 * Stops at the first run that moved: a real dispatch, a deliberate stop, or a
 * run that made measurable progress without leaving a verdict.
 *
 * `progressed` is three-state on purpose. `true` resets. `false` and `null` do
 * not — because `null` means nobody looked, and letting "unknown" read as
 * progress would give us a breaker that exists and can never fire.
 */
export function consecutiveFailures(rows) {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r || typeof r !== 'object') break;
    if (r.progressed === true) break;        // cut short, not wasted
    if (!FAILURE_OUTCOMES.includes(r.outcome)) break;
    n++;
  }
  return n;
}

/**
 * The breaker's reading.
 *
 * @returns {{state:'ok'|'tripped'|'unmeasured', count:number|null, why:string}}
 *   `unmeasured` when there is no journal to read — which is NOT `ok`. An empty
 *   read reporting a healthy breaker is the failure this whole repository keeps
 *   deleting: "nothing has failed" and "nothing was recorded" are different, and
 *   only one of them is reassuring.
 */
export function breakerState(rows, { threshold = 5 } = {}) {
  if (!Array.isArray(rows)) {
    return { state: 'unmeasured', count: null, why: 'no pipeline journal to read — the breaker is NOT known to be clear' };
  }
  // 0 (or below) is the OFF switch, not the strictest setting. `count < threshold`
  // read literally would make zero failures fail to be "less than zero" and trip
  // the breaker on a clean pipeline — a disable that enables, firing exactly when
  // someone is trying to get unstuck.
  if (!(threshold > 0)) {
    return { state: 'ok', count: consecutiveFailures(rows), why: 'breaker disabled (threshold 0)' };
  }
  const count = consecutiveFailures(rows);
  if (count < threshold) {
    return { state: 'ok', count, why: count === 0 ? 'no consecutive dead runs' : `${count} dead run(s), below the threshold of ${threshold}` };
  }
  // Name what kept happening. "Five failures" sends someone to read five log
  // entries; "five × no-verdict" points at the shape of the problem.
  const kinds = [...new Set(rows.slice(-count).map((r) => r.outcome))].join(', ');
  const agents = [...new Set(rows.slice(-count).map((r) => r.agent).filter(Boolean))].join(', ');
  return {
    state: 'tripped',
    count,
    why: `${count} consecutive runs produced nothing (${kinds})`
      + (agents ? ` — agent(s): ${agents}.` : '.')
      + ' Retrying has not moved the pipeline; something needs a human before the next dispatch.',
  };
}
