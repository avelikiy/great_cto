#!/usr/bin/env node
/**
 * improve-loop — what a failing eval is asking for, and in which order to ask.
 *
 * Why this exists
 * ---------------
 * On 2026-08-06 one devops instruction was rewritten four times. The holdout went
 * 5/20 → 11 → 12 → 11 → 10. About $41 of a $43 campaign was spent before the
 * measurement told the truth, and $1.50 after. Four of the six repairs were to
 * the harness, not the agent:
 *
 *   the actor's answer was not stored, so nobody could see the instruction
 *   appeared in 4 of 22 answers — the wording was never the variable;
 *
 *   `agents/_shared/*` was unreachable, so forty of sixty-nine agents were being
 *   judged without half their contract;
 *
 *   a truncated run reported a rate, so 402s read as a score;
 *
 *   power read only the last sample, discarding half the paid observations and
 *   then calling the result underpowered.
 *
 * Every one of those looked like an agent that needed a better prompt. So the
 * order of questions IS the tool. Each has an answer that stops the loop, and
 * "edit the prompt" is the last one, not the first.
 *
 * The improver's blind spot
 * -------------------------
 * When the holdout was doubled, devops scored 78% on the twenty cases whose
 * failures had been read while writing the fixes and 40% on twenty fresh ones.
 * That is the improver overfitting, not the agent. So a diagnosis is computed
 * from the TUNING split; the holdout returns a number and never a reason.
 *
 * What it may never touch
 * -----------------------
 * An optimiser with write access to its own ruler optimises the ruler, and the
 * natural response to a failing eval is to soften the criterion until it passes.
 * `judge-agreement.mjs` was written on 2026-08-03 because that happened three
 * times in one session.
 */

import { shapeOf } from './run-shape.mjs';
import { adherence } from './adherence.mjs';

/**
 * Paths a prompt-improving agent may not write. Not a lint rule — the reason the
 * loop can be trusted at all.
 */
export const OFF_LIMITS = Object.freeze([
  'tests/eval/EVAL-',            // the cases and their thresholds
  'tests/eval/dags/',            // the judge's questions
  'scripts/lib/run-shape.mjs',   // the fixture-vs-agent verdict
  'scripts/lib/eval-power.mjs',  // the interval and the dropout rule
  'scripts/lib/adherence.mjs',   // whether the instruction fired
  'scripts/lib/judge-agreement.mjs',
]);

export function writesOffLimits(paths) {
  return (paths || []).filter((p) => OFF_LIMITS.some((o) => String(p).includes(o)));
}

/**
 * The next question this run answers, and what it asks for.
 *
 * @param {object} run   a results-history row: {eval, passed, judged, threshold,
 *                       power, dropout, caseResults, adherence}
 * @returns {{action, why, next, stop:boolean}}
 *   action: 'not-measured' | 'underpowered' | 'harness' | 'structural' | 'content' | 'none'
 *   stop:   true when this is NOT a prompt problem and the loop must not propose one
 */
