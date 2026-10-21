#!/usr/bin/env node
// PreToolUse on Agent|Task — the graph guard (ADR-039). See scripts/lib/graph-guard.mjs.
//
// Never blocks on its own failure: it guards a route, not data, so a log it
// cannot read is recorded as such and the call goes through.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lib/project-root.mjs';
import { appendEvent } from '../lib/agent-events.mjs';
import { isCovered } from '../lib/exceptions.mjs';
import { latestSuccess, architectureBeforeBuild, decide, guardMode, stageName, PO_ON, ARCH_ON } from '../lib/graph-guard.mjs';

const readLog = (root, agent) => {
  try { return { ok: true, text: readFileSync(join(root, '.great_cto', 'verdicts', `${agent}.log`), 'utf8') }; }
  catch (e) { return e.code === 'ENOENT' ? { ok: true, text: '' } : { ok: false }; }
};

try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  if (!['Agent', 'Task'].includes(payload.tool_name)) process.exit(0);
  const root = projectRoot(payload.cwd || process.cwd());
  let projectMd;
  try { projectMd = readFileSync(join(root, '.great_cto', 'PROJECT.md'), 'utf8'); } catch { process.exit(0); }
  const mode = guardMode(projectMd);
  if (mode === 'off') process.exit(0);
  const target = stageName(payload.tool_input?.subagent_type);
  const poLog = readLog(root, 'product-owner');
  const archLog = readLog(root, 'architect');
  if (!poLog.ok || !archLog.ok) process.exit(0);
  const violation = architectureBeforeBuild({
    target, po: latestSuccess(poLog.text, PO_ON), arch: latestSuccess(archLog.text, ARCH_ON),
  });
  if (!violation.violated) process.exit(0);
  const excepted = isCovered('graph', { root: join(root, '.great_cto', 'exceptions') });
  const { action } = decide({ mode, violation, excepted });
  if (action === 'allow') process.exit(0);
  appendEvent(join(root, '.great_cto'), {
    kind: action === 'deny' ? 'denied' : 'hint', hook: 'graph-guard', agent: target,
    session: payload.session_id, outcome: `${action === 'deny' ? 'blocked' : 'would-block'}-${violation.rule}`,   // events.jsonl outcome: [a-z-] only
  });
  if (action === 'deny') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: `Graph guard (ADR-039): ${violation.why}. Run architect first, or record a signed exception: /exception graph "<why architecture is not needed here>".`,
    } }));
  }
  process.exit(0);
} catch {
  process.exit(0);
}
