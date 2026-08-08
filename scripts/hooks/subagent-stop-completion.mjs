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

import { readFileSync, readdirSync, statSync, existsSync, appendFileSync } from 'node:fs';
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
async function recordMeasuredCost(stdin) {
  if (process.env.GREAT_CTO_NO_MEASURED_COST === '1') return;
  try {
    const tp = JSON.parse(stdin || '{}').transcript_path;
    if (!tp || !existsSync(tp)) return;
    const { usageFromTranscript } = await import('../lib/usage-from-transcript.mjs');
    const { usd } = usageFromTranscript(tp);
    if (!(usd > 0)) return;
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
    const lastTs = (lines[lines.length - 1].match(/^(\S+)/) || [])[1] || new Date().toISOString();
    appendFileSync(join(PROJ_DIR, 'cost-history.log'), `${lastTs} ${agent} ${usd}\n`);
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
    if (tp) { const sh = stopShape(tp); stop = { shape: sh.shape, turns: sh.turns, agent: fresh?.agent || 'the agent' }; }
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

  const enforce = process.env.GREAT_CTO_ENFORCE_COMPLETION === 'block';
  process.stderr.write(`[great_cto:completion] ${decision.reason}\n`);
  if (enforce) {
    process.stderr.write('[great_cto:completion] BLOCKED stop (GREAT_CTO_ENFORCE_COMPLETION=block). Record the verdict, then finish.\n');
    return process.exit(2);
  }
  return process.exit(0); // advisory only
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
