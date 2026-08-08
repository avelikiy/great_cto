#!/usr/bin/env node
/**
 * pipeline-tick — may the pipeline move while nobody is watching?
 *
 * Why this exists
 * ---------------
 * Gate approval is read now (`gate-state.mjs`), but only while a turn is
 * running. Approve a gate two hours later and nothing notices: the turn ended,
 * and the Stop hook deliberately does not hold one open on a gate, because
 * answering a gate requires the turn to end. So approving is still not enough —
 * someone has to come back and say "continue", and that second action carries no
 * decision.
 *
 * This is the piece that removes it, and it is also the first point where the
 * pipeline moves unattended. That is a different kind of change from the two
 * before it, so the guardrails are the substance here and the scheduling is not.
 *
 * What it will not do
 * -------------------
 *   - Anything but `ready-to-dispatch`. A gate, a block, a join-wait and an idle
 *     pipeline all mean "not yours to move".
 *   - The same transition twice. Without this a tick every ten minutes re-spawns
 *     the same stage until something changes, which is a fork bomb with a
 *     scheduler.
 *   - Agents that can do something expensive to undo, BY NAME, not only by gate.
 *     `devops` and `infra-provisioner` are excluded here as well as gated,
 *     because a gate is configuration and this list is not (ADR-009).
 *   - More often than the minimum interval, whatever the schedule says.
 *
 * Every refusal is silent-and-safe: the pipeline simply stays where it is, which
 * is where it would have stayed without this file.
 */

/**
 * Agents this may never dispatch unattended, whatever the gates say.
 *
 * A gate is configuration — `approval-level: auto` switches every one of them
 * off. This list is not configuration. It is the ADR-009 line: an operation that
 * escapes the machine, costs money, or cannot be undone needs a human in the
 * loop, and "the gate was off" is not the same as "a human decided".
 */
export const NEVER_AUTO = Object.freeze(['devops', 'infra-provisioner']);

/** Default minimum gap between dispatches, whatever the schedule asks for. */
export const MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * @param {object} args
 *   position    the object from pipelinePosition()
 *   lastMarker  the previous tick's marker string, or null
 *   now         ms
 *   lastTickAt  ms of the previous dispatch, or null
 * @returns {{act:boolean, agents:string[], marker:string|null, why:string}}
 */
export function tickDecision({ position, lastMarker = null, now = Date.now(), lastTickAt = null, minIntervalMs = MIN_INTERVAL_MS, neverAuto = NEVER_AUTO } = {}) {
  const no = (why) => ({ act: false, agents: [], marker: null, why });

  if (!position) return no('no position could be read');
  if (position.position !== 'ready-to-dispatch') {
    return no(`position is "${position.position}" — only ready-to-dispatch is this tick's to move`);
  }

  const agents = (position.next || []).filter(Boolean);
  if (!agents.length) return no('ready-to-dispatch with no next stage — nothing to spawn');

  const blocked = agents.filter((a) => neverAuto.includes(a));
  if (blocked.length) {
    return no(`${blocked.join(', ')} may not be dispatched unattended — an operation that is expensive to undo needs a human, and a gate being off is not a human deciding (ADR-009)`);
  }

  // Identity of the transition, not of the moment: the same stage succeeding
  // again with the same verdict is the same transition.
  const marker = `${position.cursor?.agent ?? '?'}:${position.cursor?.verdict ?? '?'}:${agents.join('+')}`;
  if (lastMarker === marker) {
    return no('this transition was already dispatched — a tick that re-spawns until something changes is a fork bomb with a scheduler');
  }

  if (lastTickAt != null && now - lastTickAt < minIntervalMs) {
    const wait = Math.ceil((minIntervalMs - (now - lastTickAt)) / 60000);
    return no(`last dispatch was under the ${Math.round(minIntervalMs / 60000)}-minute floor — ${wait} minute(s) to go`);
  }

  return {
    act: true,
    agents,
    marker,
    why: `${position.cursor?.agent ?? 'the previous stage'} succeeded and nothing gates ${agents.join(' + ')}`,
  };
}

/** What a woken session should be told to do. */
export function tickBrief(decision, position) {
  if (!decision.act) return null;
  return [
    `PIPELINE-TICK: ${decision.why}.`,
    `Spawn ${decision.agents.map((a) => `Agent(subagent_type: ${a})`).join(' and ')} now.`,
    position?.summary ? `Position: ${position.summary}` : '',
    'Carry the feature slug and artifact paths from the previous stage into the brief.',
    'If anything about the state looks wrong, stop and report rather than dispatching — this ran unattended.',
  ].filter(Boolean).join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
// Prints the decision and, when it acts, the brief a woken session should be
// given. Scheduling is deliberately NOT here: what wakes a session is the
// operator's choice, and the guardrails above are what make any of those choices
// safe. `--json` for a scheduler, plain text for a human reading a log.

async function main(argv) {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { pipelinePosition, readAllVerdicts } = await import('./pipeline-position.mjs');
  const { parsePipelineToml } = await import('../hooks/pipeline-dispatcher.mjs');
  const { gatesForApprovalLevel, levelFromProjectMd } = await import('./approval-level.mjs');

  const projDir = process.env.GREAT_CTO_DIR || '.great_cto';
  const marker = join(projDir, '.pipeline-tick');

  let transitions;
  try { transitions = parsePipelineToml(readFileSync(join('shared', 'pipeline.toml'), 'utf8')); }
  catch { console.error('pipeline-tick: shared/pipeline.toml not found — not a great_cto project.'); return 2; }

  let activeGates = null;
  try { activeGates = gatesForApprovalLevel(levelFromProjectMd(readFileSync(join(projDir, 'PROJECT.md'), 'utf8'))); } catch {}

  const verdicts = readAllVerdicts(join(projDir, 'verdicts'), { transitions });
  const position = pipelinePosition({ transitions, verdicts, activeGates });

  let lastMarker = null; let lastTickAt = null;
  try {
    const [m, t] = readFileSync(marker, 'utf8').trim().split('\n');
    lastMarker = m || null;
    lastTickAt = t ? Number(t) : null;
  } catch { /* first tick */ }

  const decision = tickDecision({ position, lastMarker, lastTickAt });

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...decision, brief: tickBrief(decision, position) }, null, 2));
  } else if (decision.act) {
    console.log(tickBrief(decision, position));
  } else {
    console.log(`pipeline-tick: standing by — ${decision.why}`);
  }

  // Recorded only when it acts, and only outside --dry-run: a tick that marks a
  // transition it did not dispatch would skip it forever.
  if (decision.act && !argv.includes('--dry-run')) {
    try {
      mkdirSync(projDir, { recursive: true });
      writeFileSync(marker, `${decision.marker}\n${Date.now()}\n`);
    } catch { /* an unwritable marker may dispatch twice; not fatal */ }
  }
  return decision.act ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
