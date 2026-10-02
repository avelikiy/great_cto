#!/usr/bin/env node
/** Admission before Agent/Task; foreground-only completion releases exact lease. */
import { readFileSync } from 'node:fs';
import { readExecutionBudget, requireAgents, releaseAgent, budgetSnapshot } from '../lib/agent-execution-budget.mjs';
import { projectRoot } from '../lib/project-root.mjs';

const phase = process.argv[2];
if (!process.env.GREAT_CTO_AGENT_BUDGET_FILE) process.exit(0);
try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  if (!['Agent', 'Task'].includes(payload.tool_name)) process.exit(0);
  if (!payload.cwd || !/^[a-zA-Z0-9_-]{1,200}$/.test(payload.session_id || '') || !/^[a-zA-Z0-9_-]{1,200}$/.test(payload.tool_use_id || '')) throw Error('budget requires host-provided cwd/session/tool identity');
  const budget = readExecutionBudget(projectRoot(payload.cwd));
  const callId = `${payload.session_id}:${payload.tool_use_id}`;
  if (phase === 'pre') {
    if (process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS !== '1' || payload.tool_input?.run_in_background || payload.tool_input?.team_name || payload.tool_input?.name) throw Error('budget v1 requires foreground-only Claude; set CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, no background/team/name launches');
    if (payload.agent_id) throw Error('nested agent delegation denied by maxDepth=1');
    const [lease] = requireAgents(budget, [{ callId, host: 'claude-code', role: payload.tool_input?.subagent_type || 'worker', depth: 1, ownerPid: null }]);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `Shared agent budget: admitted foreground call (fence ${lease.fence}); do not spawn nested agents or detach this call.` } }));
  } else if (phase === 'post') {
    if (payload.hook_event_name !== 'PostToolUse' || process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS !== '1') throw Error('completion not confirmed; lease retained for reconciliation');
    const lease = budgetSnapshot(budget).active.find(l => l.runKey === budget.runKey && l.callId === callId && l.host === 'claude-code');
    if (lease) releaseAgent(budget, lease);
  } else throw Error('unknown budget hook phase');
} catch (error) {
  process.stderr.write(`Shared agent budget: ${error.message}\n`);
  if (phase === 'pre') process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Shared agent budget: ${error.message}` } }));
  process.exit(2);
}
