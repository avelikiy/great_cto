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
  if (!text) return { budgets, malformed, deprecatedKey: null };

  // Two spellings. `agent-budget:` (singular) predates this module: the board
  // parsed it with its own inline regex in routes.mjs and only displayed it,
  // labelled "$X/run". I then added `agent-budgets:` (plural) with a second
  // parser and a different meaning, which is how a repository ends up with two
  // definitions of one concept differing by a letter — the exact drift the
  // dispatcher's own comment warns about.
  //
  // No project, template or document used the singular form, so consolidating
  // costs nothing. It is still accepted, and reported as deprecated, because a
  // config someone wrote must not stop working silently.
  const lines = String(text).split('\n');
  let start = lines.findIndex((l) => /^agent-budgets:\s*$/.test(l));
  let deprecatedKey = null;
  if (start < 0) {
    start = lines.findIndex((l) => /^agent-budget:\s*$/.test(l));
    if (start >= 0) deprecatedKey = 'agent-budget';
  }
  if (start < 0) return { budgets, malformed, deprecatedKey: null };

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
  return { budgets, malformed, deprecatedKey };
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

// ── Editing the declaration ─────────────────────────────────────────────────
//
// The board can set a cap, which means writing to a file the operator owns and
// git tracks. Two rules govern that, and both are about not surprising them:
//
//   1. Everything else in PROJECT.md survives byte for byte. These functions
//      touch the budget block and nothing around it.
//   2. The key already in the file wins. A project written with the deprecated
//      `agent-budget:` keeps it — silently rewriting somebody's config to a
//      different spelling while they asked for an unrelated change is the kind
//      of helpfulness that loses trust.

/** The block header this file uses, or null when it has none. */
function budgetKeyIn(text) {
  if (/^agent-budgets:\s*$/m.test(text)) return 'agent-budgets';
  if (/^agent-budget:\s*$/m.test(text)) return 'agent-budget';
  return null;
}

/**
 * Set or replace one agent's cap.
 *
 * @returns {{text: string, created: boolean, previousUsd: number|null}}
 *   `created` is true when the block did not exist and was appended.
 * @throws when `limitUsd` is not a positive number — a cap of zero or NaN would
 *   hold every dispatch of that agent forever, and an accident should not be
 *   able to do that.
 */
export function upsertAgentBudget(text, agent, limitUsd) {
  const slug = String(agent || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`not an agent slug: ${agent}`);
  const usd = Number(limitUsd);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error(`cap must be a positive number, got: ${limitUsd}`);

  const before = parseAgentBudgets(text).budgets.get(slug) ?? null;
  const key = budgetKeyIn(text);
  const line = `  ${slug}: $${usd}`;

  if (!key) {
    const sep = text.endsWith('\n') ? '' : '\n';
    return { text: `${text}${sep}agent-budgets:\n${line}\n`, created: true, previousUsd: null };
  }

  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l));
  // The block ends at a dedent OR a blank line. A blank is not a dedent — it
  // starts with no non-space character — so scanning only for `^\S` walked past
  // the gap at the end of the file and inserted the new cap below it, leaving a
  // block split by an empty line. The parser tolerates that; a person reading
  // their own PROJECT.md should not have to.
  let end = start + 1;
  while (end < lines.length && lines[end].trim() && !/^\S/.test(lines[end])) end++;

  const existing = lines.slice(start + 1, end)
    .findIndex((l) => new RegExp(`^\\s+${slug}\\s*:`, 'i').test(l));
  if (existing >= 0) lines[start + 1 + existing] = line;
  else lines.splice(end, 0, line);

  return { text: lines.join('\n'), created: false, previousUsd: before };
}

/**
 * Remove one agent's cap.
 *
 * @returns {{text: string, removed: boolean, previousUsd: number|null}}
 *   `removed: false` when the agent had no cap — the caller must be able to tell
 *   "there is now no limit" from "there never was one".
 */
export function removeAgentBudget(text, agent) {
  const slug = String(agent || '').trim().toLowerCase();
  const before = parseAgentBudgets(text).budgets.get(slug) ?? null;
  const key = budgetKeyIn(text);
  if (!key || before == null) return { text, removed: false, previousUsd: null };

  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l));
  let end = start + 1;
  while (end < lines.length && lines[end].trim() && !/^\S/.test(lines[end])) end++;

  const kept = lines.slice(start + 1, end)
    .filter((l) => !new RegExp(`^\\s+${slug}\\s*:`, 'i').test(l));

  // An empty block is removed with its header. A bare `agent-budgets:` reads as
  // a declaration that produced no limits, which is a different and confusing
  // thing from having none.
  const replacement = kept.some((l) => l.trim()) ? [lines[start], ...kept] : [];
  lines.splice(start, end - start, ...replacement);
  return { text: lines.join('\n'), removed: true, previousUsd: before };
}
