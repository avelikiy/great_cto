#!/usr/bin/env node
/**
 * pipeline-dispatcher — PostToolUse hook (matcher: Task|Agent) that turns the
 * pipeline's prose handoffs into a machine directive.
 *
 * Why this exists
 * ---------------
 * Every agent→agent transition in great_cto was prompt-driven: SKILL.md says
 * "Spawn great_cto-pm after gate:arch" and the orchestrating model has to
 * remember to do it. Context compaction, a user tangent, or a long session
 * silently stalls the pipeline after any agent. All the state needed to
 * compute "what runs next" already exists (verdicts/*.log, shared/pipeline.toml,
 * Beads gates) — this hook computes it and injects a PIPELINE-NEXT directive
 * into the main-loop context right after the subagent's Task/Agent call
 * completes.
 *
 * The dispatcher NEVER approves gates and NEVER spawns anything itself — it
 * only tells the orchestrator what the transition map says should happen.
 * Human gates stay human.
 *
 * I/O (Claude Code PostToolUse):
 *   stdin:  { tool_name, tool_input: { subagent_type, ... }, ... }
 *   stdout: {"hookSpecificOutput":{"hookEventName":"PostToolUse",
 *            "additionalContext":"<directive>"}}   (silent when nothing to say)
 *   exit:   always 0 (advisory — dispatch must never break the tool call)
 *
 * Opt out: GREAT_CTO_DISABLE_DISPATCHER=1
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatesForApprovalLevel, levelFromProjectMd } from '../lib/approval-level.mjs';
import { readGateBeads, gateStates as readGateStates } from '../lib/gate-state.mjs';
import { parseVerdictLine as parseVerdictRecord } from '../lib/verdict-record.mjs';
import { parseAgentBudgets, judgeAgentBudget, budgetAllowsDispatch } from '../lib/agent-budget.mjs';
import { findAgentTranscript, transcriptStartedAt } from '../lib/agent-transcript.mjs';
import { stopShape } from '../lib/stop-shape.mjs';
import { recordRun } from '../lib/pipeline-journal.mjs';
import { checkArtifacts, explainArtifacts } from '../lib/artifact-claims.mjs';
import { latestScore as _latestScore } from '../lib/scores.mjs';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
/**
 * Where the pipeline map lives.
 *
 * This was `shared/pipeline.toml`, resolved against the CURRENT WORKING
 * DIRECTORY — the project being worked in. Only a project that happens to
 * contain a copy of the map could chain, and of seventeen registered projects
 * with `.great_cto/`, thirteen had none. In those the hook hit
 *
 *     if (!existsSync(PROJ_DIR) || !existsSync(PIPELINE_PATH)) return process.exit(0);
 *
 * and exited silently: no dispatch, no verdict, no task, and nothing anywhere
 * saying why. The pipeline was installed, wired, and incapable of running.
 *
 * The map is a property of the PLUGIN, not of each project. It is resolved from
 * this file's own location first-and-last, with a project-local copy taking
 * precedence so a project can still override the chain deliberately.
 */
const PLUGIN_PIPELINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'pipeline.toml');
const LOCAL_PIPELINE = join('shared', 'pipeline.toml');
const PIPELINE_PATH = existsSync(LOCAL_PIPELINE) ? LOCAL_PIPELINE : PLUGIN_PIPELINE;
const VERDICT_DIR = join(PROJ_DIR, 'verdicts');
// A verdict is "fresh" if written in the last 30 min — long enough for a slow
// subagent's closing writes, short enough not to resurrect yesterday's run.
// Exported so scripts/lib/pipeline-position.mjs shares this one boundary
// instead of hardcoding its own 30-min constant.
export const FRESH_MS = 30 * 60 * 1000;
// Join-quorum partner verdicts may be hours old (parallel branches).
const JOIN_MS = 24 * 60 * 60 * 1000;

// Exported so `declared-consumed.mjs` can ask "is this token handled anywhere?"
// against the same set the dispatcher acts on, rather than a second copy that
// would drift and quietly excuse a token nothing reads.
export const BLOCKED_TOKENS = new Set(['BLOCKED', 'FAIL', 'FAILED', 'REJECTED']);

/**
 * The verdict token an independent verifier writes when work must go back.
 *
 * Distinct from BLOCKED on purpose. BLOCKED halts the chain and escalates to the
 * CTO — it means "a human must decide". REWORK means "the agent that just ran
 * can fix this itself, and here is what": nobody needs to be interrupted, the
 * work needs another pass. Collapsing them would either page a human for a
 * missing file or let a missing file through as a routine retry.
 */
export const REWORK_TOKEN = 'REWORK';

/**
 * How many times a stage may be sent back before it becomes a human's problem.
 *
 * Three, not unlimited. Two machines handing work back and forth do not get
 * bored, and the symptom is not an error — it is a pipeline that looks busy.
 */
export const MAX_REWORK = 3;

/**
 * The score recorded for one run, or null.
 *
 * Keyed on the run's own timestamp so a score from an EARLIER run of the same
 * agent cannot satisfy the gate for this one — the failure mode would be a stage
 * verified once and waved through forever after.
 *
 * Fail-open on its own failure: a scores file that cannot be read is not a
 * refusal to dispatch. A broken checker halting every transition is a worse
 * outage than the defect it looks for.
 */
