// scripts/lib/quality.mjs — unified product-quality verdict (QUALITY-DEEPEN #5).
//
// Runs all three quality lenses on a product and blends them into one verdict, so the
// pipeline has a single command/gate instead of three tools:
//   • floor    — product-score   (presence of quality machinery, static)
//   • ceiling  — product-eval    (executed: tests/typecheck/lint/audit/secrets)
//   • domain   — archetype-contracts (does the suite cover the dangerous domain paths)
// Optionally records the verdict to metrics-history for trend, and gates deploy.
//
// Usage:
//   node scripts/lib/quality.mjs <dir> [--archetype a] [--json] [--record] [--gate --min N]

import { existsSync, statSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreProduct, inspect, detectArchetype } from './product-score.mjs';
import { runEval, scoreExecution } from './product-eval.mjs';
import { checkContracts, readTestText } from './archetype-contracts.mjs';

/** Blend the three lenses → overall 0-100. ceiling weighted most (execution > shape);
 *  contracts dropped+renormalized when the archetype has none. */
export function combinedScore({ floor, ceiling, contracts }) {
  const parts = [{ k: 'floor', v: floor, w: 30 }, { k: 'ceiling', v: ceiling, w: 50 }];
  if (typeof contracts === 'number') parts.push({ k: 'domain', v: contracts, w: 20 });
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const overall = Math.round(parts.reduce((a, p) => a + (p.v * p.w / wsum), 0));
  return { overall, grade: grade(overall), weights: Object.fromEntries(parts.map(p => [p.k, round2(p.w / wsum)])) };
}
function round2(n) { return Math.round(n * 100) / 100; }
function grade(t) { return t >= 90 ? 'A' : t >= 75 ? 'B' : t >= 60 ? 'C' : t >= 45 ? 'D' : 'F'; }

/** Full assessment of a product dir across all three lenses. */
export function assess(dir, archetypeFlag = null) {
  const archetype = detectArchetype(dir, archetypeFlag);
  const floor = scoreProduct(inspect(dir, archetype), archetype).total;
  const ceiling = scoreExecution(runEval(dir)).total;
  const c = checkContracts(archetype, readTestText(dir));
  const contracts = c.coverage; // null when archetype has no contracts
  const combined = combinedScore({ floor, ceiling, contracts });
  return { archetype: archetype || 'web', floor, ceiling, contracts, contractDetail: c, ...combined };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';

function main(argv) {
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) { console.error('Usage: quality.mjs <dir> [--archetype a] [--json] [--record] [--gate --min N]'); process.exit(2); }
  const ai = argv.indexOf('--archetype');
  const r = assess(dir, ai > -1 ? argv[ai + 1] : null);

  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ dir, ...r }, null, 2)); }
  else {
    console.log(`Product quality — ${dir}  [${r.archetype}]`);
    console.log(`  floor (presence)   ${String(r.floor).padStart(3)}/100`);
    console.log(`  ceiling (executed) ${String(r.ceiling).padStart(3)}/100`);
    console.log(`  domain (contracts) ${r.contracts == null ? ' n/a' : String(r.contracts).padStart(3) + '/100'}`);
    console.log(`\n  OVERALL: ${r.overall}/100  (grade ${r.grade})`);
  }

  if (argv.includes('--record')) {
    try {
      appendFileSync(join(PROJ_DIR, 'metrics-history.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), key: `quality.${r.archetype}`, value: r.overall / 100, source: 'quality' }) + '\n');
      if (!argv.includes('--json')) console.log(`  recorded → ${PROJ_DIR}/metrics-history.jsonl`);
    } catch { /* ignore */ }
  }

  if (argv.includes('--gate')) {
    const gi = argv.indexOf('--min'); const min = gi > -1 ? parseFloat(argv[gi + 1]) : 70;
    if (r.overall < min) { console.error(`\ngate:quality BLOCK — overall ${r.overall} < min ${min}`); process.exit(1); }
    if (!argv.includes('--json')) console.log('\ngate:quality PASS');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
