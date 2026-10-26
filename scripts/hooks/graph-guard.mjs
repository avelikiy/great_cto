#!/usr/bin/env node
// PreToolUse on Agent|Task — the graph guard (ADR-039). See scripts/lib/graph-guard.mjs.
//
// Never blocks on its own failure: it guards a route, not data, so a log it
// cannot read is recorded as such and the call goes through.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectRoot } from '../lib/project-root.mjs';
import { appendEvent } from '../lib/agent-events.mjs';
import { isCovered } from '../lib/exceptions.mjs';
import { contractPath } from '../lib/contract-path.mjs';
import { parsePipelineToml } from '../lib/pipeline-toml.mjs';
import { latestSuccess, architectureBeforeBuild, edgeContract, decide, guardMode, stageName, PO_ON, ARCH_ON } from '../lib/graph-guard.mjs';

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
  // An unreadable log removes only the rule that needs it.
  const logs = new Map();
  const log = (agent) => { if (!logs.has(agent)) logs.set(agent, readLog(root, agent)); return logs.get(agent); };
  const violations = [];
  const poLog = log('product-owner');
  const archLog = log('architect');
  if (poLog.ok && archLog.ok) {
    violations.push(architectureBeforeBuild({
      target, po: latestSuccess(poLog.text, PO_ON), arch: latestSuccess(archLog.text, ARCH_ON),
    }));
  }
  let graph = null;
  try { graph = parsePipelineToml(readFileSync(contractPath('pipeline.toml', { cwd: root }), 'utf8')); } catch { /* no map: rule 2 has nothing to read */ }
  let unreadable = false;
  violations.push(edgeContract({
    target, graph,
    latest: (agent, on) => { const l = log(agent); if (!l.ok) { unreadable = true; return null; } return latestSuccess(l.text, on); },
    exists: (p) => existsSync(resolve(root, p)),
  }));
  if (unreadable) violations.pop();
  const found = violations.filter((v) => v.violated);
  if (!found.length) process.exit(0);
  const excepted = isCovered('graph', { root: join(root, '.great_cto', 'exceptions') });
  const denied = [];
  for (const violation of found) {
    const { action } = decide({ mode, violation, excepted });
    if (action === 'allow') continue;
    appendEvent(join(root, '.great_cto'), {
      kind: action === 'deny' ? 'denied' : 'hint', hook: 'graph-guard', agent: target,
      session: payload.session_id, outcome: `${action === 'deny' ? 'blocked' : 'would-block'}-${violation.rule}`,   // events.jsonl outcome: [a-z-] only
    });
    if (action === 'deny') denied.push(violation);
  }
  if (denied.length) {
    const fix = { 'architecture-before-build': 'Run architect first', 'edge-contract': 'Have that stage record what it produced' };
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: denied.map((v) => `Graph guard (ADR-039): ${v.why}. ${fix[v.rule]}, or record a signed exception: /exception graph "<why this edge is right here>".`).join(' '),
    } }));
  }
  process.exit(0);
} catch {
  process.exit(0);
}
