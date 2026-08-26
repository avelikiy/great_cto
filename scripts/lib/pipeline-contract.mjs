#!/usr/bin/env node
/**
 * pipeline-contract — which stages declare what they produce, and which do not.
 *
 * The gap, measured rather than supposed: of seven scored runs on this
 * repository, THREE came back `unverifiable`. Not "the check failed" — there was
 * nothing to check. `senior-dev`, `qa-engineer` and `code-reviewer` name no
 * artefact in their verdicts, so `independent-verify` had no claim to test, and a
 * stage that declares nothing was the cheapest way to pass verification.
 *
 * `produces` in shared/pipeline.toml is the declaration. This is the thing that
 * counts them, because a declaration nobody tallies is a suggestion — that has
 * been the recurring defect: `ask_kimi` declared by 19 agents and invoked by
 * none, `acceptance-verify` with no caller, two CSS checkers pointed at nothing.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not fail the build for a missing contract, and that is deliberate. Not
 * every stage has one worth writing: `l3-support.INCIDENT` routes an incident and
 * produces a decision, not a document. Failing on absence would push people to
 * invent contracts to silence the check, and an invented contract is worse than
 * none — it makes `independent-verify` reject work for not producing something
 * nobody actually wanted.
 *
 * So it reports, and returns a non-zero exit only for a contract that is
 * BROKEN — declared and unparseable. Coverage is a number the operator watches,
 * not a gate that fires.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parsePipelineToml } from '../hooks/pipeline-dispatcher.mjs';

/**
 * @returns {{declared: Array, undeclared: Array, broken: Array, total: number}}
 *   declared   — stage names a non-empty `produces`
 *   undeclared — stage exists, says nothing about its output
 *   broken     — `produces` is present but not a usable list of keys
 */
export function contractCoverage(text) {
  const map = parsePipelineToml(text);
  const declared = [], undeclared = [], broken = [];
  for (const [stage, rule] of Object.entries(map)) {
    const p = rule.produces;
    if (p === undefined) { undeclared.push(stage); continue; }
    if (!Array.isArray(p) || !p.length || p.some((k) => typeof k !== 'string' || !k.trim())) {
      broken.push({ stage, produces: p });
      continue;
    }
    declared.push({ stage, produces: p });
  }
  return { declared, undeclared, broken, total: Object.keys(map).length };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/pipeline-contract.mjs [path/to/pipeline.toml]
//
// Exit 0 = nothing broken (undeclared stages are reported, not failed).
// Exit 1 = a `produces` exists and cannot be read.
// Exit 2 = no map to read.

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv.find((a, i) => i > 1 && !a.startsWith('--'))
    || path.join(process.cwd(), 'shared', 'pipeline.toml');
  if (!existsSync(file)) {
    console.error(`  no pipeline map at ${file}`);
    process.exit(2);
  }

  const r = contractCoverage(readFileSync(file, 'utf8'));
  const pct = r.total ? Math.round((r.declared.length / r.total) * 100) : 0;

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.broken.length ? 1 : 0);
  }

  console.log(`  ${path.basename(file)}: ${r.declared.length} of ${r.total} stage(s) declare an output contract (${pct}%)`);
  for (const d of r.declared) console.log(`    ✓ ${d.stage} → ${d.produces.join(', ')}`);
  if (r.undeclared.length) {
    console.log(`\n  ${r.undeclared.length} stage(s) declare nothing — their runs cannot be verified against a contract:`);
    console.log(`    ${r.undeclared.join(', ')}`);
    console.log(`\n  Not a failure. Some stages produce a decision rather than a document, and a`);
    console.log(`  contract invented to silence this check would make verification reject work`);
    console.log(`  for not producing something nobody wanted.`);
  }
  if (r.broken.length) {
    console.error(`\n  ${r.broken.length} stage(s) declare a \`produces\` that cannot be read:`);
    for (const b of r.broken) console.error(`    ✗ ${b.stage}: ${JSON.stringify(b.produces)}`);
    process.exit(1);
  }
  process.exit(0);
}