function latestScoreFor(cwd, agent, runTs) {
  try {
    const latestScore = _latestScore;
    return latestScore(cwd, { agent, runTs: runTs || null, name: 'independent-verify' });
  } catch { return null; }
}

/** How many REWORK verdicts this agent already has in this chain. */
export function countRework(agent, allVerdicts) {
  if (!Array.isArray(allVerdicts)) return 0;
  return allVerdicts.filter((v) => v?.agent === agent && v?.verdict === REWORK_TOKEN).length;
}

/**
 * Layer 1 of independent-verify, inline: do the artefacts this verdict names
 * exist on disk with content?
 *
 * Imported lazily and fail-open on its own failure. A verification step that
 * throws must not become a way to stop the pipeline — a broken checker halting
 * every transition is a worse outage than the defect it looks for, and "the
 * checker could not run" is a third state, reported, never counted as a pass.
 */
function verifyClaimedArtefacts(agent, verdict, cwd) {
  try {
    const r = checkArtifacts(verdict?.meta || {}, { root: cwd });
    if (!r.checked.length) return { state: 'nothing-claimed', detail: 'the verdict names no artefact' };
    if (r.ok) return { state: 'ok', detail: `${r.checked.length} claimed artefact(s) present` };
    return { state: 'rework', detail: explainArtifacts(r) || 'claimed artefacts are missing or empty' };
  } catch {
    return { state: 'unavailable', detail: 'artefact check could not run' };
  }
}



/** Minimal TOML-subset parser for pipeline.toml:
 *  [transitions.<name>] sections with string / string-array values. */
export function parsePipelineToml(text) {
  const transitions = {};
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[transitions\.([\w.-]+)\]$/);
    if (sec) { cur = transitions[sec[1]] = {}; continue; }
    if (/^\[/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const kv = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, valRaw] = kv;
    if (valRaw.startsWith('[')) {
      const items = valRaw.replace(/^\[|\]$/g, '').split(',')
        .map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      cur[key] = items;
    } else {
      cur[key] = valRaw.trim().replace(/^"|"$/g, '');
    }
  }
  return transitions;
}

/**
 * The agentId out of a PostToolUse payload, if the tool reported one.
 *
 * The Agent tool prints it in its result so a caller can resume that exact
 * agent with its context — which is the only useful thing to do with one that
 * was cut off. Extracted defensively from the stringified response: the field's
 * position is not guaranteed, and a directive that says "use the agentId from
 * its result" is still actionable when this finds nothing.
 */
