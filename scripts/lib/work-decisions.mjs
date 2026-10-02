/** Host-owned approval adapter. Ordinary resume never approves a proposal. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readWorkTask, beginWork, finishWork, publicWorkTask } from './work-tasks.mjs';
export function decisionCapabilities(task) {
  const busy = task.operations.some(o => o.state === 'running');
  return publicWorkTask(task).decisions.map(d => ({ ...d, capability: {
    action: d.engine === 'codex' ? 'approve' : 'native_host',
    enabled: !busy && !['stale', 'unverifiable'].includes(d.bindingState) && d.engine === 'codex' && task.managed !== false,
    reason: d.bindingState === 'stale' ? 'Proposal receipt is stale; refresh it inside its host' : busy ? 'Operation owns this task' : d.engine === 'claude-code' ? 'Native permission and pipeline decisions stay inside the bound Claude session' : null,
  } }));
}
export function approveWorkDecision({ root, taskId, decisionId, expectedRevision, operationId }, { execute = spawnSync, ...options } = {}) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || !/^[0-9a-f]{64}$/.test(decisionId || '')) throw Error('approval requires a decision identity and revision');
  const task = readWorkTask(taskId, { ...options, root });
  if (task.host !== 'codex') throw Error('native host approval has no remote capability; respond inside Claude');
  const work = beginWork({ root, taskId, host: task.host, kind: 'approve', expectedRevision, operationId, data: { decisionId } }, options);
  if (work.replay) return publicWorkTask(work.task);
  try {
    if (task.links.runs.length !== 1 || !(task.decisions || []).some(d => d.decisionId === decisionId)) throw Error('decision is missing, stale or ambiguous');
    const controller = fileURLToPath(new URL('../codex-pipeline.mjs', import.meta.url));
    const result = execute(process.execPath, [controller, 'approve-task', task.links.runs[0], '--decision', decisionId, '--operation', work.operation.operationId],
      { encoding: 'utf8', env: { ...process.env, ...(options.store ? { GREAT_CTO_TASKS_DIR: options.store } : {}), GREAT_CTO_WORK_LEASE: work.lease.token } });
    const code = result.error ? 2 : result.status ?? 2;
    finishWork(taskId, work.operation.operationId, code, { ...options, root });
    if (code !== 0) throw Error('host refused approval: ' + String(result.stderr || result.error?.message || 'inspect host state').trim().slice(0, 500));
    return publicWorkTask(readWorkTask(taskId, { ...options, root }));
  } catch (e) {
    const latest = readWorkTask(taskId, { ...options, root });
    if (latest.operations.find(o => o.operationId === work.operation.operationId)?.state === 'running') finishWork(taskId, work.operation.operationId, 2, { ...options, root });
    throw e;
  } finally { work.lease.release(); }
}
