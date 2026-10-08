#!/usr/bin/env node
/**
 * orchestrator-check.mjs
 *
 * Runs at SubagentStart. Reads shared/orchestrator.toml and emits the active
 * rules in a concise block so every spawned agent starts with the same
 * machine-readable contract visible in its context.
 *
 * Also detects inline subagent anti-pattern (`claude -p "..."`) in Bash
 * commands passed via stdin (PreToolUse / Bash matcher).
 *
 * Zero external deps — Node.js 20+ built-ins only.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { cwd } from 'node:process';
import { appendEvent } from '../lib/agent-events.mjs';
import { contractPath } from '../lib/contract-path.mjs';
import { logVerdictCommand } from '../lib/log-verdict-path.mjs';
import { invocationIdentity } from '../lib/invocation-identity.mjs';

import { findToml, parseToml, run as inlineSubagentCheck } from '../lib/inline-subagent.mjs';

// ─── Main ─────────────────────────────────────────────────────────────────────
let STDIN = '';
try { if (!process.stdin.isTTY) STDIN = readFileSync(0, 'utf8'); } catch { /* no stdin */ }

// ADR-021: a subagent starting is an agent event. Before the toml check below,
// which exits for projects without a contract — the event is still a fact there.
try {
  const started = JSON.parse(STDIN || '{}');
  // Only a START is a start. Inside a subagent every Bash payload names the agent,
  // and this used to log each of those calls as one more agent starting.
  if (started.hook_event_name === 'SubagentStart') {
    appendEvent(process.env.GREAT_CTO_DIR || '.great_cto', { kind: 'agent-start', agent: started.agent_type, session: started.session_id });
  }
} catch { /* not JSON — a Bash-context payload, not a start */ }

// A Bash call gets the one rule that applies to it, and nothing else: the
// contract below is context for a starting agent, not output for every command.
let payloadEvent = '';
try { payloadEvent = JSON.parse(STDIN || '{}').hook_event_name || ''; } catch { /* raw text */ }
if (payloadEvent === 'PreToolUse' || (STDIN && !payloadEvent && !/"agent_type"/.test(STDIN))) {
  const r = inlineSubagentCheck(STDIN);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.code);
}

const tomlPath = findToml();

if (!tomlPath) {
  // No toml = no contract enforced (e.g. non-great_cto project). Silent exit.
  process.exit(0);
}

let cfg;
try {
  cfg = parseToml(readFileSync(tomlPath, 'utf8'));
} catch {
  process.exit(0);
}

// SubagentStart context injection — print active rules
const p = cfg.parallelism ?? {};
const a = cfg.authorization ?? {};
const c = cfg.completion ?? {};
const o = cfg.ownership ?? {};

console.log('=== ORCHESTRATOR CONTRACT (shared/orchestrator.toml) ===');
// Agent instructions say `bash scripts/log-verdict.sh` — a path that exists in the
// great_cto repository, not in the project this agent works in. Runs that could
// not find it died with "No such file", or recorded nothing. Say where it is.
console.log(`Record your verdict with      : ${logVerdictCommand()} <agent> <VERDICT> auto [meta...]`);
let identity = null;
try { identity = invocationIdentity(JSON.parse(STDIN || '{}')); } catch { /* legacy payload */ }
if (identity) console.log(`Required verdict metadata     : invocation_id=${identity} (this invocation only)`);
else console.log('Invocation identity           : unavailable; same-role concurrent completion is unverified');
console.log('  → `scripts/log-verdict.sh` in your instructions means exactly this file.');
console.log(`Decomposition matrix required : ${p.decomposition_matrix_required ?? '—'}`);
console.log(`Inline subagents allowed      : ${p.inline_subagents_allowed ?? '—'}`);
console.log(`Max parallel streams          : ${p.max_parallel_streams ?? '—'}`);
console.log(`Batch independent tool calls  : ${p.batch_independent_tool_calls ?? '—'}`);
console.log(`Lead may work during subagents: ${p.lead_may_continue_during_subagents ?? '—'}`);
if (p.batch_independent_tool_calls) {
  // Anthropic's wording, verbatim. It is reported to address the one-per-turn
  // behaviour; paraphrasing it would be untested rewriting of tested advice.
  console.log('  → First privately list what you need next; then request every item that');
  console.log("    doesn't depend on another's result in this one response.");
}
if (p.lead_may_continue_during_subagents) {
  console.log('  → After dispatching subagents you may KEEP WORKING on anything that does');
  console.log('    not depend on their results. Carrying on is not the same as peeking:');
  console.log('    do not query a running agent for partial results.');
}

// The ceiling above is what the contract ALLOWS. This line is what the project
// has actually used — and until it existed the two were never compared, so a
// pipeline that ran every stage one after another was indistinguishable from
// one that ran five at once, except for being slower. Slower is invisible in a
// verdict.
//
// It reports and never blocks. Work with no independent streams SHOULD be
// serial, and a guard that punished that would push people to parallelise
// things that share state — the one outcome worse than being slow.
//
// Best-effort: a hook that cannot read a journal still has a contract to print.
try {
  const { readJournalRuns, parallelismReport } = await import('../lib/agent-runs.mjs');
  const root = (typeof tomlPath === 'string' && tomlPath ? tomlPath : '').replace(/\/shared\/orchestrator\.toml$/, '') || '.';
  const { runs, untimed } = readJournalRuns(root);
  const rep = parallelismReport({ runs, declaredMax: p.max_parallel_streams ?? null, untimed });
  console.log(`Measured so far               : ${rep.summary}`);
} catch { /* the contract still prints */ }
console.log(`Authorization phrase required : ${a.spawn_phrase_required ?? '—'}`);
if (a.spawn_phrase_required) {
  console.log(`Authorization phrase          : "${a.spawn_phrase ?? ''}"`);
}
console.log(`3-state completion required   : ${c.three_state_completion ?? '—'}`);
console.log(`Acceptance evidence required  : ${c.acceptance_evidence_required ?? '—'}`);
console.log(`Strict file ownership         : ${o.strict_file_ownership ?? '—'}`);
console.log(`Overlap check required        : ${o.overlap_check_required ?? '—'}`);
console.log('=== END ORCHESTRATOR CONTRACT ===');
