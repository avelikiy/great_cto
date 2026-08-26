#!/usr/bin/env node
/**
 * subagent-stop-completion — SubagentStop hook giving orchestrator.toml's
 * [completion] contract teeth (DEEPEN-PIPELINE Wave 2).
 *
 * orchestrator.toml declares three_state_completion + acceptance_evidence_required,
 * but nothing enforced them — an agent could return having written no verdict and
 * no artifact, and nothing noticed. This hook checks, when a subagent stops, that a
 * verdict was actually recorded (the acceptance-evidence half of three-state
 * completion). A verdict line is written by scripts/log-verdict.sh into
 * .great_cto/verdicts/<agent>.log.
 *
 * Safe by default: ADVISORY (stderr note, exit 0). Opt in to enforcement with
 *   GREAT_CTO_ENFORCE_COMPLETION=block   → exit 2 (SubagentStop is asked to continue,
 *                                          the agent is told to record its verdict)
 * Opt out entirely with
 *   GREAT_CTO_DISABLE_COMPLETION_CHECK=1
 *
 * I/O (Claude Code SubagentStop):
 *   stdin:  { ... }   (payload tolerated but not required)
 *   stdout: silent on OK
 *   exit:   0 = allow stop (advisory note on stderr if incomplete)
 *           2 = block stop (only when GREAT_CTO_ENFORCE_COMPLETION=block AND incomplete)
 */

import { readFileSync, readdirSync, statSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVerdictLine } from './pipeline-dispatcher.mjs';
import { checkArtifacts, explainArtifacts } from '../lib/artifact-claims.mjs';
import { checkExecution, explainExecution } from '../lib/execution-claims.mjs';
import { stopShape, stopRemedy } from '../lib/stop-shape.mjs';
import { worktreesWithChanges, explainWorktrees } from '../lib/worktree-state.mjs';
import { fileURLToPath } from 'node:url';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const ORCH_PATH = join('shared', 'orchestrator.toml');
const VERDICT_DIR = join(PROJ_DIR, 'verdicts');
const RECENT_MS = 5 * 60 * 1000; // a verdict written in the last 5 min counts as "this stop"

