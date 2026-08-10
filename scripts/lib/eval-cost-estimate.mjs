// What a run will cost, from what runs have cost.
//
// Why this exists
// ---------------
// `scheduled-evals-drift.yml` runs the holdout set at `--samples 3
// --judge-votes 3`. Nobody had priced it, because it never executed — GitHub
// Actions has been failing at the billing layer for weeks, so the schedule was
// inert and the number was never felt. The history says $0.62 per eval at three
// samples across 75 holdout evals: about $47 a run, $200 a month for a weekly
// job. That is not a default anybody should discover from an invoice.
//
// So the local loop prices the run and stops, the way infra-provisioner does
// before it creates anything. ADR-009 calls for a human wherever an operation
// costs money; a scheduler that spends $47 without being asked is that
// operation, whether or not a gate happens to sit next to it.
//
// The estimate is from THIS project's own history rather than a model price
// list: the same eval costs differently depending on how much of the agent's
// prompt it expands, and the runs already recorded know that and a price list
// does not.

/**
 * Price a run from recorded runs of the same shape.
 *
 * Confidence is reported rather than smoothed away. An estimate from four rows
 * and an estimate from two hundred are different objects, and a caller that
 * shows a dollar figure without saying which one it has is inviting the reader
 * to trust arithmetic that has not earned it.
 *
 * @param {object} o
 *   rows     parsed history rows: {eval, split, samples, costUsd}
 *   split    which split is being run
 *   samples  samples per case for the planned run
 *   evals    how many eval files the run will cover (default: distinct in history)
 * @returns {{usd:number|null, perEval:number|null, evals:number, basis:number,
 *            confidence:'none'|'weak'|'fair'|'good', why:string}}
 */
export function estimateRun({ rows = [], split = null, samples = 1, evals = null } = {}) {
  const shaped = rows.filter((r) =>
    (split === null || r.split === split) &&
    Number(r.samples || 1) === Number(samples) &&
    typeof r.costUsd === 'number' && r.costUsd >= 0);

  const count = evals ?? new Set(rows.filter((r) => split === null || r.split === split).map((r) => r.eval)).size;

  if (!shaped.length) {
    // Never priced at this shape. Say so — an unpriced run reported as $0 is the
    // same defect as an unmeasured signal reported as quiet.
    return {
      usd: null, perEval: null, evals: count, basis: 0, confidence: 'none',
      why: `no recorded run at split=${split ?? 'any'} samples=${samples} — this shape has never been priced`,
    };
  }

  const perEval = shaped.reduce((a, r) => a + r.costUsd, 0) / shaped.length;
  const confidence = shaped.length >= 50 ? 'good' : shaped.length >= 15 ? 'fair' : 'weak';
  return {
    usd: Number((perEval * count).toFixed(2)),
    perEval: Number(perEval.toFixed(4)),
    evals: count,
    basis: shaped.length,
    confidence,
    why: `${shaped.length} recorded eval-run(s) at split=${split ?? 'any'} samples=${samples}`,
  };
}

/** One line a human can act on. */
export function costLine(est) {
  if (est.usd === null) return `cost: unknown — ${est.why}`;
  return `cost: ~$${est.usd.toFixed(2)} (${est.evals} evals x $${est.perEval.toFixed(4)}), `
    + `confidence ${est.confidence} from ${est.basis} run(s)`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { parseEvalHistory } = await import('./eval-drift.mjs');

  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
  const HISTORY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'eval', 'results-history.jsonl');
  if (!existsSync(HISTORY)) { console.log('cost: unknown — no results-history.jsonl yet'); process.exit(0); }

  // parseEvalHistory keeps split/samples but not cost, so read cost here.
  const rows = [];
  for (const line of readFileSync(HISTORY, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o?.eval) rows.push({ eval: o.eval, split: o.split ?? null, samples: Number(o.samples) || 1, costUsd: o.costUsd });
    } catch { /* skip */ }
  }
  const est = estimateRun({ rows, split: arg('--split', 'holdout'), samples: Number(arg('--samples', 3)) });
  console.log(process.argv.includes('--json') ? JSON.stringify(est) : costLine(est));
}
