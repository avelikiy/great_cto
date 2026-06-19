// scripts/judge-validate.mjs — qualify a candidate (cheap/open) judge before it replaces
// the current (frontier) judge in production scoring. The runtime other-half of ADR-004.
//
// ADR-004 rule: switch to the cheap judge ONLY on parity-or-better at lower cost. "Parity"
// here means: on the eval golden-set (holdout split), the candidate judge regresses on NO
// eval vs the current judge and clears every eval's own threshold. This reuses the eval-gate
// promotion logic — the variable is the JUDGE MODEL, not the prompt.
//
// Run the eval set twice (tests/eval/runner.mjs) — once with the current judge, once with the
// candidate — then:
//   node scripts/judge-validate.mjs --current current.jsonl --candidate candidate.jsonl [--epsilon 0.02]
//
// Exit 0 = PROMOTE the candidate judge; exit 1 = REJECT (keep the current judge).

import { readFileSync } from 'node:fs';
import { parseResultsJsonl, evaluateGate } from './eval-gate.mjs';

/**
 * Qualify a candidate judge vs the current judge on the holdout split.
 * @returns {{promote:boolean, verdict:string, detail:object}}
 */
export function qualifyJudge(currentRows, candidateRows, opts = {}) {
  const g = evaluateGate(currentRows, candidateRows, { split: 'holdout', epsilon: opts.epsilon ?? 0 });
  const verdict = g.pass
    ? `PROMOTE — candidate judge matches-or-beats the current judge on the holdout set (${g.improvements.length} improvement(s)); switch for the cost win.`
    : `REJECT — candidate judge ${g.regressions.length} regression(s), ${g.belowThreshold.length} below-threshold; keep the current judge.`;
  return { promote: g.pass, verdict, detail: g };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  const cur = arg('--current'), cand = arg('--candidate');
  if (!cur || !cand) {
    console.error('Usage: node scripts/judge-validate.mjs --current <jsonl> --candidate <jsonl> [--epsilon N]');
    process.exit(2);
  }
  const epsilon = Number(arg('--epsilon')) || 0;
  const r = qualifyJudge(
    parseResultsJsonl(readFileSync(cur, 'utf8')),
    parseResultsJsonl(readFileSync(cand, 'utf8')),
    { epsilon },
  );
  process.stdout.write(`${r.verdict}\n${r.detail.summary}\n`);
  process.exit(r.promote ? 0 : 1);
}
