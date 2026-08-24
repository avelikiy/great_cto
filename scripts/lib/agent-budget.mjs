// Per-agent spending limits, and the one rule that keeps them honest.
//
// A limit that fires on a number nobody measured is worse than no limit: work
// stops, the operator is told an agent has spent $52 of its $50, and the $52 was
// derived from how long the agent ran multiplied by a hardcoded rate. This
// repository already carries that distinction in its cost model —
// `agents_cost[].cost_source` is `'estimate'` unless verdicts carry real token
// spend, and `real_llm_usd` is deleted rather than zeroed when there is none.
//
// So the states are four, not two:
//
//   no-limit    nothing was declared for this agent — say so, do not invent one
//   within      MEASURED spend is under the cap
//   exceeded    MEASURED spend is over the cap — the only state that may refuse
//   unmeasured  a cap exists and there is no verdict cost data to judge it by
//
// `unmeasured` never refuses. It reports the estimate, labelled as an estimate,
// and the caller decides. That is the same shape as `proof-status.mjs`
// (passed / failed / not_run / inconclusive) and for the same reason: a check
// that could not run must not return the answer of one that ran.
//
// Declared in the project's own PROJECT.md, next to `monthly-budget`:
//
//   agent-budgets:
//     senior-dev: $50
//     architect: $20
//     product-owner: $5

/** Dollars from `$50`, `50`, `$1,250.50`. Returns null for anything else. */
function parseUsd(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Read the `agent-budgets:` block out of a PROJECT.md.
 *
 * The block is a key with indented `agent: $amount` lines beneath it — the rest
 * of the file is flat `key: value`, and a flat key per agent would collide with
 * every other setting the moment an agent is called `phase` or `stack`.
 *
 * @returns {{budgets: Map<string, number>, malformed: Array<{line: string, why: string}>}}
 *   Malformed lines are RETURNED, not dropped. A budget the operator wrote and
 *   this parser silently ignored is a limit they believe they have.
 */
export function parseAgentBudgets(text) {
  const budgets = new Map();
  const malformed = [];
  if (!text) return { budgets, malformed };

  const lines = String(text).split('\n');
  const start = lines.findIndex((l) => /^agent-budgets:\s*$/.test(l));
  if (start < 0) return { budgets, malformed };

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;              // dedent ends the block
    if (!line.trim()) continue;
    const m = line.match(/^\s+([a-z0-9][a-z0-9-]*)\s*:\s*(.+?)\s*$/i);
    if (!m) { malformed.push({ line: line.trim(), why: 'not `agent: amount`' }); continue; }
    const usd = parseUsd(m[2]);
    if (usd == null) { malformed.push({ line: line.trim(), why: `\`${m[2]}\` is not a dollar amount` }); continue; }
    budgets.set(m[1].toLowerCase(), usd);
  }
  return { budgets, malformed };
}

/**
 * Judge one agent against its limit.
 *
 * @param {object} a
 * @param {string} a.agent
 * @param {Map<string, number>} a.budgets
 * @param {object} [a.spend] One entry from metrics' `agents_cost`:
 *   `{ llm_usd, real_llm_usd?, cost_source }`. `real_llm_usd` is ABSENT rather
 *   than 0 when nothing was measured — that absence is the whole signal here.
 * @returns {{state: 'no-limit'|'within'|'exceeded'|'unmeasured', limitUsd: number|null,
 *            measuredUsd: number|null, estimateUsd: number|null, pct: number|null, why: string}}
 */
export function judgeAgentBudget({ agent, budgets, spend }) {
  const limitUsd = budgets?.get?.(String(agent || '').toLowerCase()) ?? null;
  const estimateUsd = Number.isFinite(spend?.llm_usd) ? spend.llm_usd : null;

  if (limitUsd == null) {
    return { state: 'no-limit', limitUsd: null, measuredUsd: null, estimateUsd, pct: null,
      why: `no budget declared for ${agent}` };
  }

  // Measured means it came from verdicts. `real_llm_usd` is deleted when zero,
  // so `!= null` is the test — `> 0` would read a genuine measured zero as
  // "never measured", which is the confusion this whole module exists to avoid.
  const measuredUsd = spend?.real_llm_usd != null ? spend.real_llm_usd : null;
  if (measuredUsd == null) {
    return { state: 'unmeasured', limitUsd, measuredUsd: null, estimateUsd, pct: null,
      why: `${agent} has a $${limitUsd} budget and no verdict cost data to judge it by`
         + (estimateUsd != null ? ` — the $${estimateUsd.toFixed(2)} shown is a time-based estimate, not spend` : '') };
  }

  const pct = Math.round((measuredUsd / limitUsd) * 100);
  return measuredUsd > limitUsd
    ? { state: 'exceeded', limitUsd, measuredUsd, estimateUsd, pct,
        why: `${agent} has spent $${measuredUsd.toFixed(2)} of its $${limitUsd} budget (${pct}%), measured from verdicts` }
    : { state: 'within', limitUsd, measuredUsd, estimateUsd, pct,
        why: `${agent} has spent $${measuredUsd.toFixed(2)} of $${limitUsd} (${pct}%)` };
}

/**
 * May this agent be dispatched?
 *
 * The ONLY state that refuses is `exceeded`, and `exceeded` is reachable only
 * from measured spend. Everything else proceeds, because the alternative is
 * halting a pipeline on arithmetic over a rate constant.
 */
export function budgetAllowsDispatch(verdict) {
  return verdict?.state !== 'exceeded';
}
