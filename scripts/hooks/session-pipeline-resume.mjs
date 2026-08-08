#!/usr/bin/env node
/**
 * session-pipeline-resume — pick the pipeline up where it was left.
 *
 * Why this exists
 * ---------------
 * Gate approval is read now, but only while a turn is running. Approve a gate two
 * hours later and nothing notices: the turn ended, and the Stop hook deliberately
 * does not hold one open on a gate, because answering a gate requires the turn to
 * end. So approving was never enough — someone had to come back and say
 * "continue", and that second action carried no decision.
 *
 * Why SessionStart rather than cron
 * ---------------------------------
 * This closes the same gap a scheduler would, and closes it at the one moment the
 * human is already present. That matters more than it sounds: four of eight
 * agents over two days were cut off mid-loop, and while that is now detected,
 * named and held for, the recovery is still an instruction the orchestrator
 * carries out. Under a scheduler a failed recovery is an invisible stall at 3am.
 * Here, you are at the keyboard when the pipeline moves.
 *
 * A scheduler remains available — `pipeline-tick` is the same decision, and its
 * guardrails do not care what calls it. This is the first rung, not the only one.
 *
 * I/O (Claude Code SessionStart):
 *   stdout: {"hookSpecificOutput":{"hookEventName":"SessionStart",
 *            "additionalContext":"<brief>"}}   (silent when nothing to resume)
 *   exit:   always 0 — a session must never fail to start over this.
 *
 * Opt out: GREAT_CTO_DISABLE_SESSION_RESUME=1
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const MARKER = join(PROJ_DIR, '.pipeline-tick');

/**
 * The brief, phrased for someone who is present.
 *
 * `tickBrief` ends with "this ran unattended — stop and report rather than
 * dispatching", which is the right thing to tell a scheduler-woken session and
 * the wrong thing to tell you: you are here, and can simply look.
 */
export function resumeBrief(decision, position) {
  if (!decision?.act) return null;
  return [
    `PIPELINE: this project has work waiting — ${decision.why}.`,
    // pipelinePosition's summary already opens with "Position:" — prefixing it
    // again produced "Position: Position: ready-to-dispatch".
    position?.summary || '',
    `Next: ${decision.agents.map((a) => `Agent(subagent_type: ${a})`).join(' and ')}.`,
    'Carry the feature slug and artifact paths from the previous stage into the brief.',
    'Say what you are about to do before doing it — the CTO has just arrived and did not ask for this yet.',
  ].filter(Boolean).join('\n');
}

async function main() {
  if (process.env.GREAT_CTO_DISABLE_SESSION_RESUME === '1') return 0;
  if (!existsSync(PROJ_DIR) || !existsSync(join('shared', 'pipeline.toml'))) return 0;

  const { tickDecision } = await import('../lib/pipeline-tick.mjs');
  const { pipelinePosition, readAllVerdicts } = await import('../lib/pipeline-position.mjs');
  const { parsePipelineToml } = await import('./pipeline-dispatcher.mjs');
  const { gatesForApprovalLevel, levelFromProjectMd } = await import('../lib/approval-level.mjs');

  let transitions;
  try { transitions = parsePipelineToml(readFileSync(join('shared', 'pipeline.toml'), 'utf8')); } catch { return 0; }

  let activeGates = null;
  try { activeGates = gatesForApprovalLevel(levelFromProjectMd(readFileSync(join(PROJ_DIR, 'PROJECT.md'), 'utf8'))); } catch { /* honour every declared gate */ }

  const verdicts = readAllVerdicts(join(PROJ_DIR, 'verdicts'), { transitions });
  const position = pipelinePosition({ transitions, verdicts, activeGates });

  let lastMarker = null; let lastTickAt = null;
  try {
    const [m, t] = readFileSync(MARKER, 'utf8').trim().split('\n');
    lastMarker = m || null; lastTickAt = t ? Number(t) : null;
  } catch { /* first time */ }

  // The same decision a scheduler would get, with the same refusals: only
  // ready-to-dispatch, never twice for one transition, never devops or
  // infra-provisioner, never inside the interval floor.
  const decision = tickDecision({ position, lastMarker, lastTickAt });
  if (!decision.act) return 0;                       // silent — nothing to resume

  try {
    mkdirSync(PROJ_DIR, { recursive: true });
    writeFileSync(MARKER, `${decision.marker}\n${Date.now()}\n`);
  } catch { /* an unwritable marker means it may offer twice; not fatal */ }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: resumeBrief(decision, position),
    },
  }));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // A session must start even if this throws. Nothing here is worth a failed start.
  main().then((c) => { process.exitCode = c; }).catch(() => { process.exitCode = 0; });
}
