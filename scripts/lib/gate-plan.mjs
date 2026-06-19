// scripts/lib/gate-plan.mjs — compute the human gates that should open for THE
// CURRENT CHANGE, by composing the two pure pieces of the two-axis gate model:
//
//   classify(diff)            → change_tier (T0/T1/T2)       [scripts/lib/change-tier.mjs]
//   effectiveGates(arch,size,tier) → the gate set            [packages/cli/src/archetypes.ts]
//
// This is the runtime entry point the orchestrator (or a human) calls at the start
// of a change: "given what I'm touching, which gates actually open?". The static
// FLOW.md gate menu (compileFlow → gatesFor) is unchanged — it lists what a project
// CAN gate; this decides what THIS change DOES gate.
//
// CLI:
//   node scripts/lib/gate-plan.mjs                 classify the working-tree diff
//   node scripts/lib/gate-plan.mjs --base main     diff against a base ref
//   node scripts/lib/gate-plan.mjs --deploy production
//   node scripts/lib/gate-plan.mjs --label tier:t2 --json
//
// Plan: docs/plans/PLAN-2026-06-18-gate-tiering-reviewer-consolidation.md
// ADR:  docs/adr/ADR-003-two-axis-gate-model.md

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { classify } from './change-tier.mjs';
import { selectJudgeModel } from './judge-model.mjs';
// effectiveGates lives in the built CLI package (TS → dist).
import { effectiveGates } from '../../packages/cli/dist/archetypes.js';

/** Parse archetype + project_size out of a .great_cto/PROJECT.md body. */
export function parseProject(text) {
  const get = (k) => {
    const m = String(text).match(new RegExp(`^${k}:\\s*(\\S+)`, 'm'));
    return m ? m[1] : null;
  };
  return {
    archetype: get('archetype') ?? get('primary') ?? 'greenfield',
    size: get('project_size') ?? get('size') ?? 'medium',
  };
}

/**
 * Compose classify → effectiveGates for one change.
 * @returns {{tier:string, reasons:string[], escalatedFromLabel:(string|null), gates:string[]}}
 */
export function planGates({ archetype, size, changedFiles, connectors, deployTarget, labels }) {
  const c = classify({ changedFiles, connectors, deployTarget, labels });
  const gates = effectiveGates(archetype, size, c.tier);
  // ADR-004: the per-change plan also says which judge model to use (cheap on T0/T1,
  // frontier + human on T2). Same tier, two consequences — gates and judge.
  const judge = selectJudgeModel(c.tier);
  return { tier: c.tier, reasons: c.reasons, escalatedFromLabel: c.escalatedFromLabel, gates, judge };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function gitChangedFiles(base) {
  try {
    const args = base
      ? ['diff', '--name-only', `${base}...HEAD`]
      : ['diff', '--name-only', 'HEAD'];
    const out = execFileSync('git', args, { encoding: 'utf8' });
    const tracked = out.split('\n').map((s) => s.trim()).filter(Boolean);
    // include untracked files too (a new connector/migration not yet staged)
    const un = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
    return [...new Set([...tracked, ...un])];
  } catch {
    return [];
  }
}

function readProject() {
  for (const p of ['.great_cto/PROJECT.md', 'PROJECT.md']) {
    try { return parseProject(readFileSync(p, 'utf8')); } catch { /* next */ }
  }
  return { archetype: 'greenfield', size: 'medium' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const json = argv.includes('--json');
  const labels = argv.reduce((a, v, i) => (argv[i - 1] === '--label' ? [...a, v] : a), []);

  const { archetype, size } = readProject();
  const changedFiles = gitChangedFiles(opt('--base'));
  const result = planGates({
    archetype, size, changedFiles,
    deployTarget: opt('--deploy'),
    labels,
  });

  if (json) {
    process.stdout.write(`${JSON.stringify({ archetype, size, ...result }, null, 2)}\n`);
  } else {
    const esc = result.escalatedFromLabel ? `  (label ${result.escalatedFromLabel} overridden by T2 floor)` : '';
    process.stdout.write(
      `archetype=${archetype} size=${size}\n` +
      `tier=${result.tier}${esc}\n` +
      `reasons: ${result.reasons.join(', ')}\n` +
      `gates:   ${result.gates.length ? result.gates.join(', ') : '(none — CI is the gate)'}\n` +
      `judge:   ${result.judge.model}${result.judge.human ? ' + human' : ''}\n`,
    );
  }
}
