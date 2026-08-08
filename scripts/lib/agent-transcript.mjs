#!/usr/bin/env node
/**
 * agent-transcript — find a subagent's transcript from the id its tool result
 * printed.
 *
 * Why this exists
 * ---------------
 * Cut-off detection was built on SubagentStop, which records how a subagent
 * stopped into `.great_cto/.last-stop`. On 2026-08-08 an agent was cut off after
 * 97 turns with 105 passing tests in a worktree — and nothing fired. Run by hand
 * against the same transcript the hook worked perfectly: it named the cut-off,
 * both worktrees, and correctly declined to block. It simply had not run.
 *
 * `cost-history.log` is appended by that same hook on every invocation, and its
 * last entry predated the agent by two hours. Either SubagentStop does not fire
 * when the harness force-stops a subagent, or it fires without a
 * `transcript_path`. Which of the two is unknown and does not matter: the hook is
 * unreliable in exactly the case it was written for.
 *
 * PostToolUse does fire — the Agent tool returned a result, and that result
 * carries the agentId. The transcript is on disk under the session directory, so
 * the dispatcher can read it itself and depend on nothing.
 *
 * The path is derived, not guessed: `CLAUDE_CODE_SESSION_ID` names the session
 * directory and the project slug is the cwd with every character outside
 * [A-Za-z0-9-] replaced by a hyphen — the same rule Claude Code uses for
 * `~/.claude/projects`. Nothing is scanned recursively: a hook that walks a
 * filesystem is a hook that stalls a session.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** cwd → the directory name Claude Code derives from it. */
export function slugForCwd(cwd) {
  return String(cwd || '').replace(/[^A-Za-z0-9-]/g, '-');
}

/**
 * Candidate roots for the session directory, most likely first.
 *
 * `/private/tmp/claude-<uid>` is what this host uses; `tmpdir()` covers the case
 * where it is configured elsewhere. Both are checked by existence, so a wrong
 * guess costs a stat.
 */
export function transcriptCandidates({
  agentId,
  cwd = process.cwd(),
  sessionId = process.env.CLAUDE_CODE_SESSION_ID,
  uid = typeof process.getuid === 'function' ? process.getuid() : null,
  tmp = tmpdir(),
} = {}) {
  if (!agentId || !/^[a-f0-9]{8,}$/i.test(agentId) || !sessionId) return [];
  const slug = slugForCwd(cwd);
  const roots = [];
  if (uid != null) roots.push(join('/private/tmp', `claude-${uid}`), join('/tmp', `claude-${uid}`));
  if (tmp) roots.push(tmp);
  return roots.map((r) => join(r, slug, sessionId, 'tasks', `${agentId}.output`));
}

/** The first candidate that exists, or null. */
export function findAgentTranscript(opts) {
  for (const p of transcriptCandidates(opts)) {
    try { if (existsSync(p)) return p; } catch { /* unreadable candidate */ }
  }
  return null;
}
