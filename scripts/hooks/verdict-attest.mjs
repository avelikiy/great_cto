#!/usr/bin/env node
/**
 * verdict-attest — ADR-051 slice 2: the harness records which subagent wrote a verdict.
 *
 *   pre(raw, env)   runs inside bash-guards.mjs (PreToolUse, Bash), after the refusals:
 *                   inside a subagent it notes the length of that role's verdict log.
 *   post(raw, env)  is this file's own PostToolUse hook on Bash: the sealed lines of the
 *                   subagent's role that the call appended get a sealed attestation in
 *                   <state>/verdict-attestations.jsonl (scripts/lib/verdict-attestation.mjs).
 *
 * Neither ever blocks or prints to the model. A call from the main session, or from a
 * host whose payload carries no agent identity (Codex), records nothing, so its verdicts
 * read as self-reported. Running this file by hand from an agent's shell is refused by
 * verdict-authorship-guard: an attestation is the harness's word, not the agent's.
 *
 * Off switch: GREAT_CTO_DISABLE_VERDICT_ATTEST=1.
 */
import { PASS, readStdinOnce } from '../lib/guard-result.mjs';
import { notePre, attestAfter, roleOf } from '../lib/verdict-attestation.mjs';
import { verdictWrites } from './verdict-authorship-guard.mjs';
import { verdictStateDir } from '../lib/receipt.mjs';
import { isMainModule } from '../lib/is-main.mjs';

function parse(raw) {
  try { const d = JSON.parse(raw); return d && typeof d === 'object' ? d : null; } catch { return null; }
}

function callOf(raw, env) {
  if (env.GREAT_CTO_DISABLE_VERDICT_ATTEST === '1' || !raw) return null;
  const d = parse(raw);
  if (!d || d.tool_name !== 'Bash' || !d.agent_type || !d.agent_id) return null;
  const cwd = d.cwd || process.cwd();
  let stateDir;
  try { stateDir = verdictStateDir(cwd, env); } catch { return null; }
  return { stateDir, agentType: d.agent_type, agentId: d.agent_id, session: d.session_id, command: d.tool_input?.command };
}

/** PreToolUse half, as a bash-guards reminder: never denies, never prints. */
export function pre(raw, env = process.env) {
  const call = callOf(raw, env);
  if (call) notePre(call);
  return PASS;
}

/** PostToolUse half. Returns the attestations written (for tests). */
export function post(raw, env = process.env) {
  const call = callOf(raw, env);
  if (!call) return [];
  // How many times this call ran the writer for the subagent's own role, spelled out.
  const role = roleOf(call.agentType);
  const expected = verdictWrites(call.command).filter((r) => r === role).length;
  return attestAfter({ ...call, expected });
}

if (isMainModule(import.meta.url)) {
  post(readStdinOnce());
  process.exit(0);
}
