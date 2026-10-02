/** Explicit operator attestations, bound to criteria, actual bytes and host state. */
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';
import { createHash } from 'node:crypto';
import { treeReceipt } from './receipt.mjs';
import { codexRunStore } from './codex-host-state.mjs';
import { assertExternal, readWorkTask, mutateWorkTask, beginWork, finishWork, publicWorkTask } from './work-tasks.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function readOutcomeEvidence(root, file) {
  const path = resolve(file); assertExternal(root, path);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 65536) throw Error('evidence must be an external private regular file (0600, <=64 KiB)');
  const raw = readFileSync(path); return { document: JSON.parse(raw), digest: hash(raw) };
}
function artifact(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.includes('\\')) throw Error('invalid outcome artifact path');
  const resolved = resolve(root, path), actual = realpathSync(resolved), rel = relative(root, actual);
  if (actual !== resolved || !rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !lstatSync(actual).isFile()) throw Error('outcome artifact must be a project regular file without symlinks');
  return { path, sha256: hash(readFileSync(actual)) };
}
export function assertHostSettled(task, { runsStore = codexRunStore() } = {}) {
  if ((task.decisions || []).length || ['working', 'needs_decision', 'publishing', 'cancelled', 'blocked'].includes(task.phase)) throw Error('host state is not settled for acceptance');
  if (task.host === 'claude-code') {
    if (task.links.sessions.length !== 1 || (task.managed === false && !task.nativeSessionEnded)) throw Error('native session ownership is not settled');
    return;
  }
  if (task.links.runs.length !== 1) throw Error('controlled run link is missing or ambiguous');
  const id = task.links.runs[0], path = join(runsStore, id + '.json'), info = lstatSync(path);
  if (info.isSymbolicLink() || (info.mode & 0o077)) throw Error('unsafe controlled run state');
  const run = JSON.parse(readFileSync(path, 'utf8'));
  if (run.id !== id || run.taskId !== task.taskId || run.root !== task.root || run.status !== 'done' || run.active || run.pending || run.wave?.status === 'running') throw Error('controlled run has not reached a settled terminal state');
  if (run.release && (run.release.status !== 'verified' || run.release.smoke?.state !== 'passed')) throw Error('release has no verified publication/smoke evidence');
}
function verifyDocument(task, document) {
  if (!document || document.taskId !== task.taskId || document.goal !== task.goal || document.revision !== task.revision
    || document.kind !== (task.intent || 'delivery') || document.goalSatisfied !== true || !task.acceptance.length) throw Error('evidence must bind task, goal, revision, intent and explicit criteria');
  if (!Array.isArray(document.criteria) || document.criteria.length !== task.acceptance.length
    || document.criteria.some((c, i) => !c || c.index !== i || c.text !== task.acceptance[i] || c.state !== 'passed' || typeof c.evidence !== 'string' || !c.evidence.trim())) throw Error('each acceptance criterion needs ordered, explicit passing evidence');
  if (!Array.isArray(document.artifacts) || !document.artifacts.length || new Set(document.artifacts.map(a => a?.path)).size !== document.artifacts.length) throw Error('unique outcome artifacts are required');
  const artifacts = document.artifacts.map(a => {
    const current = artifact(task.root, a.path);
    if (a.sha256 !== current.sha256) throw Error('outcome artifact bytes do not match evidence');
    if (task.intent === 'research' && !/^(docs|research|reports)\//.test(a.path)) throw Error('research outcomes contain reports, not implementation artifacts');
    return current;
  });
  const receipt = treeReceipt(task.root);
  if (!receipt) throw Error('outcome evidence requires a readable Git receipt');
  return { kind: document.kind, state: 'verified', source: 'operator-attestation', evidenceDigest: hash(JSON.stringify(document)), receipt,
    artifacts, criteria: document.criteria, verifiedAt: new Date().toISOString() };
}
export function applyOutcome({ root, taskId, kind, expectedRevision, operationId, evidenceFile }, options = {}) {
  if (!['verify', 'complete'].includes(kind) || !Number.isInteger(expectedRevision)) throw Error('verify/complete require an explicit revision');
  const task = readWorkTask(taskId, { ...options, root });
  const evidence = kind === 'verify' ? readOutcomeEvidence(root, evidenceFile) : null;
  const work = beginWork({ root, host: task.host, taskId, kind, expectedRevision, operationId,
    data: evidence ? { evidenceDigest: evidence.digest } : null }, options);
  if (work.replay) return publicWorkTask(work.task);
  try {
    assertHostSettled(task, options);
    const current = readWorkTask(taskId, { ...options, root });
    if (kind === 'verify') {
      const outcome = verifyDocument(task, evidence.document);
      mutateWorkTask(taskId, t => { t.outcome = outcome; t.phase = 'verified'; t.reason = 'Criteria and artifact identity recorded by explicit operator attestation'; }, { ...options, root });
    } else {
      const outcome = current.outcome;
      if (current.phase !== 'verified' || outcome?.state !== 'verified' || !same(treeReceipt(root), outcome.receipt)) throw Error('verified outcome is missing or its tree receipt is stale');
      for (const a of outcome.artifacts) if (artifact(task.root, a.path).sha256 !== a.sha256) throw Error('verified outcome artifact changed');
      mutateWorkTask(taskId, t => { t.outcome.state = 'completed'; t.outcome.completedAt = new Date().toISOString(); t.phase = 'completed'; t.reason = 'Explicit completion of the verified requested outcome'; }, { ...options, root });
    }
    finishWork(taskId, work.operation.operationId, 0, { ...options, root });
    return publicWorkTask(readWorkTask(taskId, { ...options, root }));
  } catch (error) {
    if (readWorkTask(taskId, { ...options, root }).operations.find(o => o.operationId === work.operation.operationId)?.state === 'running') finishWork(taskId, work.operation.operationId, 2, { ...options, root });
    throw error;
  }
  finally { work.lease.release(); }
}
