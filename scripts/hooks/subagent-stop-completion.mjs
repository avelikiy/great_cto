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

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
export function completionDecision({ threeState, recentVerdictExists }) {
  if (!threeState) return { ok: true, reason: 'three_state_completion off — no enforcement' };
  if (!recentVerdictExists) {
    return { ok: false, reason: 'subagent stopped without recording a verdict — three-state completion requires acceptance evidence. Record it: scripts/log-verdict.sh <agent> <verdict> <cost|auto> [meta...]' };
  }
  return { ok: true, reason: 'verdict recorded' };
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

function main() {
  if (process.env.GREAT_CTO_DISABLE_COMPLETION_CHECK === '1') return process.exit(0);
  try { readFileSync(0, 'utf8'); } catch { /* drain stdin, ignore */ }

  let flags = { threeState: false, acceptanceRequired: false };
  try { flags = readCompletionFlags(readFileSync(ORCH_PATH, 'utf8')); } catch { return process.exit(0); }

  const decision = completionDecision({
    threeState: flags.threeState,
    recentVerdictExists: recentVerdict(VERDICT_DIR, RECENT_MS, Date.now()),
  });
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
