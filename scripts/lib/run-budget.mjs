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
 * Spend is the DIFFERENCE across the run, computed by `sumCostHistory` (./cost-history.mjs) — cost-history holds per-run
 * rows and session running totals, and adding the snapshots together over-counted
 * by 23x once already.
 */

import { sumCostHistory } from './cost-history.mjs';

/** Sum a cost-history log (rules in ./cost-history.mjs); null when there is no text. */
function total(text) {
  return typeof text === 'string' ? sumCostHistory(text).sum : null;
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
