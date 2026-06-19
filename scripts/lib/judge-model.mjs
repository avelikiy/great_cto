// scripts/lib/judge-model.mjs — runtime judge-model router (ADR-004).
//
// The cost-of-error axis from ADR-004: a judge/eval/scorer grading a T0/T1 (reversible,
// CI-checked) change runs a CHEAP model — a wrong "looks good" is cheap there. On a T2
// (irreversible / regulated / prod-deploy) change the judge runs the FRONTIER model AND
// the human is in the loop, because a false-APPROVED carries liability.
//
// The cheap-judge id is env-pluggable (GREAT_CTO_JUDGE_MODEL) so a fine-tuned open judge
// (Qwen-class — matches frontier at ~100x lower cost per the 2026-06 result) can replace
// the default without a code change, once qualified by scripts/judge-validate.mjs.
//
// Pairs with change-tier.mjs (the tier) + gate-plan.mjs (per-change plan) + ADR-004.

export const DEFAULT_FRONTIER_JUDGE = 'claude-opus-4-8';
export const DEFAULT_CHEAP_JUDGE = 'claude-haiku-4-5';

/**
 * Pick the judge model for a change of the given tier.
 * @param {('T0'|'T1'|'T2')} changeTier
 * @param {{cheapModel?:string, frontierModel?:string}} [opts]
 * @returns {{model:string, tier:string, human:boolean, reason:string}}
 */
export function selectJudgeModel(changeTier, opts = {}) {
  const cheap = opts.cheapModel || process.env.GREAT_CTO_JUDGE_MODEL || DEFAULT_CHEAP_JUDGE;
  const frontier = opts.frontierModel || DEFAULT_FRONTIER_JUDGE;

  // Fail-safe: an unknown tier is treated as T2 (frontier + human) — never silently cheap.
  const tier = (changeTier === 'T0' || changeTier === 'T1') ? changeTier : 'T2';

  if (tier === 'T2') {
    return { model: frontier, tier, human: true,
      reason: 'T2 (irreversible/regulated) — frontier judge + human gate; a false-APPROVED carries liability' };
  }
  return { model: cheap, tier, human: false,
    reason: `${tier} (reversible) — cheap judge; CI + tests are the safety net` };
}

// CLI: node scripts/lib/judge-model.mjs T1  → prints the model + reason
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = selectJudgeModel(process.argv[2]);
  process.stdout.write(`${r.tier}  model=${r.model}  human=${r.human}\n  ${r.reason}\n`);
}
