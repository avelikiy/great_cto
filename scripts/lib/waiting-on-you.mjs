/**
 * What is waiting on a human, and for how long. One reader, both surfaces.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three mechanisms independently decided that old work should stop being
 * mentioned, and each is defensible alone:
 *
 *   · `gate.stale` alerts between 2h and 7 days, skips anything marked
 *     `blocked`, and dedupes so one gate yields exactly one alert, ever.
 *   · `gate-expiry` marks a gate `blocked` at 72h — which silences the above.
 *   · `session-pipeline-resume` treats anything past 24h as history rather than
 *     work waiting: "a stage that succeeded last week is not work waiting for
 *     you, it is something that happened."
 *
 * Together they produce silence. Measured on the author's machine: `gate.stale`
 * had fired six times in its life, most recently 41 days earlier, across a
 * period containing a gate that sat open for 29 days.
 *
 * The rule is inverted here: **age is the reason to speak, not to stop.** A
 * decision nobody has made does not become less urgent by ageing; it becomes
 * the only thing standing between the project and every stage after it.
 *
 * Noise is controlled by RANKING and CADENCE, not by going quiet — see
 * `cadenceFor`. The alternative that was tried is the one being replaced.
 *
 * Both the console hook and the board render this, so the two cannot drift into
 * telling the operator different things about the same gate.
 */

/** Below this, a gate is simply in flight. Nagging at once trains the reader to ignore the channel. */
const NUDGE_FLOOR_HOURS = 2;

/**
 * How often to repeat a reminder, given how long it has waited.
 * It decays. It never reaches "never".
 */
export function cadenceFor(ageHours) {
  return ageHours < 24 * 7 ? 'daily' : 'weekly';
}

function describe(ageHours, wasExpired) {
  const d = Math.floor(ageHours / 24);
  const age = d >= 1 ? `${d}d` : `${Math.round(ageHours)}h`;
  return wasExpired
    ? `waiting ${age} — past the 72h expiry, so nothing downstream can move`
    : `waiting ${age} for your decision`;
}

/**
 * @param {Array|null} tasks  the project's tasks, or null when they could not be read
 * @param {{now?: number, limit?: number}} [opts]
 * @returns {{state:'waiting'|'clear'|'unknown', items:Array, total:number,
 *            hidden:number, line:string}}
 */
export function waitingOnYou(tasks, { now = Date.now(), limit = 3 } = {}) {
  if (!Array.isArray(tasks)) {
    // Could-not-read must never render as an empty queue. That substitution is
    // the one this project exists to refuse, and it is what an empty array from
    // a failed read would produce.
    return { state: 'unknown', items: [], total: 0, hidden: 0,
      line: 'Could not read this project’s tasks, so what is waiting on you is unknown.' };
  }

  const open = [];
  for (const t of tasks) {
    if (!t || !t.is_gate) continue;
    const status = String(t.raw_status || t.status || '').toLowerCase();
    // `blocked` is INCLUDED. gate-expiry sets it at 72h, and a gate the machine
    // gave up on is the one most in need of a human — hiding it was the defect.
    if (status === 'closed' || status === 'done') continue;
    const created = Date.parse(t.created_at || t.updated_at || 0);
    if (!Number.isFinite(created)) continue;
    const ageHours = (now - created) / 3600_000;
    if (ageHours < NUDGE_FLOOR_HOURS) continue;
    open.push({
      id: t.id,
      title: String(t.title || '').slice(0, 80),
      ageHours: Math.round(ageHours),
      expired: status === 'blocked',
      cadence: cadenceFor(ageHours),
      why: describe(ageHours, status === 'blocked'),
    });
  }

  if (!open.length) {
    return { state: 'clear', items: [], total: 0, hidden: 0,
      line: 'Nothing is waiting on you.' };
  }

  // Oldest first: the longest wait is the strongest signal, and the one whose
  // cost has already been paid the longest.
  open.sort((a, b) => b.ageHours - a.ageHours);
  const items = open.slice(0, limit);
  const hidden = open.length - items.length;
  const n = open.length;
  const oldest = open[0];
  return {
    state: 'waiting',
    items, total: n, hidden,
    line: `${n} decision${n === 1 ? '' : 's'} waiting on you`
      + `, the oldest for ${Math.floor(oldest.ageHours / 24) || '<1'} day`
      + `${Math.floor(oldest.ageHours / 24) === 1 ? '' : 's'}.`,
  };
}

/**
 * The dedupe key an alert should use — the thing that turns "once, ever" into a
 * cadence.
 *
 * `fireEmailAlert` refuses to send twice for the same key, which is correct and
 * was the whole problem: the key was `gate.stale:<project>:<gate-id>`, so one
 * gate produced exactly one alert in its lifetime and then silence, however long
 * it waited.
 *
 * Putting the PERIOD in the key reuses that same machinery to repeat on a
 * schedule. Same gate, same day: one alert. Same gate, tomorrow: a new key, so
 * it speaks again. Once the wait passes a week the period widens to a week —
 * quieter, never silent.
 */
export function dedupeKeyFor(project, item, now = Date.now()) {
  const d = new Date(now);
  let period;
  if (item.cadence === 'weekly') {
    // ISO week: Thursday of the current week identifies the week uniquely, which
    // avoids the year-boundary bug a naive week number has.
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    period = `w${t.toISOString().slice(0, 10)}`;
  } else {
    period = d.toISOString().slice(0, 10);
  }
  return `gate.stale:${project}:${item.id}:${period}`;
}
