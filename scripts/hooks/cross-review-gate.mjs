#!/usr/bin/env node
/**
 * cross-review-gate — Stop hook that will not end the turn on a diff no other
 * model has read.
 *
 * Why this exists
 * ---------------
 * `cross-model-review.mjs` has worked since the day it was written. It runs
 * when somebody remembers to run it, which is the shape this pipeline has
 * already measured once: an instruction that depends on remembering held at
 * 18%, and removing the remembering took it to 92%. The second opinion was
 * still an instruction.
 *
 * So it stops being one. When the gate is on and the tree at HEAD has no review
 * line joined to it, the turn does not end: the hook returns `decision: block`
 * naming the command that clears it. The join key it reads — `sha` on every
 * review line — is the field added at gate:evidence-schema precisely so a line
 * can be shown to be about THIS diff and not another.
 *
 * What it will NOT do
 * -------------------
 * **It is off unless asked.** `GREAT_CTO_CROSS_REVIEW_GATE=1`, and nothing
 * else. A gate that runs a second model at the end of every turn spends the
 * user's money without being asked and can loop Claude against Codex until a
 * limit stops it — OpenAI's own Codex plugin ships the same idea and warns
 * about exactly that in its README. Default off is not timidity here, it is
 * the difference between a guardrail and a bill.
 *
 * **It does not run the review itself.** A Stop hook holds the turn open while
 * it works, and `codex exec` is measured in minutes. The hook READS the log and
 * asks the model to run the review; the next Stop sees the line and passes.
 *
 * **It blocks a diff once.** A hook that can refuse to end the turn forever is
 * a hang, not a guardrail — the rule pipeline-stall-guard already follows.
 *
 * **It never reports an absence as a verdict.** "No model has read this" and
 * "a model read it and objected" are different states with different messages
 * and different `kind`s. The cross-model CLI learned this the expensive way:
 * EXIT.SKIPPED exists because PASS/BLOCK-only made a review that did not happen
 * indistinguishable from a review that objected.
 *
 * I/O (Claude Code Stop):
 *   stdin:  { stop_hook_active?, ... }
 *   stdout: {"decision":"block","reason":"<what to do>"}  — or nothing
 *   exit:   always 0
 *
 * On:  GREAT_CTO_CROSS_REVIEW_GATE=1
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { secondOpinionForTree } from '../lib/second-opinion-for-tree.mjs';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const MARKER = join(PROJ_DIR, '.cross-review-gate');

/**
 * Should this Stop be blocked, and what should the model be told?
 *
 * Pure, so every branch above is a test rather than a claim. `opinion` is
 * whatever `secondOpinionForTree` returned for this tree.
 *
 * @returns {{block:boolean, kind:string, reason?:string, why:string}}
 */
export function decideCrossReviewGate({ enabled, stopHookActive, blockedBefore, opinion }) {
  if (!enabled) return { block: false, kind: 'off', why: 'the cross-review gate is not enabled (GREAT_CTO_CROSS_REVIEW_GATE=1)' };
  // This Stop IS the previous block. Blocking again is the loop, not the guard.
  if (stopHookActive) return { block: false, kind: 'reentrant', why: 'this Stop follows a block of its own' };
  if (blockedBefore) return { block: false, kind: 'already-blocked', why: 'this diff was already held once' };

  const st = opinion?.state;

  // A project that declared `second_opinion: none` decided. An undeclared one
  // has not been asked to. Neither is an omission to nag about — turning the
  // gate on cannot conjure a reviewer the project never configured.
  if (st === 'not-run') {
    return { block: false, kind: 'not-declared', why: opinion?.why || 'no second opinion is declared for this project' };
  }

  if (st === 'ok') {
    if (opinion.verdict === 'BLOCK') {
      const p0 = Number(opinion.p0 || 0);
      const n = Number(opinion.findings || 0);
      return {
        block: true, kind: 'objected',
        why: 'the second opinion reviewed this diff and objected',
        reason: `The second opinion reviewed this diff (${String(opinion.sha || '').slice(0, 8)}) and returned BLOCK: `
          + `${n} finding(s), ${p0} P0. Read them in .great_cto/cross-review.log, fix them or say in your answer `
          + `why each is wrong, then re-run \`node scripts/lib/cross-model-review.mjs\`. Do not end the turn on an `
          + `unanswered P0.`,
      };
    }
    return { block: false, kind: 'reviewed', why: `the second opinion passed this diff (${String(opinion.sha || '').slice(0, 8)})` };
  }

  if (st === 'unreadable') {
    return {
      block: true, kind: 'unreadable',
      why: 'review lines exist but none can be joined to this tree',
      reason: `The cross-review log has lines that cannot be paired with this tree — ${opinion?.why || 'they predate the join key'}. `
        + `They are not a pass and not a verdict. Run \`node scripts/lib/cross-model-review.mjs\` so this diff has a line `
        + `carrying its own sha.`,
    };
  }

  // unmeasured, or anything a future reader adds: nothing has read this diff.
  return {
    block: true, kind: 'unreviewed',
    why: 'no second-opinion line joins this tree',
    reason: `This diff has not been read by a second opinion. Run \`node scripts/lib/cross-model-review.mjs\` and address `
      + `what it finds before ending the turn. If it cannot run — no key, no Codex login — say so in your answer rather `
      + `than letting the absence pass as a review.`,
  };
}

export function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* Stop sends {} often enough */ }

  const enabled = process.env.GREAT_CTO_CROSS_REVIEW_GATE === '1';
  // Cheap exit before touching git or the log: the default path must cost nothing.
  if (!enabled) return 0;

  let opinion;
  try { opinion = secondOpinionForTree(process.cwd()); }
  catch { return 0; }   // a reader that throws is not evidence of anything

  // The marker is keyed by the diff, so a new commit is held on its own merit
  // and an unchanged one is not held twice.
  const markerId = `${opinion?.head || 'no-head'}:${opinion?.state || 'unknown'}`;
  let blockedBefore = false;
  try { blockedBefore = readFileSync(MARKER, 'utf8').trim() === markerId; } catch { /* none yet */ }

  const d = decideCrossReviewGate({
    enabled, blockedBefore, opinion,
    stopHookActive: Boolean(payload.stop_hook_active),
  });
  if (!d.block) return 0;

  try {
    mkdirSync(PROJ_DIR, { recursive: true });
    writeFileSync(MARKER, `${markerId}\n`);
  } catch { /* a marker we cannot write means we may block twice; not fatal */ }

  process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
