#!/usr/bin/env node
// Reconstruct which pipeline stages already completed, from the verdict logs.
//
// Why: an interrupted run keeps its CODE (it is committed) but loses its PLACE.
// The resumed agent has no idea whether QA and security already ran, so it either
// redoes finished work or — worse — skips unfinished work and ships. That is not
// hypothetical: the `booking` benchmark product skipped QA and security after an
// interruption, needed a second resume to notice, and scored 58 (C).
//
// The workaround so far has been a human hand-writing "these stages are done,
// these remain" into every resume prompt. This derives it instead, from evidence
// the pipeline already writes: .great_cto/verdicts/<agent>.log.
//
// Usage:
//   node scripts/pipeline-state.mjs [dir] [--json]
import { getPipeline } from '../packages/board/lib/data-readers.mjs';

// The linear build pipeline. `reviewers`, `l3-support` and the human gate are
// real stages but not sequential build steps, so they are reported separately
// rather than driving "what comes next".
export const BUILD_ORDER = [
  'product-owner', 'architect', 'pm', 'senior-dev', 'qa-engineer', 'security-officer', 'devops',
];

// Stages a run must not finish without. These are the ones an interrupted resume
// silently skips, and the ones whose absence a scoring oracle cannot detect.
export const MANDATORY = ['qa-engineer', 'security-officer'];

/**
 * Reduce the board's stage records to what a resuming agent needs.
 * Pure — takes the stage array, returns a plain summary.
 */
export function summarizeStages(stages = []) {
  const by = new Map(stages.map(s => [s.stage, s]));
  const stateOf = (name) => (by.get(name) || {}).status || 'idle';

  const completed = BUILD_ORDER.filter(s => stateOf(s) === 'done');
  const failed = BUILD_ORDER.filter(s => stateOf(s) === 'failed');
  const active = BUILD_ORDER.filter(s => stateOf(s) === 'active');
  // First stage that is neither done nor currently running — where to pick up.
  const next = BUILD_ORDER.find(s => stateOf(s) !== 'done' && stateOf(s) !== 'active') || null;
  const remaining = BUILD_ORDER.filter(s => stateOf(s) !== 'done');
  const mandatoryMissing = MANDATORY.filter(s => stateOf(s) !== 'done');

  return { completed, failed, active, next, remaining, mandatoryMissing };
}

/** Human-readable block for embedding in a resume prompt. */
export function renderSummary(sum, stages = []) {
  const by = new Map(stages.map(s => [s.stage, s]));
  const withVerdict = (s) => {
    const v = (by.get(s) || {}).verdict;
    return v ? `${s} (${v})` : s;
  };
  const lines = [];
  lines.push('PIPELINE STATE — reconstructed from .great_cto/verdicts/, not guessed');
  lines.push(sum.completed.length
    ? `  completed : ${sum.completed.map(withVerdict).join(', ')}`
    : '  completed : (none — this run has not produced a terminal verdict yet)');
  if (sum.active.length) lines.push(`  in flight : ${sum.active.join(', ')}`);
  if (sum.failed.length) lines.push(`  FAILED    : ${sum.failed.map(withVerdict).join(', ')} — re-run before continuing`);
  lines.push(`  next      : ${sum.next || '(build stages all done)'}`);
  lines.push(`  remaining : ${sum.remaining.join(', ') || '(none)'}`);
  if (sum.mandatoryMissing.length) {
    lines.push(`  ⚠ MANDATORY, not yet done: ${sum.mandatoryMissing.join(', ')} — do not finish without these`);
  } else {
    lines.push('  ✓ mandatory stages (qa-engineer, security-officer) have terminal verdicts');
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find(a => !a.startsWith('--')) || process.cwd();
  const stages = getPipeline(dir);
  const sum = summarizeStages(stages);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ dir, ...sum }, null, 2) + '\n');
  } else {
    process.stdout.write(renderSummary(sum, stages) + '\n');
  }
  // Exit 3 when a mandatory stage is missing, so a shell caller can branch on it
  // without parsing text. 0 = safe to finish, 3 = unfinished mandatory work.
  process.exit(sum.mandatoryMissing.length ? 3 : 0);
}
