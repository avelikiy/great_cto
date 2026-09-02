/**
 * Should the morning digest speak today?
 *
 * The daily digest skipped a day on which nothing happened — no spend, nothing
 * shipped, no gate, nothing blocked — and sent otherwise. So a project with one
 * gate open for 26 days sent "$0.00 AI · 0 shipped · 🔒 1 gate awaiting
 * approval" every morning for 26 mornings. Measured on the author's machine:
 * 31 of the last 44 digests repeated the previous day's state exactly, and the
 * two P0s in the same feed were buried under them.
 *
 * Two reasons not to speak, and they are different things:
 *
 *   nothing-happened   nothing moved AND nothing is open. Silence is right.
 *   unchanged-state    nothing moved AND what is open is exactly what was
 *                      reported yesterday. The operator has already read this
 *                      sentence. A reminder is a different feature with a
 *                      different cadence — see waiting-on-you — not a digest.
 *
 * And three states of "what was reported yesterday", because the record is on
 * disk and disks are lossy:
 *
 *   null        no record. NOT "unchanged" — a comparison nobody could make is
 *               not a match. Send, once, and record.
 *   equal       reported already. Suppress.
 *   different   the world moved even though the numbers did not. Send.
 *
 * Activity always speaks: money was spent or work shipped, and a digest of
 * that is the feature.
 */

export function digestState({ gates = 0, blocked = 0 } = {}) {
  return `gates:${Number(gates) || 0}|blocked:${Number(blocked) || 0}`;
}

/**
 * @returns {{ send: boolean, reason: 'nothing-happened'|'unchanged-state'|'activity'|'first-report'|'state-changed', state: string }}
 */
export function digestDecision({ ySpend = 0, doneYesterday = 0, blocked = 0, gates = 0, prevState = null } = {}) {
  const state = digestState({ gates, blocked });
  const moved = (Number(ySpend) || 0) > 0 || (Number(doneYesterday) || 0) > 0;
  const open = (Number(gates) || 0) > 0 || (Number(blocked) || 0) > 0;

  if (moved) return { send: true, reason: 'activity', state };
  if (!open) return { send: false, reason: 'nothing-happened', state };
  if (prevState == null) return { send: true, reason: 'first-report', state };
  if (prevState === state) return { send: false, reason: 'unchanged-state', state };
  return { send: true, reason: 'state-changed', state };
}
