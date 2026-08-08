#!/usr/bin/env node
/**
 * pipeline-stall-guard — Stop hook that will not let the turn end with the
 * pipeline mid-flight.
 *
 * Why this exists
 * ---------------
 * `pipeline-dispatcher` computes the next stage correctly at every transition —
 * a mechanical walk of all nine stages at four approval levels emits a directive
 * every time, with no silent gaps. But it only *injects advice*, and the
 * orchestrating model has to act on it. That is the same shape as the
 * instruction that was measured this week at 18% adherence: a rule that depends
 * on the model remembering. Removing the remembering took it to 92%.
 *
 * So the transition stops being advice. If a stage succeeded, its next stage is
 * not behind an active human gate, and nothing has run it, the turn does not
 * end: the hook returns `decision: block` with the directive, and the model
 * continues into the dispatch it was about to skip.
 *
 * What it will NOT do
 * -------------------
 * Gates stay human. An edge behind an active gate is a legitimate stopping
 * point — blocking there would turn "wait for the CTO" into a loop the CTO
 * cannot answer, since answering requires the turn to end.
 *
 * It also blocks a given transition ONCE. If the model was blocked and still did
 * not dispatch, something is wrong that a second block will not fix, and a hook
 * that can refuse to end the turn indefinitely is a hang, not a guardrail.
 *
 * I/O (Claude Code Stop):
 *   stdin:  { stop_hook_active?, ... }
 *   stdout: {"decision":"block","reason":"<directive>"}  — or nothing
 *   exit:   always 0
 *
 * Opt out: GREAT_CTO_DISABLE_STALL_GUARD=1
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePipelineToml, decideNext, latestVerdict, normalizeAgent, parseVerdictLine, readLastStop,
} from './pipeline-dispatcher.mjs';
import { gatesForApprovalLevel, levelFromProjectMd } from '../lib/approval-level.mjs';
import { readGateBeads, gateStates as readGateStates } from '../lib/gate-state.mjs';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const VERDICT_DIR = join(PROJ_DIR, 'verdicts');
const MARKER = join(PROJ_DIR, '.pipeline-stall');
const FRESH_MS = 30 * 60 * 1000;

/**
 * The stage that most recently recorded a verdict, by mtime.
 *
 * The Stop hook has no tool payload naming an agent — unlike PostToolUse it is
 * not told what just ran, so the freshest verdict is the only handle on where
 * the pipeline is.
 */
export function newestStage(dir, now = Date.now(), freshMs = FRESH_MS) {
  let best = null;
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.log')); } catch { return null; }
  for (const f of files) {
    let mt;
    try { mt = statSync(join(dir, f)).mtimeMs; } catch { continue; }
    if (now - mt > freshMs) continue;

    // The agent comes from the LINE, not the filename. A real verdict directory
    // holds `2026-06-27.log` carrying a project-auditor verdict, and an empty
    // `senior-dev.log`; trusting the filename would name a date as the current
    // stage and mask the one that actually ran.
    let parsed = null;
    try {
      const body = readFileSync(join(dir, f), 'utf8').trim();
      if (body) parsed = parseVerdictLine(body.split('\n').pop());
    } catch { /* unreadable */ }
    if (!parsed) continue;

    const agent = normalizeAgent(parsed.agent || f.replace(/\.log$/, ''));
    if (!agent) continue;
    if (!best || mt > best.mtime) best = { agent, mtime: mt, verdict: parsed };
  }
  return best;
}

/**
 * Should the turn be blocked, and with what?
 *
 * Pure so the decision is testable without a filesystem or a live session.
 *
 * @returns {{block: boolean, reason?: string, why?: string}}
 */