/** Parse the [completion] flags from orchestrator.toml text. */
export function readCompletionFlags(tomlText) {
  const seg = String(tomlText).match(/\[completion\]([\s\S]*?)(?=\n\[|$)/);
  const body = seg ? seg[1] : '';
  const flag = (name) => {
    const m = body.match(new RegExp(`^\\s*${name}\\s*=\\s*(true|false)`, 'm'));
    return m ? m[1] === 'true' : false;
  };
  return {
    threeState: flag('three_state_completion'),
    acceptanceRequired: flag('acceptance_evidence_required'),
  };
}

/**
 * Pure completion decision.
 * @param {{threeState:boolean, recentVerdictExists:boolean}} s
 * @returns {{ok:boolean, reason:string}}
 */
/**
 * Should this stop be BLOCKED so the agent finishes its contract, or only noted?
 *
 * Eight agents over two days; six recorded no verdict. Without one the dispatcher
 * names no next stage, so each of those six stopped the pipeline and a human
 * wrote the verdict by hand. `stop-shape` tells the two causes apart — and
 * nothing acted on the difference, which is what made the distinction academic.
 *
 * Blocking works for exactly one of them. An agent that FINISHED and forgot has
 * context and budget: asking for the last step is a request it can satisfy. An
 * agent that was CUT OFF cannot answer, so blocking it is asking a dead agent to
 * speak — and, worse, invites the loop this guard would otherwise be.
 *
 * Once per agent, whatever happens. A hook that can refuse a stop indefinitely
 * is a hang, not a guardrail.
 */
export function shouldBlockStop({ decision, stop, blockedBefore, forced = false }) {
  if (decision?.ok) return { block: false, why: 'the contract is complete' };
  if (blockedBefore) return { block: false, why: 'this agent was already asked once' };
  if (forced) return { block: true, why: 'enforcement was requested explicitly' };

  const shape = stop?.shape;
  if (shape === 'reported') {
    return { block: true, why: 'the agent finished and has the context to record its verdict' };
  }
  if (shape === 'cut-off') {
    return { block: false, why: 'the agent was cut off — it cannot answer, and blocking it would loop' };
  }
  return { block: false, why: `stop shape is ${shape ?? 'unknown'} — not something a block can fix` };
}

export function completionDecision({ threeState, recentVerdictExists, canonical = true, hasCost = true, artifacts = null, execution = null, stop = null }) {
  if (!threeState) return { ok: true, reason: 'three_state_completion off — no enforcement' };
  if (!recentVerdictExists) {
    // WHY there is no verdict decides what to do about it, and the two causes
    // are indistinguishable in the pipeline's own record. An agent that finished
    // and forgot has context to record it; one that was cut off does not, and
    // telling it to try again re-runs work already done.
    const remedy = stop ? stopRemedy({ ...stop, hasVerdict: false }) : null;
    return {
      ok: false,
      reason: remedy
        ? remedy.text
        : 'subagent stopped without recording a verdict — three-state completion requires acceptance evidence. Record it: scripts/log-verdict.sh <agent> <verdict> <cost|auto> [meta...]',
    };
  }
  // An earlier version of this check FAILED completion for a versioned-JSON
  // verdict, on the belief that the pipe form was canonical. It is the other way
  // round: scripts/log-verdict.sh has written versioned JSON since dda79037, and
  // the pipe dialects are history the readers still accept. Failing an agent for
  // using the helper correctly is worse than the stall it was meant to prevent,
  // so format is reported, never enforced.
  if (!canonical) {
    return {
      ok: true,
      reason: 'verdict recorded in a legacy text dialect — readable, but scripts/log-verdict.sh now writes versioned JSON',
    };
  }
  // The cheapest rung of the evidence ladder, and the only one that fits in a
  // hook that runs on every subagent stop: a path the verdict names either
  // exists with content, or the claim is not true. Presence of a verdict says
  // the agent reported; this says it did something.
  const artifactNote = artifacts && !artifacts.ok ? explainArtifacts(artifacts) : null;
  if (artifactNote) {
    return { ok: false, reason: artifactNote };
  }
  // The rung above artefacts: the check the verdict cites is re-run, and a
  // success verdict whose own check fails does not stand. Only runs when the
  // agent names a command — see execution-claims for why the allowlist, not the
  // agent, decides what may be executed.
  const execNote = execution && !execution.ok ? explainExecution(execution) : null;
  if (execNote) {
    return { ok: false, reason: execNote };
  }
  if (!hasCost) {
    return {
      ok: false,
      reason: 'verdict has no cost=$<usd> tag — /api/cost reports zero for this stage. '
        + 'Re-record with: bash scripts/log-verdict.sh <agent> <verdict> auto [meta...]',
    };
  }
  return { ok: true, reason: 'verdict recorded' };
}

/** Read a file, or '' — a config we cannot read must not throw inside a hook. */
function safeRead(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

/**
 * The freshest verdict line, parsed — so the check can look at its FORMAT and
 * not only at whether a file was touched.
 */
export function freshestVerdictLine(dir, withinMs, now) {
  let best = null, bestMt = 0;
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.log')); } catch { return null; }
  for (const f of files) {
    let mt;
    try { mt = statSync(join(dir, f)).mtimeMs; } catch { continue; }
    if (now - mt > withinMs || mt <= bestMt) continue;
    let body;
    try { body = readFileSync(join(dir, f), 'utf8').trim(); } catch { continue; }
    if (!body) continue;
    const parsed = parseVerdictLine(body.split('\n').pop());
    if (!parsed) continue;
    bestMt = mt; best = parsed;
  }
  return best;
}

/** True if any verdict log was modified within `withinMs` of `now`. */
export function recentVerdict(dir, withinMs, now) {
  if (!existsSync(dir)) return false;
  let logs;
  try { logs = readdirSync(dir).filter(f => f.endsWith('.log')); } catch { return false; }
  for (const f of logs) {
    try {
      const m = statSync(join(dir, f)).mtimeMs;
      if (now - m <= withinMs) return true;
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Record MEASURED cost for the just-finished subagent, from its transcript.
 * pxpipe discipline: measure the real token usage instead of estimating — so
 * the board's cost is measured, not a task-minute guess. Writes a
 * "<verdict-ts> <agent> <usd>" line to .great_cto/cost-history.log, which
 * readVerdicts() uses to fill any verdict that lacks a cost tag (matched by
 * minute+agent, so it never double-counts an agent-reported cost).
 * Fail-open at every step; opt out with GREAT_CTO_NO_MEASURED_COST=1.
 */
/**
 * The ISO timestamp of one verdict line, in either format it may be written in.
 *
 * Returns null rather than a guess when the line is neither — a cost attributed
 * to the wrong minute is worse than a cost recorded against `now`, because it
 * silently attaches to some other agent's run.
 */
function verdictTimestamp(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{')) {
    try {
      const ts = JSON.parse(raw).ts;
      return typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(ts) ? ts : null;
    } catch { return null; }
  }
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\S*)/);
  return m ? m[1] : null;
}

/**
 * The largest turn count that can plausibly be ONE subagent run.
 *
 * Not a tuning knob — a discriminator. Agent runs in this repository's own logs
 * sit in the tens; the session transcript that produced a $3,385 "qa-engineer"
 * cost carried 9,103. Anything above this is a session, and attributing a
 * session to an agent is the defect this bound exists to catch. Generous on
 * purpose: a false "unattributed" costs a per-agent figure, a false attribution
 * costs the operator a budget decision made on a number off by two orders.
 */
const MAX_RUN_TURNS = 400;

async function recordMeasuredCost(stdin) {
  if (process.env.GREAT_CTO_NO_MEASURED_COST === '1') return;
  try {
    const tp = JSON.parse(stdin || '{}').transcript_path;
    if (!tp || !existsSync(tp)) return;
    const { usageFromTranscript } = await import('../lib/usage-from-transcript.mjs');
    const measured = usageFromTranscript(tp);
    const { usd } = measured;
    if (!(usd > 0)) return;

    // A figure that cannot belong to ONE agent run must not be recorded as one.
    //
    // The host hands this hook a `transcript_path`, and when that path is the
    // SESSION transcript rather than the subagent's, the whole session's spend
    // lands on whichever verdict file was written last. Observed on this
    // repository: $3,385 against four qa-engineer runs, and the board showed it
    // under a `measured` label — a wrong number wearing the badge of a right one,
    // which is worse than showing nothing.
    //
    // The turn count is the tell. A subagent run is tens of turns; the reading
    // that produced $3,385 carried 9,103, and the session transcript holds 9,266.
    // So a measurement above this bound is recorded as UNATTRIBUTED rather than
    // silently attached to an agent. It stays in the file — the spend is real and
    // deleting it would understate the total — but it cannot be read as one
    // stage's cost, and a reader that wants per-agent figures skips it.
    if (measured.turns > MAX_RUN_TURNS) {
      appendFileSync(join(PROJ_DIR, 'cost-history.log'),
        `${new Date().toISOString().replace(/\.\d+Z$/, 'Z')} (unattributed) ${usd} turns=${measured.turns}\n`);
      return;
    }
    // Most-recently-written verdict file → agent name + its timestamp (so the
    // cost-history minute+agent key matches the verdict readVerdicts sees).
    if (!existsSync(VERDICT_DIR)) return;
    let newest = null, newestMtime = 0;
    for (const f of readdirSync(VERDICT_DIR)) {
      if (!f.endsWith('.log')) continue;
      const m = statSync(join(VERDICT_DIR, f)).mtimeMs;
      if (m > newestMtime) { newestMtime = m; newest = f; }
    }
    if (!newest) return;
    const agent = newest.replace(/\.log$/, '');
    const lines = readFileSync(join(VERDICT_DIR, newest), 'utf8').trim().split('\n');
    // The timestamp of the verdict this cost belongs to.
    //
    // This was `match(/^(\S+)/)` — the first run of non-space characters, which
    // is a timestamp only in the LEGACY pipe-delimited format. Verdicts have been
    // versioned JSON since dda79037, and compact JSON contains no spaces, so
    // `\S+` captured the ENTIRE record as the timestamp. Every line written since
    // then reads `{"v":1,...}  senior-dev  0.42` — and the reader, which keys on
    // the first 16 characters, matched nothing. 55 lines of a file nobody could
    // use, and no symptom anywhere: the board showed estimated costs and looked
    // like a board with no measurements rather than one with a broken writer.
    const lastTs = verdictTimestamp(lines[lines.length - 1]) || new Date().toISOString();
    // `turns=` makes the attribution auditable. The cost of ONE agent run and
    // the cost of the whole session are both just a number in this column, and
    // the file already holds lines of ~$9,000 against a single qa-engineer run —
    // a session total that landed on one agent and nothing could tell you so.
    // A turn count next to it makes that visible at a glance.
    //
    // Trailing field, deliberately: nine readers parse this file with their own
    // regexes and awk `$3`, and all of them keep working.
    appendFileSync(join(PROJ_DIR, 'cost-history.log'),
                   `${lastTs} ${agent} ${usd} turns=${measured.turns || 0}\n`);
  } catch { /* fail-open — never block a subagent stop */ }
}

async function main() {
  if (process.env.GREAT_CTO_DISABLE_COMPLETION_CHECK === '1') return process.exit(0);
  let stdin = '';
  try { stdin = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  await recordMeasuredCost(stdin);

  let flags = { threeState: false, acceptanceRequired: false };
  try { flags = readCompletionFlags(readFileSync(ORCH_PATH, 'utf8')); } catch { return process.exit(0); }

  const fresh = freshestVerdictLine(VERDICT_DIR, RECENT_MS, Date.now());
  // How the subagent stopped — read from the transcript the hook is already given.
  let stop = null;
  try {
    const tp = JSON.parse(stdin || '{}').transcript_path;
    if (tp) {
      const sh = stopShape(tp);
      stop = { shape: sh.shape, turns: sh.turns, agent: fresh?.agent || null };
      // Handed to the dispatcher, which runs in the ORCHESTRATOR's context and
      // is the only thing here that can resume anything. A hook cannot call
      // SendMessage; the orchestrator can, and it does not know how the subagent
      // stopped. This file is the one place both of them see.
      try {
        mkdirSync(PROJ_DIR, { recursive: true });
        writeFileSync(join(PROJ_DIR, '.last-stop'), JSON.stringify({ ...stop, ts: new Date().toISOString() }) + '\n');
      } catch { /* the dispatcher falls back to its generic message */ }
    }
  } catch { /* no transcript — the generic message still applies */ }
  const decision = completionDecision({
    threeState: flags.threeState,
    recentVerdictExists: recentVerdict(VERDICT_DIR, RECENT_MS, Date.now()),
    canonical: fresh ? fresh.canonical !== false : true,
    hasCost: fresh ? fresh.hasCost !== false : true,
    stop,
    artifacts: fresh ? checkArtifacts(fresh.meta) : null,
    // Off unless asked for: re-running a suite on every subagent stop is a real
    // cost, and a hook that quietly adds minutes to every stage is a tax nobody
    // agreed to. GREAT_CTO_VERIFY_EXECUTION=1 turns it on.
    // The command comes from [verify] in orchestrator.toml — the repository
    // owner's file — keyed by the agent that just wrote the verdict. It is NOT
    // taken from the verdict, which agents write; that was three CRITICALs.
    execution: fresh && process.env.GREAT_CTO_VERIFY_EXECUTION === '1'
      ? checkExecution(
        { agent: fresh.agent, orchestratorToml: safeRead(ORCH_PATH) },
        { timeoutMs: Number(process.env.GREAT_CTO_VERIFY_TIMEOUT_MS || 120_000) },
      )
      : null,
  });
  // Reported separately from the completion decision, and never blocking: a
  // worktree with changes is the normal state while agents are working, and
  // several may be live during a parallel fan-out. The failure is silence at the
  // moment one stops, not the existence of uncommitted work.
  try {
    const note = explainWorktrees(worktreesWithChanges());
    if (note) process.stderr.write(`[great_cto:worktree] ${note}\n`);
  } catch { /* never break a subagent stop over a report */ }

  if (decision.ok) return process.exit(0);

  process.stderr.write(`[great_cto:completion] ${decision.reason}\n`);

  // Blocking is now the default for the one case it can fix — an agent that
  // finished and forgot — because six of eight agents over two days stopped
  // without a verdict and a human wrote each one by hand. GREAT_CTO_ENFORCE_
  // COMPLETION=block still forces it for the rest; =off disables it entirely.
  const forced = process.env.GREAT_CTO_ENFORCE_COMPLETION === 'block';
  if (process.env.GREAT_CTO_ENFORCE_COMPLETION === 'off') return process.exit(0);

  const marker = join(PROJ_DIR, `.completion-asked-${(stop?.agent || 'unknown').replace(/[^\w-]/g, '')}`);
  let blockedBefore = false;
  try { blockedBefore = existsSync(marker); } catch { /* unreadable — may ask twice */ }

  const b = shouldBlockStop({ decision, stop, blockedBefore, forced });
  if (!b.block) {
    process.stderr.write(`[great_cto:completion] not blocking — ${b.why}\n`);
    return process.exit(0);
  }

  try { mkdirSync(PROJ_DIR, { recursive: true }); writeFileSync(marker, `${new Date().toISOString()}\n`); }
  catch { /* a marker we cannot write means we may ask twice; not a hang */ }

  process.stderr.write('[great_cto:completion] BLOCKED stop — record the verdict, then finish. Asked once; this will not repeat.\n');
  return process.exit(2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