export function agentIdFrom(payload) {
  try {
    const blob = typeof payload?.tool_response === 'string'
      ? payload.tool_response
      : JSON.stringify(payload?.tool_response ?? '');
    const m = blob.match(/agentId["':\s]+([a-f0-9]{8,})/i);
    return m ? m[1] : null;
  } catch { return null; }
}

/**
 * How the subagent stopped — read from ITS OWN transcript, found by the agentId
 * the tool result printed.
 *
 * This does not depend on SubagentStop, and that is the point. On 2026-08-08 an
 * agent was cut off after 97 turns with 105 passing tests in a worktree, and the
 * SubagentStop hook never ran — `cost-history.log`, which that hook appends on
 * every invocation, had no entry within two hours of it. Run by hand against the
 * same transcript the hook worked perfectly. It is unreliable in exactly the case
 * it exists for, so the reliable signal is read here instead.
 */
function stopShapeFor(agentId) {
  if (!agentId) return null;
  const path = findAgentTranscript({ agentId });
  if (!path) return null;
  const sh = stopShape(path);
  if (sh.shape === 'empty') return null;
  return { shape: sh.shape, turns: sh.turns, agent: null, startedAt: transcriptStartedAt(path) };
}

/**
 * A verdict that predates this run belongs to whatever the same agent did
 * before, and must not be read as this one's success.
 *
 * The freshness window is thirty minutes and says nothing about WHICH run. On
 * 2026-08-08 a senior-dev verdict written twenty minutes earlier, for the
 * previous task, was read as a cut-off agent's TASK_DONE — and the directive
 * said "succeeded, spawn code-reviewer" for a stage that had produced nothing
 * but an unlanded worktree. A false success advances the pipeline; a false
 * absence only stalls it.
 */
export function verdictBelongsToRun(verdict, startedAt) {
  if (!verdict || !startedAt) return true;          // nothing to contradict it
  const ts = Date.parse(verdict.ts ?? '');
  if (!Number.isFinite(ts)) return true;            // unreadable — do not invent a mismatch
  // A second of slack: the verdict is written during the run, not before it.
  return ts >= startedAt - 1000;
}

/** How the last subagent stopped, as SubagentStop recorded it — the fallback. */
export function readLastStop(dir, { withinMs = 10 * 60 * 1000, now = Date.now(), read = readFileSync } = {}) {
  try {
    const o = JSON.parse(read(join(dir, '.last-stop'), 'utf8'));
    // Stale means it describes a different subagent — worse than knowing nothing,
    // because it would prescribe resuming an agent that already finished.
    if (o?.ts && now - Date.parse(o.ts) > withinMs) return null;
    return o && o.shape ? o : null;
  } catch { return null; }
}

/** Normalize "great_cto-architect" → "architect". */
export function normalizeAgent(subagentType) {
  return String(subagentType || '').replace(/^great_cto-/, '').trim();
}

/**
 * Parse a verdict log line → {agent, verdict, canonical, hasCost}.
 *
 * Delegates to scripts/lib/verdict-record.mjs, which owns the schema. This hook
 * had its OWN copy of the parser and it knew only the two legacy text dialects.
 * When verdicts moved to versioned JSON (dda79037) one parser was updated and
 * this one was not, so on the first live pipeline run architect wrote a correct
 * v1 record through scripts/log-verdict.sh, and the dispatcher reported "no
 * verdict recorded", named no next stage, and the run stalled at the first
 * transition while the agent had done exactly the right thing.
 *
 * The lesson is not "tolerate more formats" — it is that a second parser for a
 * schema someone else owns will drift, and the drift shows up as the pipeline
 * being silently wrong rather than as a failing test. So there is one parser.
 *
 * `canonical` marks the CURRENT write format (versioned JSON). Legacy lines
 * still read — every log written before dda79037 is in them — and are not a
 * defect to report.
 */
export function parseVerdictLine(line) {
  const r = parseVerdictRecord(line);
  if (!r.ok) return null;
  return {
    ts: r.rec.ts ?? null,
    agent: r.rec.agent || null,
    verdict: String(r.rec.verdict || '').toUpperCase(),
    canonical: !r.legacy,
    hasCost: r.rec.cost_usd != null,
    // The number itself, not only whether it exists. Per-agent budgets are
    // enforced from MEASURED spend, and this is where measured spend lives —
    // `hasCost` alone could only answer "was anything recorded".
    costUsd: r.rec.cost_usd != null ? Number(r.rec.cost_usd) : null,
    // The claims the verdict makes — artefact paths among them. Carried so the
    // completion hook can check whether what the agent named actually exists.
    meta: r.rec.meta ?? {},
  };
}

/** Read the agent's latest verdict if the log was touched within `withinMs`. */
export function latestVerdict(dir, agent, withinMs, now) {
  const fp = join(dir, `${agent}.log`);
  try {
    if (!existsSync(fp)) return null;
    if (now - statSync(fp).mtimeMs > withinMs) return null;
    const lines = readFileSync(fp, 'utf8').trim().split('\n');
    return parseVerdictLine(lines[lines.length - 1]);
  } catch { return null; }
}

/**
 * Parse a reviewer's `<!-- HANDOFF -->` YAML block (archetype-review-base) out
 * of a TM file's text. Returns {agent, verdict} or null. Used as fallback when
 * a *-reviewer wrote its TM + HANDOFF but forgot the verdict log line.
 */
export function parseHandoffVerdict(text, agent) {
  const blocks = String(text).split('<!-- HANDOFF -->');
  if (blocks.length < 2) return null;
  // Scan newest-last: reviewers append; take the LAST block with THIS agent's
  // key. Strictly agent-specific — a generic `*-verdict:` fallback would
  // attribute another reviewer's verdict on a shared multi-reviewer TM.
  const rx = new RegExp(`^\\s*${agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-verdict:\\s*(signed-off|blocked)`, 'm');
  for (let i = blocks.length - 1; i >= 1; i--) {
    const m = blocks[i].match(rx);
    if (m) return { ts: '', agent, verdict: m[1] === 'signed-off' ? 'APPROVED' : 'BLOCKED' };
  }
  return null;
}

/** Fallback for reviewers: read the freshest TM-*.md and parse its HANDOFF. */
export function handoffFallback(agent, withinMs, now, { readdir, stat, read }) {
  try {
    const dir = join('docs', 'sec-threats');
    const files = readdir(dir).filter(f => /^TM-.*\.md$/.test(f));
    let newest = null, newestM = 0;
    for (const f of files) {
      const m = stat(join(dir, f)).mtimeMs;
      if (m > newestM) { newestM = m; newest = f; }
    }
    if (!newest || now - newestM > withinMs) return null;
    return parseHandoffVerdict(read(join(dir, newest)), agent);
  } catch { return null; }
}

/**
 * Pure transition decision.
 *
 * `activeGates` is the set the project's approval-level actually asks for
 * (scripts/lib/approval-level.mjs). pipeline.toml declares where a gate *can*
 * sit; the approval level decides which of those stop a human. Without this the
 * dispatcher would tell the orchestrator to wait for `gate:arch` under
 * `product-only` — where the architect deliberately never creates one — and the
 * pipeline would stall forever on a gate that does not exist. Omitted (or null)
 * means "honour every gate in the map", which is the pre-existing behaviour.
 *
 * @returns {{kind:string, text:string}|null} null = nothing to inject
 */
/**
 * A stage the map says to run, that this run does not need.
 *
 * `shared/pipeline.toml` says `architect -> pm` unconditionally; CLAUDE.md says
 * skip pm decomposition below three work streams. On 2026-08-07 the architect
 * itself wrote "depth Small, one implementation task" — the decision was already
 * in its output, and a human made it again.
 *
 * The trap is that skipping a stage also skips that stage's gate, and `depth`
 * comes from a verdict an agent writes. An input from the agent that removes a
 * check is the shape that produced three CRITICALs in execution-claims a day
 * earlier. So: **a skip may never remove an ACTIVE gate.** At `gates-only`,
 * gate:plan is not active and skipping pm changes nothing a human was going to
 * be asked; at `expert` it is active, so pm runs and the plan is reviewed. The
 * approval level decides, not the agent.
 */
export function resolveSkip({ rule, transitions, meta, activeGates, gateStates, depth = 0 }) {
  const cond = rule?.skip_next_when;
  const nexts = rule?.next || [];
  if (!cond || nexts.length !== 1 || depth > 3) return { nexts, skipped: [] };

  const [key, want] = String(cond).split('=').map((x) => x.trim().toLowerCase());
  const have = String(meta?.[key] ?? '').trim().toLowerCase();
  if (!key || !want || have !== want) return { nexts, skipped: [] };

  const skipStage = nexts[0];
  const skipRule = transitions?.[skipStage];
  if (!skipRule || !(skipRule.next || []).length) return { nexts, skipped: [] };

  // The gates on the edge being removed. If any is active at this level, the
  // human asked to be consulted here and a verdict field does not overrule that.
  const gates = Array.isArray(skipRule.gate) ? skipRule.gate : skipRule.gate ? [skipRule.gate] : [];
  const stillActive = gates.filter((g) => {
    if (!activeGates) return true;
    const bare = String(g).replace(/^gate:/, '');
    return activeGates.includes(bare) || activeGates.includes(g);
  });
  if (stillActive.length) return { nexts, skipped: [] };

  const onward = resolveSkip({ rule: skipRule, transitions, meta, activeGates, gateStates, depth: depth + 1 });
  return { nexts: onward.nexts, skipped: [skipStage, ...onward.skipped], why: `${cond} (declared by ${meta?.agent ?? 'the stage'})` };
}

export function decideNext({ agent, transitions, verdict, joinVerdicts, activeGates = null, gateStates = null, lastStop = null, agentId = null, effects = null, cwd = null, allVerdicts = null }) {
  // An edge may be guarded by several gates — `approval-level` decides which of
  // them apply, the map only declares that they guard this edge. Before this,
  // `gate` was a single string and every level above `strict` promised gates
  // (code, qa, security, compliance) that no transition declared: the level
  // asked for a pause the map could not deliver, and a regulated archetype's
  // security + compliance floor was among them.
  const gatesOf = (g) => (Array.isArray(g) ? g : g ? [g] : []);
  const gateActive = (g) => {
    if (!g) return false;
    if (!activeGates) return true;                       // no policy supplied → unchanged behaviour
    const bare = String(g).replace(/^gate:/, '');
    return activeGates.includes(bare) || activeGates.includes(g);
  };
  const activeOf = (g) => gatesOf(g).filter(gateActive);
  // A verdict-keyed branch wins over the agent's default edge.
  //
  // `[transitions.l3-support.INCIDENT]` routes only the INCIDENT verdict; OK
  // still ends the chain. Without this, a token an agent is instructed to write
  // but the map does not list falls through the `onTokens` check below and
  // decideNext returns null — silence. l3-support shipped able to report an
  // incident into a pipeline that would not react to the word.
  //
  // Looked up before the default so a branch cannot be shadowed, and only for an
  // exact verdict match, so this cannot widen anything by accident.
  const branch = verdict?.verdict ? transitions[`${agent}.${verdict.verdict}`] : null;
  const rule = branch || transitions[agent] ||
    (agent.endsWith('-reviewer') ? { on: ['APPROVED', 'SIGNED-OFF', 'DONE'], next: ['senior-dev'] } : null);
  if (!rule) return null;

  if (!verdict) {
    // How it stopped decides what to ask for, and the two need opposite things.
    // An agent CUT OFF mid-loop cannot be asked for anything — it has to be
    // resumed with its context, and only the orchestrator can do that. This hook
    // runs in the orchestrator's context, which is why the directive can name the
    // action instead of describing the problem.
    if (lastStop?.shape === 'cut-off') {
      // What it left behind, stated rather than requested.
      //
      // This used to say "its work may already exist: check for changes it left
      // behind" — an instruction to go and look, which is only followed when the
      // reader chooses to. `attempt-effects` answers it instead, and answers
      // fail-closed: anything it could not establish counts as present, so the
      // advice never softens on missing information.
      const left = effects
        ? (effects.state === 'some'
            ? `It DID leave work behind (${effects.fields.join(', ')}) — re-running would duplicate it. `
            : effects.state === 'unknown'
              ? `Whether it left work behind could not be established (${effects.fields.join(', ')}), so treat it as though it did. `
              : 'It left nothing behind, so nothing would be duplicated — but it also made no progress to keep. ')
        : 'Its work may already exist: check for changes it left behind, INCLUDING in a git worktree under .claude/worktrees/. ';
      return {
        kind: 'resume',
        text: `PIPELINE: ${agent} was CUT OFF after ${lastStop.turns} turns — it never closed a turn, so it stopped mid-loop rather than concluding, and recorded no verdict. `
          + left
          + 'Check a git worktree under .claude/worktrees/ too. '
          + `RESUME it${agentId ? ` (SendMessage to: '${agentId}')` : ' with SendMessage, using the agentId from its result'} and ask it to record its verdict and close its task. `
          + 'Do NOT re-run it from scratch — a fresh run repeats work already done, and this one spent its whole budget.',
      };
    }
    return {
      kind: 'no-verdict',
      text: `PIPELINE: ${agent} finished but recorded no verdict line in ${VERDICT_DIR}/${agent}.log. ` +
        `Three-state completion requires it (shared/orchestrator.toml [completion]). ` +
        `Ask the agent (or run yourself): bash scripts/log-verdict.sh ${agent} <VERDICT> auto — then continue the pipeline.`,
    };
  }

  // REWORK: back to the agent that just ran, with a bound.
  //
  // The bound is the part that matters. "Send it back until it is right" with no
  // ceiling is an unbounded loop between two machines, and the failure mode is
  // not a crash — it is a pipeline that looks busy for hours. After MAX_REWORK
  // passes this stops being the agent's problem and becomes a decision, which is
  // what BLOCKED already means.
  if (verdict.verdict === REWORK_TOKEN) {
    const passes = countRework(agent, allVerdicts);
    if (passes >= MAX_REWORK) {
      return {
        kind: 'blocked',
        text: `PIPELINE-STOP: ${agent} has been sent back ${passes} times and still does not pass verification. `
          + `That is the ceiling — this is now a decision, not another pass. `
          + `Show the CTO the outstanding findings and what ${agent} changed on each attempt.`,
      };
    }
    return {
      kind: 'rework',
      text: `PIPELINE-REWORK: ${agent} did not pass independent verification (pass ${passes + 1} of ${MAX_REWORK}). `
        + `Re-spawn ${agent} with the verifier's findings quoted verbatim and require it to address each one. `
        + `Do NOT spawn ${((rule.next || []).join(', ')) || 'downstream agents'} — that work would rest on a stage that has not passed.`,
    };
  }

  if (BLOCKED_TOKENS.has(verdict.verdict)) {
    return {
      kind: 'blocked',
      text: `PIPELINE: ${agent} returned ${verdict.verdict} — the pipeline is halted at this stage. ` +
        `Surface the blocking findings to the CTO. Do NOT spawn ${((rule.next || []).join(', ')) || 'downstream agents'} until resolved.`,
    };
  }

  const onTokens = (rule.on || []).map(t => t.toUpperCase());
  if (!onTokens.includes(verdict.verdict)) return null; // unknown token — stay silent

  // Join quorum: partner branches must also have succeeded.
  const pendingJoin = (rule.join || []).filter(j => {
    const v = joinVerdicts?.[j];
    return !v || BLOCKED_TOKENS.has(v.verdict);
  });
  if (pendingJoin.length > 0) {
    return {
      kind: 'join-wait',
      text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}), but the parallel branch ` +
        `[${pendingJoin.join(', ')}] has not recorded a success verdict yet. ` +
        `If not already running, spawn it now (subagent_type: ${pendingJoin[0]}). ` +
        `Only after the full quorum: ${activeOf(rule.gate).length ? `surface ${activeOf(rule.gate).join(' + ')} to the CTO, then ` : ''}spawn ${(rule.next || []).join(' + ')}.`,
    };
  }

  // A legacy line is history, not a defect — the helper has written versioned
  // JSON since dda79037. Only a missing cost tag still matters, because
  // /api/cost reads it and a stage with no cost reports zero spend.
  const formatNote = verdict.hasCost === false
    ? ` NOTE: this verdict carries no cost — /api/cost will report zero spend for ${agent}.`
      + ` Record with: bash scripts/log-verdict.sh ${agent} ${verdict.verdict} auto`
    : '';

  const skip = resolveSkip({ rule, transitions, meta: verdict?.meta, activeGates, gateStates });

  // Budget is applied to the stages about to be dispatched, not to the one that
  // just finished — stopping an agent mid-run recovers nothing already spent.
  // `cwd` absent means the caller did not offer a project to read budgets from,
  // and an unread budget is not an exceeded one: everything proceeds.
  const budget = cwd
    ? applyAgentBudgets(skip.nexts, { cwd, verdicts: allVerdicts || [] })
    : { allowed: skip.nexts, held: [] };
  const nexts = budget.allowed;
  const heldNote = budget.held.length
    ? ` HELD BY BUDGET: ${budget.held.map((h) => h.why).join('; ')}.`
      + ` Raise the limit in .great_cto/PROJECT.md under \`agent-budgets:\` or accept the stage does not run.`
    : '';

  // Every next stage is over budget. This is a stop, and it says so — a stage
  // held for money that reported "succeeded, spawn nothing" would read exactly
  // like a pipeline that had finished.
  if (skip.nexts.length > 0 && nexts.length === 0) {
    return {
      kind: 'blocked',
      text: `PIPELINE-STOP: ${agent} succeeded (${verdict.verdict}), and every next stage is over its declared budget.`
        + heldNote + ` Nothing was dispatched.`,
    };
  }
  // ── independent verification, before anything is built on this stage ──────
  //
  // Split by cost, because this hook runs synchronously on every agent
  // transition and a judge takes ~30s per requirement:
  //
  //   enforced here   layer 1, "do the files this verdict names exist" — pure
  //                   file stats, microseconds, and the single most common way a
  //                   verdict is wrong. A stage that failed this does not
  //                   dispatch; the finding names the file and goes back to the
  //                   agent that claimed it.
  //   directed here   layers 2-3, acceptance commands and the second model. Too
  //                   slow to run inline, so the directive names the command and
  //                   the next stage waits on it.
  //
  // The asymmetry is deliberate and stated rather than silent: what this hook
  // can enforce, it enforces; what it cannot, it instructs and says so.
  const artefacts = cwd ? verifyClaimedArtefacts(agent, verdict, cwd) : null;
  if (artefacts && artefacts.state === 'rework') {
    return {
      kind: 'rework',
      text: `PIPELINE-REWORK: ${agent} reported ${verdict.verdict}, and the artefacts it named are not there. `
        + `${artefacts.detail} `
        + `Do NOT spawn ${(nexts.length ? nexts : skip.nexts).join(', ') || 'anything downstream'} — that work would rest on a stage that produced nothing. `
        + `Re-spawn ${agent} with these findings and require it to either write the artefact or drop the claim.`,
    };
  }

  const verifyCmd = `node scripts/lib/independent-verify.mjs ${agent}`;

  // Verification stopped being advisory.
  //
  // It was a sentence in a directive — "VERIFY FIRST: run …" — and a sentence is
  // followed when the reader chooses to. Measured on this repository: 31 agent
  // runs, 10 scores, and most of those ten were run by hand rather than by the
  // pipeline. A check that executes on a third of the work is not a gate, it is
  // a suggestion with good intentions.
  //
  // So the DISPATCH is now conditional on a score existing for THIS run, and the
  // hook stays fast by not doing the verifying itself — it declines to hand work
  // to the next stage until the judgement is on disk.
  //
  // The escape from a deadlock is deliberate and is not a bypass: `unverifiable`
  // is a valid score. Running the judge always unblocks the pipeline, even when
  // the honest answer is "nothing here could be checked". What cannot be done is
  // SKIPPING the look. `GREAT_CTO_REQUIRE_VERIFY=0` turns the gate off for
  // operators who need it off, and says so in the directive rather than
  // pretending the check passed.
  const requireVerify = process.env.GREAT_CTO_REQUIRE_VERIFY !== '0';
  const score = cwd ? latestScoreFor(cwd, agent, verdict?.ts) : null;
  if (requireVerify && cwd && !score) {
    return {
      kind: 'verify-wait',
      text: `PIPELINE-VERIFY: ${agent} reported ${verdict.verdict}, and nothing has checked it. `
        + `Run \`${verifyCmd}\` before spawning ${(skip.nexts || []).join(', ') || 'the next stage'}. `
        + `Exit 0 verified — proceed. Exit 1 rework — hand the findings back to ${agent}. `
        + `Exit 2 unverifiable — nothing could be checked; that is a recorded answer and the `
        + `pipeline may proceed, but say so to the CTO rather than treating it as a pass. `
        + `Set GREAT_CTO_REQUIRE_VERIFY=0 to dispatch without a check.`,
    };
  }
  const verifyNote = score
    ? ` VERIFIED: independent-verify recorded \`${score.state}\` for this run (${score.scorer}).`
    : ` NOT VERIFIED: the check is disabled (GREAT_CTO_REQUIRE_VERIFY=0); nothing has judged this stage.`;

  const skipNote = skip.skipped.length
    ? ` (skipping ${skip.skipped.join(', ')} — ${skip.why}; no active gate sat on that edge)`
    : '';
  if (nexts.length === 0) {
    return { kind: 'done', text: `PIPELINE: ${agent} succeeded (${verdict.verdict}) — end of chain. Report the outcome to the CTO.${formatNote}` };
  }

  // A gate the CTO has already approved is not a stopping point. Until this
  // read existed the machinery never asked, so approving a gate was one human
  // action and telling the orchestrator to continue was a second — the second
  // carrying no decision. `gateStates` is optional: without it every gate reads
  // as unapproved, which is the previous behaviour and the safe direction.
  const stateOf = (g) => gateStates?.[g]?.state ?? 'pending';
  const active = activeOf(rule.gate);
  const unapproved = active.filter((g) => stateOf(g) !== 'approved');

  if (active.length && !unapproved.length) {
    return {
      kind: 'next',
      text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}) and ${active.join(' + ')} `
        + `${active.length > 1 ? 'are' : 'is'} APPROVED → spawn ${nexts.map((n) => `Agent(subagent_type: ${n})`).join(' and ')} now. `
        + `Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.${skipNote}${formatNote}${verifyNote}`,
    };
  }

  if (unapproved.length) {
    const active = unapproved;
    const list = active.join(' + ');
    return {
      kind: 'gate',
      text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}). Next stage [${nexts.join(', ')}] is behind ${list} (human approval). ` +
        `Ensure the ${list} Beads task${active.length > 1 ? 's exist' : ' exists'} (bd list --label gate --status open), show the CTO the gate summary with artifact links, and WAIT for approval. ` +
        `${active.length > 1 ? 'EVERY one of them must be approved before proceeding. ' : ''}` +
        `After the CTO approves: close the gate bead${active.length > 1 ? 's' : ''} and spawn ${nexts.map(n => `subagent_type: ${n}`).join(', then ')}. Do not auto-approve.${formatNote}`,
    };
  }
  // A gate declared in the map but not active at this approval level is skipped
  // deliberately, and the directive says so — a silently-skipped gate would look
  // identical to a forgotten one, and the operator must be able to tell which
  // question they chose not to be asked.
  if (gatesOf(rule.gate).length) {
    return {
      kind: 'next',
      text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}) → spawn ${nexts.map(n => `Agent(subagent_type: ${n})`).join(' and ')} now. ` +
        `${gatesOf(rule.gate).join(' + ')} ${gatesOf(rule.gate).length > 1 ? 'are' : 'is'} declared in the pipeline map but NOT active at this approval level — the CTO delegated this decision, so do not wait for it. ` +
        `Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.` + heldNote + verifyNote,
    };
  }

  return {
    kind: 'next',
    text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}) → spawn ${nexts.map(n => `Agent(subagent_type: ${n})`).join(' and ')} now ` +
      `(parallel is safe — no gate between these stages). Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.` + heldNote + verifyNote,
  };
}