export function diagnose(run, { marker = null } = {}) {
  const name = run?.eval ?? '(unnamed)';

  // 1. Did the run happen? A rate over the cases that ran is not a rate.
  if (run?.dropout?.severe) {
    return {
      action: 'not-measured', stop: true, name,
      why: run.dropout.why || 'the run was truncated',
      next: 'Fix the cause and re-run. Raising samples measures the same truncation twice.',
    };
  }

  // 2. Is the result conclusive? An interval spanning the bar settled nothing,
  //    and a prompt edit judged against it is a coin flip with a commit message.
  //
  //    A MISSING verdict is not a failing one. Most rows written before power was
  //    persisted carry no status at all, and falling through on them proposed
  //    content edits for 74 evals on the first run of this tool — including ones
  //    that had passed. An unknown does not become an actionable claim here any
  //    more than it does anywhere else in this pipeline.
  const status = run?.power?.status;
  if (status !== 'failed' && status !== 'inconclusive' && status !== 'passed') {
    return {
      action: 'not-measured', stop: true, name,
      why: 'this run carries no power verdict, so whether it failed was never established',
      next: 'Re-run it. A row without an interval is not a failing row.',
    };
  }
  if (status === 'inconclusive') {
    return {
      action: 'underpowered', stop: true, name,
      why: run.power.why || 'the interval spans the bar',
      next: 'Raise --samples or add cases. Do not edit a prompt against a number this run did not establish.',
    };
  }
  if (status === 'passed') {
    return { action: 'none', stop: true, name, why: 'the interval clears the bar', next: 'Nothing to do.' };
  }

  // 3. Is it the fixture? Three times a low score was read as an agent gap and
  //    was the harness.
  const shape = shapeOf({ caseResults: run?.caseResults ?? [] });
  if (shape.verdict === 'fixture') {
    return {
      action: 'harness', stop: true, name,
      why: shape.summary,
      next: 'File a harness bug against the fixture. Do NOT touch the prompt — a score cannot show this, and the last three times it was the harness.',
    };
  }

  // 4. Did the instruction reach the answer? Four rewordings moved nothing
  //    because it appeared in 4 of 22 answers.
  const adh = run?.adherence ?? (marker ? adherence(run?.caseResults ?? [], marker) : null);
  if (adh && adh.verdict === 'not-firing') {
    return {
      action: 'structural', stop: false, name, adherence: adh,
      why: adh.why,
      next: 'Remove whatever gates the instruction — a condition the agent must notice, or a pointer it must follow. Do not reword it; no phrasing changes what is absent.',
    };
  }
  if (adh && adh.verdict === 'unknown') {
    return {
      action: 'not-measured', stop: true, name,
      why: 'no answers were stored, so whether the instruction fired is unknown',
      next: 'Re-run with answers recorded before proposing anything.',
    };
  }

  // 5. It arrives and is wrong. Only now is wording the question.
  return {
    action: 'content', stop: false, name, adherence: adh, shape,
    why: adh ? adh.why : `${shape.failed} failure(s), no dominant terminal state — this reads as the agent`,
    next: 'The instruction fires and produces the wrong answer. A content change is the right move; propose one candidate and A/B it on the TUNING split only.',
  };
}

/**
 * The whole set, with the loop's own rule about what it may act on.
 *
 * `stop: true` diagnoses are reported and never turned into candidates: they are
 * work for a human or for the harness, and a loop that proposes a prompt edit for
 * a truncated run is the loop repeating this repo's own most expensive mistake.
 */
export function planFromRuns(runs, opts) {
  const diagnoses = (runs || []).map((r) => diagnose(r, opts));
  return {
    diagnoses,
    actionable: diagnoses.filter((d) => !d.stop && d.action !== 'none'),
    blocked: diagnoses.filter((d) => d.stop && d.action !== 'none'),
  };
}

export function explainPlan(plan) {
  const lines = [];
  if (plan.actionable.length) {
    lines.push(`${plan.actionable.length} candidate(s) to propose:`);
    for (const d of plan.actionable) lines.push(`  [${d.action}] ${d.name} — ${d.next}`);
  }
  if (plan.blocked.length) {
    if (lines.length) lines.push('');
    // "not acted on", not "failing": most of these were never established as
    // failures at all, which is exactly why the loop leaves them alone.
    lines.push(`${plan.blocked.length} eval(s) the loop will NOT act on:`);
    for (const d of plan.blocked) lines.push(`  [${d.action}] ${d.name} — ${d.why}`);
  }
  if (!lines.length) return 'improve-loop: nothing conclusive to act on.';
  lines.push('');
  lines.push('Candidates are A/B\'d on the TUNING split. The holdout returns a number and never a reason —');
  lines.push('reading its failures is what turned a holdout into tuning data and produced a 78%/40% split.');
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/improve-loop.mjs           # what the newest runs are asking for
//   node scripts/lib/improve-loop.mjs --json
//
// Reads the eval history and reports. It proposes nothing by itself and edits
// nothing at all — what turns a candidate into a commit is a human, and the
// holdout that judges it is read by neither.

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const hist = join(root, 'tests', 'eval', 'results-history.jsonl');

  let rows;
  try {
    rows = readFileSync(hist, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (e) { console.error(`improve-loop: cannot read ${hist}: ${e.message}`); return 2; }

  // Newest run per eval — an older row describes a prompt that no longer exists.
  const newest = new Map();
  for (const r of rows) if (r.eval) newest.set(r.eval, r);

  const plan = planFromRuns([...newest.values()]);
  if (argv.includes('--json')) { console.log(JSON.stringify(plan, null, 2)); return 0; }
  console.log(explainPlan(plan));
  return plan.actionable.length ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
