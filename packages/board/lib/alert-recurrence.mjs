/**
 * Has this alert fired here before?
 *
 * `alerts-fired.json` has recorded every alert this machine sent, keyed
 * `<event>:<project>:<id>` with the time it fired. It was read only as a dedupe
 * set — "have I already sent THIS instance" — so a gate going stale for the
 * first time in a project and the ninth in a month produced the same sentence,
 * and the operator had no way to tell a one-off from a pattern.
 *
 * A threshold cannot make that distinction; only history can, and the history
 * was already on disk.
 *
 * Three states, because the file is lossy and its absence means something:
 *
 *   unknown    — no history to read. NOT "first": a count nobody took is not a
 *                count of zero, and this is the substitution the project exists
 *                to refuse.
 *   first      — history exists and holds nothing for this rule in this project.
 *   recurring  — it holds N earlier fires inside the window.
 *
 * `atLeast` marks a count taken from a FULL history: the writer keeps only the
 * last 500 keys, so anything older is gone and the number is a floor.
 */

/** The writer's cap — see writeAlertsFired in alerts.mjs. */
const HISTORY_CAP = 500;
const DEFAULT_WINDOW_DAYS = 30;

/**
 * @param {Record<string,string>|null} fired  parsed alerts-fired.json, or null
 *   when there is no such file
 * @param {{event: string, project: string, now?: number, windowDays?: number}} q
 * @returns {{state:'unknown'|'first'|'recurring', count:number|null,
 *            windowDays:number, atLeast:boolean, sentence:string}}
 */
export function recurrence(fired, { event, project, now = Date.now(), windowDays = DEFAULT_WINDOW_DAYS }) {
  if (!fired || typeof fired !== 'object') {
    return {
      state: 'unknown', count: null, windowDays, atLeast: false,
      sentence: 'No alert history on this machine, so whether this has happened before is unknown.',
    };
  }

  // Anchored on the full `event:project:` prefix. A bare startsWith(event) would
  // count `gate.stalest` as `gate.stale`, and a project slug may itself contain
  // a colon — so both parts are matched as one literal prefix.
  const prefix = `${event}:${project}:`;
  const cutoff = now - windowDays * 86_400_000;
  const keys = Object.keys(fired);

  let count = 0;
  for (const k of keys) {
    if (!k.startsWith(prefix)) continue;
    const at = Date.parse(fired[k]);
    // An unreadable timestamp is not evidence of a recent fire. Skipped, not
    // counted as now — which is what a NaN comparison would have done silently.
    if (!Number.isFinite(at) || at < cutoff) continue;
    count++;
  }

  const atLeast = keys.length >= HISTORY_CAP;
  if (count === 0) {
    return {
      state: 'first', count: 0, windowDays, atLeast,
      sentence: `First time this has fired for this project in ${windowDays} days.`,
    };
  }
  return {
    state: 'recurring', count, windowDays, atLeast,
    sentence: `${atLeast ? 'At least ' : ''}${count} other time${count === 1 ? '' : 's'} `
      + `in the last ${windowDays} days for this project — a pattern, not a one-off.`,
  };
}