/**
 * Hold back any next stage whose agent has spent past its declared budget.
 *
 * Only MEASURED spend refuses. `agent-budgets:` in PROJECT.md is judged against
 * the sum of `cost_usd` across that agent's verdict records — the number an
 * agent actually reported spending — never against the board's time-based
 * estimate. An estimate is time multiplied by a rate constant, and halting a
 * pipeline on it would stop real work over arithmetic.
 *
 * @returns {{allowed: string[], held: Array<{agent: string, why: string}>}}
 */
/**
 * Every parsed verdict record in a project, newest last.
 *
 * `latestVerdict` answers "what did this agent just say"; a budget needs "what
 * has this agent spent", which is every record it ever wrote. Unparseable lines
 * are skipped — the parser owns the schema and returns null for anything it does
 * not recognise, and a line we could not read contributes no measured spend
 * rather than a guessed one.
 */
export function readAllVerdicts(dir) {
  const out = [];
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.log')); }
  catch { return out; }
  for (const f of files) {
    let text;
    try { text = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      const v = parseVerdictLine(line);
      if (v) out.push(v);
    }
  }
  return out;
}

export function applyAgentBudgets(nexts, { cwd, verdicts }) {
  let budgets;
  try {
    const md = readFileSync(join(cwd, '.great_cto', 'PROJECT.md'), 'utf8');
    budgets = parseAgentBudgets(md).budgets;
  } catch {
    // No PROJECT.md, or unreadable. A budget we could not read is not a budget
    // that was exceeded — proceed, exactly as before this feature existed.
    return { allowed: nexts, held: [] };
  }
  if (!budgets.size) return { allowed: nexts, held: [] };

  // Measured spend per agent, from the verdict records themselves.
  const measured = new Map();
  for (const v of (verdicts || [])) {
    if (!v?.agent || v.costUsd == null) continue;
    measured.set(v.agent, (measured.get(v.agent) || 0) + v.costUsd);
  }

  const allowed = [], held = [];
  for (const n of nexts) {
    const spend = measured.has(n) ? { real_llm_usd: measured.get(n), llm_usd: measured.get(n) } : undefined;
    const verdict = judgeAgentBudget({ agent: n, budgets, spend });
    if (budgetAllowsDispatch(verdict)) allowed.push(n);
    else held.push({ agent: n, why: verdict.why });
  }
  return { allowed, held };
}

