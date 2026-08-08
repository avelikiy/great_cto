#!/usr/bin/env node
/**
 * stop-shape — did this subagent finish, or was it cut off?
 *
 * Why this exists
 * ---------------
 * On 2026-08-07 four of seven agents in a live pipeline run ended mid-sentence.
 * senior-dev's last words were "Let me run the exact command as specified in the
 * task"; a security re-verification's were "Now let's check gate-check and run
 * the finding-evidence linter mentally as I write". Each had done real work —
 * 33 tests, a 23 KB report with two reproduced CRITICALs — and none had recorded
 * a verdict, so the dispatcher named no next stage and the pipeline stopped.
 * A human wrote four verdicts by hand.
 *
 * The two failures look identical from outside and need opposite remedies:
 *
 *   an agent that FINISHED and forgot the last step should be told to record it
 *   — it has budget and context to do so;
 *
 *   an agent that was CUT OFF cannot be told anything useful. It has to be
 *   resumed with its context, or its work has to be picked up by someone else.
 *   Telling it to "try again" starts a fresh run of work already done.
 *
 * The distinction is mechanical, which was the surprise. Across twelve subagent
 * transcripts the separation was exact: an agent that returned normally has
 * exactly one assistant message with `stop_reason: end_turn`, and one that was
 * cut off has none — its last message is still `tool_use`, mid-loop, when the
 * harness stopped it. Six and six.
 *
 * No heuristics about sentence endings or token counts. Those were tried first
 * and are worse: a report can legitimately end without a period, and a cut-off
 * agent can stop well under any ceiling.
 */

import { readFileSync, statSync } from 'node:fs';

/** A transcript larger than this is not read — a hook must not stall on I/O. */
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * @returns {{shape:'reported'|'cut-off'|'empty', turns:number, endTurns:number,
 *            toolUses:number, lastText:string|null}}
 */
export function stopShape(input) {
  const empty = { shape: 'empty', turns: 0, endTurns: 0, toolUses: 0, lastText: null };
  let text;
  try {
    const trimmed = String(input ?? '').trimStart();
    if (trimmed[0] === '{') {
      text = String(input);
    } else {
      if (!trimmed) return empty;
      if (statSync(input).size > MAX_BYTES) return empty;
      text = readFileSync(input, 'utf8');
    }
  } catch { return empty; }

  let turns = 0; let endTurns = 0; let toolUses = 0; let lastText = null;
  for (const line of text.split('\n')) {
    if (!line || line[0] !== '{') continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant') continue;
    const msg = o.message || o;
    turns += 1;
    if (msg.stop_reason === 'end_turn') endTurns += 1;
    else if (msg.stop_reason === 'tool_use') toolUses += 1;
    const t = (msg.content || []).filter((c) => c?.type === 'text').map((c) => c.text || '').join('');
    if (t.trim()) lastText = t.trim();
  }

  if (!turns) return empty;
  // An agent that reached a conclusion closed a turn. One that did not is still
  // inside its loop, whatever its last text happens to look like.
  return { shape: endTurns > 0 ? 'reported' : 'cut-off', turns, endTurns, toolUses, lastText };
}

/**
 * What to do about it, given whether a verdict was recorded.
 *
 * The remedy is the point: these two states are indistinguishable in the
 * pipeline's own record — both show a stage with no verdict — and the wrong
 * remedy either wastes a full re-run or asks a dead agent to speak.
 */
export function stopRemedy({ shape, turns, hasVerdict, agent = 'the agent' }) {
  if (hasVerdict) return null;

  if (shape === 'cut-off') {
    return {
      kind: 'resume',
      text: `${agent} was CUT OFF after ${turns} turns — it never closed a turn, so it stopped mid-loop rather than concluding. `
        + 'Its work may exist (files written, tests run) while its verdict does not. '
        + `RESUME it with its context (SendMessage to the same agent: "record your verdict and close your task") rather than re-running it — a fresh run repeats work already done. `
        + 'Check for changes it left behind, including in a git worktree, before deciding it produced nothing.',
    };
  }
  if (shape === 'reported') {
    return {
      kind: 'record',
      text: `${agent} finished normally but recorded no verdict — it has context and budget, so ask it for the last step: `
        + `bash scripts/log-verdict.sh ${agent} <VERDICT> auto [meta...]`,
    };
  }
  return {
    kind: 'unknown',
    text: `${agent} produced no readable transcript, so whether it finished cannot be established. Treat the stage as incomplete.`,
  };
}
