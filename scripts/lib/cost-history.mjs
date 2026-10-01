/**
 * The one reader of `.great_cto/cost-history.log`.
 *
 * Three writers put rows in that file, and the rows mean different things:
 *
 *   `<ts> <agent> <usd>`                      one run — log-verdict.sh
 *   `<ts> <agent> <usd> turns=N … model=…`    one run — subagent-stop-completion,
 *                                             measured from the agent's OWN
 *                                             transcript (every row since 2026-09-11)
 *   `<ts> <agent> <usd> turns=N`              the SESSION's running total —
 *                                             subagent-stop-completion on a legacy
 *                                             host, and its `(unattributed)` rows
 *
 * Readers used to carry their own rules and each got one wrong. cost-guard looked
 * for `cost_usd=N`, which no writer emits, so every daily and monthly cap compared
 * against $0 and could never fire. The summing readers treated every `turns=` row
 * as a running total, so two runs of the same agent counted as the second minus
 * the first. Before that, adding running totals together over-counted 23x.
 *
 * A running total contributes its INCREMENT; a reading below the previous one is
 * a new session (counter reset), not a refund, and counts in full. Each agent
 * keeps its own running total. A per-run row always counts in full.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Every row that carries a cost, with the dollars it CONTRIBUTES.
 * @param {string|null|undefined} text
 * @returns {{ts: string, date: string|null, agent: string, usd: number}[]}
 */
export function costRows(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  const running = new Map();   // agent → last running-total reading
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const usd = Number(parts[2]);
    if (parts[2] === '' || !Number.isFinite(usd)) continue;
    const fields = parts.slice(3);
    const runningTotal = fields.some((p) => p.startsWith('turns='))
      && !fields.some((p) => p.startsWith('model='));
    let contributes = usd;
    if (runningTotal) {
      const prev = running.get(parts[1]);
      contributes = prev === undefined || usd < prev ? usd : usd - prev;
      running.set(parts[1], usd);
    }
    const d = /^(\d{4}-\d{2}-\d{2})/.exec(parts[0]);
    out.push({ ts: parts[0], date: d ? d[1] : null, agent: parts[1], usd: contributes });
  }
  return out;
}

/** Total spend in the log. @returns {{sum: number, rows: number}} */
export function sumCostHistory(text) {
  const rows = costRows(text);
  return { sum: round2(rows.reduce((s, r) => s + r.usd, 0)), rows: rows.length };
}

/**
 * Spend today, this month and in total — UTC dates, as the log's timestamps are.
 * @returns {{spentToday: number, spentMonth: number, spentAll: number}}
 */
export function spendWindows(text, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let spentToday = 0, spentMonth = 0, spentAll = 0;
  for (const r of costRows(text)) {
    spentAll += r.usd;
    if (!r.date) continue;
    if (r.date === today) spentToday += r.usd;
    if (r.date.startsWith(month)) spentMonth += r.usd;
  }
  return { spentToday: round2(spentToday), spentMonth: round2(spentMonth), spentAll: round2(spentAll) };
}

// CLI — for the commands that print spend (/start, /digest):
//   node cost-history.mjs today|month|all [log]   → "12.34"
//   node cost-history.mjs --json [log]            → {"spentToday":…,"spentMonth":…,"spentAll":…}
// A missing log is $0.00: nothing recorded is nothing spent, as far as the log knows.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { readFileSync, existsSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const which = args.find((a) => ['today', 'month', 'all', '--json'].includes(a)) || '--json';
  const file = args.find((a) => !['today', 'month', 'all', '--json'].includes(a)) || '.great_cto/cost-history.log';
  const w = spendWindows(existsSync(file) ? readFileSync(file, 'utf8') : '');
  const pick = { today: w.spentToday, month: w.spentMonth, all: w.spentAll }[which];
  console.log(which === '--json' ? JSON.stringify(w) : pick.toFixed(2));
}