/**
 * Which of the outcomes this run was.
 *
 * Read from `decision.kind`, which the decision already carries, rather than by
 * matching prose. A first version regexed `decision.text` and read a plain
 * dispatch as a hold — the word it keyed on appeared in an unrelated sentence
 * about a gate not being active. Classifying output by pattern-matching its own
 * wording is a guess dressed as a fact, and it was wrong on the first row.
 */
const OUTCOME_BY_KIND = Object.freeze({
  next: 'dispatch',
  resume: 'dispatch',
  gate: 'hold',
  'join-wait': 'hold',
  done: 'stop',
  blocked: 'stop',
  'no-verdict': 'no-verdict',
});

function journalOutcome({ decision, verdict, rule }) {
  if (!decision) {
    if (!rule) return 'no-rule';
    if (!verdict) return 'no-verdict';
    return 'unknown-verdict';
  }
  // The budget refusal is a `blocked` that is worth telling apart from every
  // other stop: it is the only one a person can lift by changing a number.
  if (/HELD BY BUDGET/.test(decision.text)) return 'blocked-budget';
  return OUTCOME_BY_KIND[decision.kind] || 'stop';
}

/** Why a run produced nothing — the sentence that did not exist before. */
function journalSilentWhy({ verdict, rule, agent }) {
  if (!rule) return `no [transitions.${agent}] in the map — its verdict names no next stage`;
  if (!verdict) return `no verdict from ${agent} within the freshness window`;
  return `verdict "${verdictToken(verdict)}" matches no on-list and no branch for ${agent}`;
}

