/**
 * A ceiling on what one unattended run may spend.
 *
 * The nightly loop wakes at 02:00 and runs up to six iterations. It has a
 * stop-file and an iteration cap, and neither is a budget: six iterations of a
 * hard task cost more than sixty of an easy one. Nothing bounded the money.
 *
 * THE DECISION THAT MATTERS is what happens when spend cannot be MEASURED.
 * A budget that cannot fire is not a budget, so an unmeasurable spend against a
 * configured ceiling STOPS the run. Continuing would deliver "I could not check"
 * as "you are within budget" — the substitution this project exists to refuse,
 * and the one instance of it that costs money directly.
 *
 * With no ceiling configured, an unmeasurable spend does not stop anything:
 * nothing was promised, so nothing is broken, and stopping would punish a
 * configuration the operator never asked for.
 *
 * Spend is the DIFFERENCE across the run, computed with the increment rule that
 * `sumCostHistory` learned the hard way — cost-history holds per-run rows and
 * session running totals, and adding the snapshots together over-counted by 23x
 * once already.
 */

/** Sum a cost-history log, counting `turns=` rows by their increment. */
function total(text) {
  if (typeof text !== 'string') return null;
  let sum = 0;
  const running = new Map();
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const usd = Number(parts[2]);
    if (parts.length < 3 || !Number.isFinite(usd)) continue;
    if (!parts.slice(3).some((p) => p.startsWith('turns='))) { sum += usd; continue; }
    const prev = running.get(parts[1]);
    sum += prev === undefined || usd < prev ? usd : usd - prev;
    running.set(parts[1], usd);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * @param {{ceiling: number|null, before: string|null, after: string|null}} o
 * @returns {{state:'unbounded'|'within'|'exceeded'|'unmeasurable',
 *            spent:number|null, ceiling:number|null, stop:boolean, sentence:string}}
 */
export function runBudget({ ceiling, before, after }) {
  const a = total(before);
  const b = total(after);
  const measurable = a !== null && b !== null && b >= a;
  const spent = measurable ? Math.round((b - a) * 100) / 100 : null;

  if (ceiling === null || ceiling === undefined || !Number.isFinite(Number(ceiling))) {
    return {
      state: 'unbounded', spent, ceiling: null, stop: false,
      sentence: 'No ceiling is set for this run, so spend is unbounded. '
        + 'Set GREAT_CTO_RUN_BUDGET_USD to bound it.',
    };
  }

  if (!measurable) {
    // A log that SHRANK is not a refund — it was truncated or rotated between
    // reads, and a negative difference is a measurement that failed.
    return {
      state: 'unmeasurable', spent: null, ceiling: Number(ceiling), stop: true,
      sentence: `Spend for this run could not be measured, and a ceiling of $${ceiling} was set. `
        + 'Stopping: a budget that cannot fire is not a budget, and continuing would report '
        + '"could not check" as "within budget".',
    };
  }

  if (spent > Number(ceiling)) {
    return {
      state: 'exceeded', spent, ceiling: Number(ceiling), stop: true,
      sentence: `This run has spent $${spent.toFixed(2)} against a ceiling of $${ceiling}. Stopping.`,
    };
  }
  return {
    state: 'within', spent, ceiling: Number(ceiling), stop: false,
    sentence: `Run spend $${spent.toFixed(2)} of $${ceiling}.`,
  };
}
