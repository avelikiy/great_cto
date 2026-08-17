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
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatesForApprovalLevel, levelFromProjectMd } from '../lib/approval-level.mjs';
import { readGateBeads, gateStates as readGateStates } from '../lib/gate-state.mjs';
import { parseVerdictLine as parseVerdictRecord } from '../lib/verdict-record.mjs';
import { findAgentTranscript, transcriptStartedAt } from '../lib/agent-transcript.mjs';
import { stopShape } from '../lib/stop-shape.mjs';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const PIPELINE_PATH = join('shared', 'pipeline.toml');
const VERDICT_DIR = join(PROJ_DIR, 'verdicts');
// A verdict is "fresh" if written in the last 30 min — long enough for a slow
// subagent's closing writes, short enough not to resurrect yesterday's run.
// Exported so scripts/lib/pipeline-position.mjs shares this one boundary
// instead of hardcoding its own 30-min constant.
export const FRESH_MS = 30 * 60 * 1000;
// Join-quorum partner verdicts may be hours old (parallel branches).
const JOIN_MS = 24 * 60 * 60 * 1000;

const BLOCKED_TOKENS = new Set(['BLOCKED', 'FAIL', 'FAILED', 'REJECTED']);

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

export function decideNext({ agent, transitions, verdict, joinVerdicts, activeGates = null, gateStates = null, lastStop = null, agentId = null }) {
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
      return {
        kind: 'resume',
        text: `PIPELINE: ${agent} was CUT OFF after ${lastStop.turns} turns — it never closed a turn, so it stopped mid-loop rather than concluding, and recorded no verdict. `
          + 'Its work may already exist: check for changes it left behind, INCLUDING in a git worktree under .claude/worktrees/. '
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
  const nexts = skip.nexts;
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
        + `Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.${skipNote}${formatNote}`,
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
        `Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.`,
    };
  }

  return {
    kind: 'next',
    text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}) → spawn ${nexts.map(n => `Agent(subagent_type: ${n})`).join(' and ')} now ` +
      `(parallel is safe — no gate between these stages). Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.`,
  };
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

function main() {
  if (process.env.GREAT_CTO_DISABLE_DISPATCHER === '1') return process.exit(0);
  if (!existsSync(PROJ_DIR) || !existsSync(PIPELINE_PATH)) return process.exit(0);

  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return process.exit(0); }
  const toolInput = payload.tool_input || {};
  const agent = normalizeAgent(toolInput.subagent_type);
  if (!agent || agent === 'general-purpose' || agent === 'Explore' || agent === 'Plan') return process.exit(0);

  let transitions;
  try { transitions = parsePipelineToml(readFileSync(PIPELINE_PATH, 'utf8')); } catch { return process.exit(0); }

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

  const decision = decideNext({
    agent, transitions, verdict, joinVerdicts, activeGates,
    gateStates: gateStatesFor(rule, verdict),
    // The transcript first, `.last-stop` only if it is unreachable: the hook that
    // writes the latter does not run when the harness force-stops a subagent.
    lastStop: shape || readLastStop(PROJ_DIR),
    agentId: agentIdFrom(payload),
  });
  if (decision) emit(decision.text);
  return process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