/** The token out of a verdict record — the record is not the token. */
function verdictToken(v) {
  return typeof v === 'string' ? v : (v?.verdict ?? null);
}

function emit(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
  }) + '\n');
}

/** Gate approval for the gates on this edge, read once, failing safe to unapproved. */
function gateStatesFor(rule, verdict) {
  const gates = Array.isArray(rule?.gate) ? rule.gate : rule?.gate ? [rule.gate] : [];
  if (!gates.length) return null;
  return readGateStates(gates, readGateBeads(), { verdictTs: verdict?.ts ?? null });
}

async function main() {
  // The project root, for the journal. PROJ_DIR is `.great_cto` by default and
  // may be an absolute override.
  const PROJECT_ROOT = PROJ_DIR.replace(/\/?\.great_cto\/?$/, '') || '.';
  const MAP_SOURCE = PIPELINE_PATH === LOCAL_PIPELINE ? 'project' : 'plugin';
  // Never able to fail a dispatch: a journal whose failure stops the pipeline is
  // very much worse than no journal.
  const journal = (entry) => { try { recordRun(PROJECT_ROOT, { ...entry, mapSource: MAP_SOURCE }); } catch { /* the run still happened */ } };

  if (process.env.GREAT_CTO_DISABLE_DISPATCHER === '1') return process.exit(0);
  // Not a great_cto project: nothing to record, and nowhere to record it.
  if (!existsSync(PROJ_DIR)) return process.exit(0);
  if (!existsSync(PIPELINE_PATH)) {
    journal({ outcome: 'no-map', why: 'no pipeline map in the project or the plugin — the dispatcher cannot read a verdict' });
    return process.exit(0);
  }

  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return process.exit(0); }
  const toolInput = payload.tool_input || {};
  const agent = normalizeAgent(toolInput.subagent_type);
  if (!agent || agent === 'general-purpose' || agent === 'Explore' || agent === 'Plan') return process.exit(0);

  let transitions;
  try { transitions = parsePipelineToml(readFileSync(PIPELINE_PATH, 'utf8')); }
  catch (e) {
    journal({ agent, outcome: 'no-map', why: `the map at ${PIPELINE_PATH} could not be parsed: ${String(e?.message || e)}` });
    return process.exit(0);
  }

  const now = Date.now();
  let verdict = latestVerdict(VERDICT_DIR, agent, FRESH_MS, now);
  if (!verdict && agent.endsWith('-reviewer')) {
    // Reviewer wrote its TM + HANDOFF but skipped the verdict log — the
    // archetype-review-base HANDOFF block is an equally authoritative signal.
    verdict = handoffFallback(agent, FRESH_MS, now, {
      readdir: (d) => readdirSync(d),
      stat: (f) => statSync(f),
      read: (f) => readFileSync(f, 'utf8'),
    });
  }
  const rule = transitions[agent];
  const joinVerdicts = {};
  for (const j of (rule?.join || [])) {
    joinVerdicts[j] = latestVerdict(VERDICT_DIR, j, JOIN_MS, now);
  }

  // Which gates this project's approval-level actually asks for. Read failures
  // fall back to null = honour every gate in the map, so a missing PROJECT.md
  // makes the pipeline MORE cautious, never less.
  let activeGates = null;
  try {
    const pm = readFileSync(join(process.cwd(), '.great_cto', 'PROJECT.md'), 'utf8');
    const archetype = (pm.match(/^archetype:\s*(\S+)/m) || [])[1];
    activeGates = gatesForApprovalLevel(levelFromProjectMd(pm), { archetype });
  } catch { /* no PROJECT.md or helper — keep every gate */ }

  const shape = stopShapeFor(agentIdFrom(payload));
  if (!verdictBelongsToRun(verdict, shape?.startedAt)) verdict = null;

  // Only when there is no verdict. With one, the run concluded and what it left
  // behind is not in question — and this hook fires on every subagent
  // completion, so `git status` on the hot path would be a cost with no reader.
  let effects = null;
  if (!verdict) {
    try {
      const { observeEffects, summariseEffects } = await import('../lib/attempt-effects.mjs');
      const { execFileSync } = await import('node:child_process');
      let changedPaths = null;
      try {
        changedPaths = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', timeout: 5000 })
          .split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
      } catch { /* stays null → unknown → treated as present */ }
      let verdictSeenAt = null;
      try { verdictSeenAt = statSync(join(PROJ_DIR, 'verdicts', `${agent}.log`)).mtimeMs; } catch { /* absent */ }
      effects = summariseEffects(observeEffects({
        since: shape?.startedAt ?? null, verdictSeenAt, changedPaths, delivered: null,
      }));
    } catch { /* the advice falls back to asking the reader to look */ }
  }

  // Every verdict this project has recorded, for the budget check. Reading the
  // whole directory is what the budget needs — a cap is spend-to-date, not spend
  // since the last dispatch — and it is a handful of small append-only logs.
  //
  // Without this the feature was wired and never fired: `decideNext` defaulted
  // `cwd` to null, `applyAgentBudgets` was never reached, and every budget in
  // every project read as allowed. Declared and not consumed, shipped by the
  // person who spends his days closing exactly that.
  const allVerdicts = readAllVerdicts(VERDICT_DIR);

  const decision = decideNext({
    agent, transitions, verdict, joinVerdicts, activeGates, effects,
    cwd: PROJ_DIR.replace(/\/?\.great_cto\/?$/, '') || '.',
    allVerdicts,
    gateStates: gateStatesFor(rule, verdict),
    // The transcript first, `.last-stop` only if it is unreachable: the hook that
    // writes the latter does not run when the harness force-stops a subagent.
    lastStop: shape || readLastStop(PROJ_DIR),
    agentId: agentIdFrom(payload),
  });
  // Every run ends here, and every run is recorded — the ones that decided
  // something and, more importantly, the ones that did not. "Nothing should
  // happen" and "nothing could happen" produce identical output, and only a
  // reason written at the moment separates them afterwards.
  journal({
    agent, verdict: verdictToken(verdict),
    outcome: journalOutcome({ decision, verdict, rule }),
    next: decision?.nexts ?? [],
    why: decision ? decision.text.slice(0, 240) : journalSilentWhy({ verdict, rule, agent }),
  });
  if (decision) emit(decision.text);
  return process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