export function decideStall({ directive, alreadyDispatched, stopHookActive, blockedBefore }) {
  // `stop_hook_active` means this Stop is itself the result of a previous block.
  // Continuing to block would be the hang this guard exists to avoid being.
  if (stopHookActive) return { block: false, why: 'already continuing from a block' };
  if (blockedBefore) return { block: false, why: 'this transition was blocked once already' };
  if (!directive) return { block: false, why: 'no pending transition' };
  // 'resume' is held for the same reason as 'next': it names a concrete action
  // the orchestrator can take right now — SendMessage to a specific agent id —
  // and letting the turn end abandons an agent that was cut off with its work
  // unlanded. Six of eight agents over two days recorded no verdict, four of them
  // because they were cut off, and every one of those needed a human to notice.
  //
  // 'gate' is a legitimate stop — the CTO answers it after the turn ends.
  // 'blocked', 'done', 'join-wait' and 'no-verdict' all end the turn honestly:
  // 'no-verdict' is the agent that FINISHED and forgot, and the completion hook
  // already asks that one directly at SubagentStop, where it still has budget.
  const HOLD = new Set(['next', 'resume']);
  if (!HOLD.has(directive.kind)) {
    return { block: false, why: `transition is '${directive.kind}', not a pending action` };
  }
  if (directive.kind === 'next' && alreadyDispatched) {
    return { block: false, why: 'the next stage already recorded a verdict' };
  }
  return {
    block: true,
    reason: directive.kind === 'resume'
      ? `${directive.text}\n\n(The turn was held open because a cut-off agent was about to be abandoned. `
        + 'Resume it, or land its work yourself. If you genuinely cannot — say why to the CTO; this guard will not hold the turn again.)'
      : `${directive.text}\n\n(The turn was held open because this dispatch had not happened. `
        + 'Spawn the agent(s) above now. If you genuinely cannot — say why to the CTO; this guard will not hold the turn again.)',
  };
}

/** Gate approval for the gates on this edge, read once, failing safe to unapproved. */
function gateStatesFor(rule, verdict) {
  const gates = Array.isArray(rule?.gate) ? rule.gate : rule?.gate ? [rule.gate] : [];
  if (!gates.length) return null;
  return readGateStates(gates, readGateBeads(), { verdictTs: verdict?.ts ?? null });
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_STALL_GUARD === '1') return 0;

  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* Stop may send nothing */ }

  if (!existsSync(VERDICT_DIR)) return 0;              // not a great_cto project mid-pipeline

  let transitions;
  try {
    transitions = parsePipelineToml(readFileSync(join('shared', 'pipeline.toml'), 'utf8'));
  } catch { return 0; }

  // A cut-off agent has NO verdict, and `newestStage` finds the freshest one —
  // so on its own it can never see the very stage this guard most needs to hold
  // the turn for. Found by running the hook end to end; the unit tests all
  // passed because they hand `decideNext` a directive directly.
  //
  // When SubagentStop reports a fresh cut-off and that agent has no verdict of
  // its own, THAT is where the pipeline actually is.
  const lastStop = readLastStop(PROJ_DIR);
  const cutOffAgent = lastStop?.shape === 'cut-off' && lastStop.agent
    && !latestVerdict(VERDICT_DIR, normalizeAgent(lastStop.agent), FRESH_MS, Date.now())
    ? normalizeAgent(lastStop.agent) : null;

  const stage = cutOffAgent ? { agent: cutOffAgent } : newestStage(VERDICT_DIR);
  if (!stage) return 0;
  const agent = normalizeAgent(stage.agent);

  let activeGates = null;
  try {
    activeGates = gatesForApprovalLevel(levelFromProjectMd(readFileSync(join(PROJ_DIR, 'PROJECT.md'), 'utf8')));
  } catch { /* no PROJECT.md → honour every gate in the map */ }

  const verdict = latestVerdict(VERDICT_DIR, agent, FRESH_MS, Date.now());
  const rule = transitions[agent] || {};
  const joinVerdicts = {};
  for (const j of rule.join || []) joinVerdicts[j] = latestVerdict(VERDICT_DIR, j, 24 * 60 * 60 * 1000, Date.now());

  const directive = decideNext({
    agent, transitions, verdict, joinVerdicts, activeGates,
    gateStates: gateStatesFor(rule, verdict),
    // Without this the guard cannot see a cut-off agent at all: `decideNext`
    // only emits `resume` when it knows how the subagent stopped, and that is
    // recorded by SubagentStop.
    lastStop,
  });

  // "Already dispatched" = every next stage has its own fresh verdict. A stage
  // that is running but has not finished has no verdict yet, so this errs toward
  // blocking — which is recoverable, where erring toward silence is the stall.
  const nexts = rule.next || [];
  const alreadyDispatched = nexts.length > 0
    && nexts.every((n) => latestVerdict(VERDICT_DIR, n, FRESH_MS, Date.now()));

  let blockedBefore = false;
  // The kind is part of the identity: a stage blocked once for a missing
  // dispatch and later cut off is two different situations, and one marker for
  // both would silently skip the second.
  const markerId = `${agent}:${verdict?.verdict || ''}:${directive?.kind || ''}`;
  try { blockedBefore = readFileSync(MARKER, 'utf8').trim() === markerId; } catch { /* none */ }

  const d = decideStall({
    directive,
    alreadyDispatched,
    stopHookActive: Boolean(payload.stop_hook_active),
    blockedBefore,
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
