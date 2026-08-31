/**
 * What an unattended iteration should look at before continuing what it was doing.
 *
 * The nightly prompt reads `.great_cto/HANDOFF.md` and, "if HANDOFF.md is
 * absent", falls back to the inbox to find the next open task. HANDOFF.md exists
 * from the second iteration onward, so that fallback never fires: the loop
 * follows the thread it is on and never looks at the threads that stopped. This
 * is the other half — waking up and going to find work, rather than only
 * draining the queue you were already in.
 *
 * THE DISTINCTION THAT MATTERS, and that `waitingOnYou` does not make, is WHO
 * CAN ACT:
 *
 *   · A gate awaiting a human is NOT work for an unattended agent. It is
 *     reported and left alone. An agent that "handles" a gate at 02:00 has
 *     approved its own work, which is the single thing the gate exists to
 *     prevent. Collapsing these two categories is how an autonomous loop becomes
 *     an autonomous rubber stamp.
 *   · A task that is open and has not moved is work it may take — and it must
 *     say out loud that it is switching, because a loop that changes direction
 *     silently is a loop nobody can follow in the morning.
 *
 * `blocked` is a third thing: something outside this loop is in the way. Taking
 * it produces an iteration that rediscovers the blocker and burns a run, so it
 * is reported and not offered.
 */

/** Below this, work is in flight rather than stalled. */
const STALE_DAYS = 2;

const ageDays = (t, now) => {
  const at = Date.parse(t.updated_at || t.created_at || 0);
  return Number.isFinite(at) ? (now - at) / 86_400_000 : null;
};

/**
 * @param {Array|null} tasks
 * @param {{now?: number, limit?: number}} [opts]
 * @returns {{state:'work'|'clear'|'unknown', actionable:Array, blockedOnHuman:Array, text:string}}
 */
export function wakeupScan(tasks, { now = Date.now(), limit = 3 } = {}) {
  if (!Array.isArray(tasks)) {
    // A list nobody could read is not an empty world. Offering no work here is
    // deliberate: an iteration that "finds nothing" because the read failed
    // would report a clean board it never saw.
    return {
      state: 'unknown', actionable: [], blockedOnHuman: [],
      text: 'The task list could not be read, so what is stalled is unknown. Continue the '
        + 'handoff and say in your summary that the scan did not run.',
    };
  }

  const actionable = [];
  const blockedOnHuman = [];
  for (const t of tasks) {
    if (!t) continue;
    const status = String(t.raw_status || t.status || '').toLowerCase();
    if (status === 'closed' || status === 'done') continue;
    const days = ageDays(t, now);
    if (days === null || days < STALE_DAYS) continue;
    const row = { id: t.id, title: String(t.title || '').slice(0, 80), days: Math.round(days) };
    if (t.is_gate || status === 'blocked') blockedOnHuman.push(row);
    else actionable.push(row);
  }

  const byAge = (a, b) => b.days - a.days;
  actionable.sort(byAge);
  blockedOnHuman.sort(byAge);
  const shown = actionable.slice(0, limit);
  const hidden = actionable.length - shown.length;

  if (!actionable.length && !blockedOnHuman.length) {
    return { state: 'clear', actionable: [], blockedOnHuman: [], text: 'Nothing is stalled.' };
  }

  const lines = ['STALLED WORK — read this before continuing the handoff.', ''];
  if (shown.length) {
    lines.push('Open and not moving. You may take one of these instead of the handoff\'s next step:');
    for (const r of shown) lines.push(`  · ${r.id} — ${r.title} (${r.days}d)`);
    if (hidden) lines.push(`  · …and ${hidden} more`);
    lines.push('');
    lines.push('If one of these is worth more than the handoff\'s next step, SWITCH to it — and'); 
    lines.push('name both options and why you chose, in your summary. Switching silently is how');
    lines.push('a loop wanders and nobody can follow it in the morning.');
    lines.push('');
  }
  if (blockedOnHuman.length) {
    lines.push('Waiting on a person — this cannot be resolved by this run. Do NOT approve, close');
    lines.push('or work around any of these; report them and move on:');
    for (const r of blockedOnHuman.slice(0, limit)) lines.push(`  · ${r.id} — ${r.title} (${r.days}d)`);
    const rest = blockedOnHuman.length - Math.min(limit, blockedOnHuman.length);
    if (rest) lines.push(`  · …and ${rest} more`);
  }
  return { state: 'work', actionable: shown, blockedOnHuman, text: lines.join('\n') };
}
