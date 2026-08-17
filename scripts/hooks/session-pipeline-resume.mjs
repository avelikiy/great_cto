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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const MARKER = join(PROJ_DIR, '.pipeline-tick');
const TRACE = join(PROJ_DIR, '.session-resume');

/**
 * One line recording that this hook ran, and what it decided.
 *
 * Silence is this hook's normal answer — nothing in flight, a gate unapproved,
 * a transition already dispatched. But a hook that stayed silent and a hook that
 * never ran are indistinguishable from outside, and that is the same defect this
 * repo spent two days removing everywhere else: a run that did not happen must
 * not look like a run that found nothing.
 *
 * Overwritten rather than appended: the question is "did it run this session and
 * what did it say", not "how many times has it ever run".
 */
function trace(state, why) {
  try {
    mkdirSync(PROJ_DIR, { recursive: true });
    writeFileSync(TRACE, `${new Date().toISOString()} ${state} ${why}\n`);
  } catch { /* a trace we cannot write must not stop the hook */ }
}

/**
 * How recent a stage must be for this to be "work waiting" rather than history.
 *
 * Most sessions start on a project with no pipeline in flight, and this hook runs
 * for all of them. Reading gate approval means shelling out to `bd`, which costs
 * 533ms of the 847ms this hook took before the check below — against ~30ms for
 * every other hook in this plugin. A session-start tax paid by everyone, to
 * answer a question almost nobody is asking.
 *
 * A day is generous and the reasoning is not about speed: a stage that succeeded
 * last week is not work waiting for you, it is something that happened. The hook
 * exists for "you approved a gate two hours ago", and that is what it should
 * answer.
 */
const IN_FLIGHT_MS = 24 * 60 * 60 * 1000;

/** The newest verdict's age, or null when there are none. */
function newestVerdictAge(dir, now = Date.now()) {
  let newest = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.log')) continue;
      const m = statSync(join(dir, f)).mtimeMs;
      if (m > newest) newest = m;
    }
  } catch { return null; }
  return newest ? now - newest : null;
}

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

  // Cheapest question first: is anything in flight at all? A stat per verdict
  // log, before any import or subprocess.
  const age = newestVerdictAge(join(PROJ_DIR, 'verdicts'));

  // An approval outranks the clock.
  //
  // The freshness shortcut below is right for the case it was written for — most
  // sessions start on a project with nothing in flight, and reading gate state
  // costs half a second of shelling out to `bd`. It is wrong for the case this
  // whole mechanism exists to serve: approve a gate on a stage that ran three
  // days ago, and the strongest evidence the pipeline is waiting is the one
  // thing the hook would never consult.
  //
  // So a recorded approval suppresses the shortcut. It suppresses nothing else:
  // every refusal in tickDecision still applies below.
  const { readWake, clearWake } = await import('../lib/pipeline-wake.mjs');
  const woken = readWake(process.cwd());

  if (!woken.pending && (age === null || age > IN_FLIGHT_MS)) {
    trace('idle', age === null ? 'no verdicts recorded' : `newest stage is ${Math.round(age / 3600_000)}h old — history, not work waiting`);
    return 0;
  }

  const { tickDecision } = await import('../lib/pipeline-tick.mjs');
  const { pipelinePosition, readAllVerdicts } = await import('../lib/pipeline-position.mjs');
  const { parsePipelineToml } = await import('./pipeline-dispatcher.mjs');
  const { gatesForApprovalLevel, levelFromProjectMd } = await import('../lib/approval-level.mjs');

  let transitions;
  try { transitions = parsePipelineToml(readFileSync(join('shared', 'pipeline.toml'), 'utf8')); } catch { return 0; }

  let activeGates = null;
  try { activeGates = gatesForApprovalLevel(levelFromProjectMd(readFileSync(join(PROJ_DIR, 'PROJECT.md'), 'utf8'))); } catch { /* honour every declared gate */ }

  const verdicts = readAllVerdicts(join(PROJ_DIR, 'verdicts'), { transitions });
  // Phase 5: gates whose agent conclusively passed its holdout announce rather
  // than wait. Off unless this project opted in; fails closed on any doubt.
  const { notifyOnlyForProject, tierFor } = await import('../lib/gate-tier.mjs');
  const notifyOnly = await notifyOnlyForProject(process.cwd());

  // GATE-R1/R2: the stand-down is recorded before the pipeline is told it may
  // proceed, and an unwritable record means the gate does not stand down at all.
  // This is the only production caller that tiers, so it is the only place the
  // recorder has to be supplied — and supplying nothing here would silently
  // restore every gate rather than fail open, which is the correct direction to
  // be wrong in.
  const { standDownRecorder } = await import('../lib/stand-down.mjs');
  const now = Date.now();
  const recordStandDown = standDownRecorder(process.cwd(), { at: now });

  // Which tier stood it down, and on what — `notify` and `notify-thin` are the
  // difference between plural evidence and one eval, and a record that does not
  // say which cannot be audited for the thing most worth auditing.
  let tierName = 'notify';
  let tierWhy = '';
  try {
    const cursorAgent = Object.values(verdicts).sort((a, b) => (a.ts > b.ts ? -1 : 1))[0]?.agent;
    if (cursorAgent) {
      const { readFileSync: rf } = await import('node:fs');
      const rows = [];
      for (const line of rf('tests/eval/results-history.jsonl', 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { rows.push(JSON.parse(line)); } catch { /* a bad row is not evidence */ }
      }
      const t = tierFor(cursorAgent, { rows });
      tierName = t.tier; tierWhy = t.why;
    }
  } catch { /* the record then says 'unknown', which is true and is not a pass */ }

  const position = pipelinePosition({
    transitions, verdicts, activeGates, notifyOnly, now, recordStandDown, tierName, tierWhy,
  });

  let lastMarker = null; let lastTickAt = null;
  try {
    const [m, t] = readFileSync(MARKER, 'utf8').trim().split('\n');
    lastMarker = m || null; lastTickAt = t ? Number(t) : null;
  } catch { /* first time */ }

  // The same decision a scheduler would get, with the same refusals: only
  // ready-to-dispatch, never twice for one transition, never devops or
  // infra-provisioner, never inside the interval floor.
  const decision = tickDecision({ position, lastMarker, lastTickAt });

  // The approval has now been considered, so it is spent — whatever the answer.
  // A wake that survives its own consideration re-announces the same approval at
  // every session start for a week, and a signal that fires forever stops being
  // a signal. The refusal, if there was one, is in the trace.
  const wokenBy = woken.pending ? ` (woken by an approval ${woken.wake?.gate ? `of ${woken.wake.gate}` : ''})` : '';
  if (woken.pending) clearWake(process.cwd());

  if (!decision.act) {
    trace('silent', `${decision.why}${wokenBy}`);
    return 0;
  }

  try {
    mkdirSync(PROJ_DIR, { recursive: true });
    writeFileSync(MARKER, `${decision.marker}\n${Date.now()}\n`);
  } catch { /* an unwritable marker means it may offer twice; not fatal */ }

  trace('offered', `${decision.agents.join(' + ')} — ${decision.why}${wokenBy}`);

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
