/** Project-scoped read model. Never invent task/run links or dispatch from a GET. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getTasks, getReadDegradation } from './beads.mjs';
import { listCodexRuns } from '../../../scripts/lib/codex-host-state.mjs';
import { listWorkTasks, publicWorkTask } from '../../../scripts/lib/work-tasks.mjs';
import { decisionCapabilities } from '../../../scripts/lib/work-decisions.mjs';
import { measureWork, compareWork } from '../../../scripts/lib/work-metrics.mjs';
import { readSessionStatus } from '../../../scripts/lib/session-status.mjs';
import { agentActivity } from './agent-activity.mjs';
import { taskInspector } from './task-inspector.mjs';

const text = v => typeof v === 'string' ? v : null;
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
const RUN_PHASE = { ready: 'accepted', 'awaiting-gate': 'needs_decision',
  'awaiting-release': 'needs_decision', blocked: 'blocked', 'manual-action': 'blocked' };

export function projectWork({ projectId, issues = [], codex = { state: 'absent', runs: [] },
  tasks = [], sessions = [], sources = [], activity = { state: 'none', events: [] }, observedAt = new Date().toISOString() }) {
  const entries = [];
  for (const r of codex.runs || []) {
    // Completion of a controller run is not proof of the user's acceptance criteria.
    const terminal = ['done', 'cancelled'].includes(r.status);
    const active = !!r.active || r.wave?.status === 'running';
    const phase = active ? 'working' : RUN_PHASE[r.status] || null;
    const pending = !!r.pending || ['awaiting-gate', 'awaiting-release'].includes(r.status);
    const canCopyResume = !terminal && !pending && !active && r.status === 'ready';
    const updatedAt = (r.attempts || []).flatMap(a => [date(a.startedAt), date(a.finishedAt)])
      .filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || date(r.pending?.createdAt);
    entries.push({ key: `run:${r.id}`, kind: 'run', taskId: null, runId: r.id, issueIds: [],
      title: `Controlled run ${r.id}`, goal: null, acceptance: [], host: 'codex',
      phase, nativeState: text(r.status), terminal, updatedAt: updatedAt || null,
      outcome: r.status === 'done' ? 'Run finished; task acceptance is not recorded'
        : r.status === 'cancelled' ? 'Run cancelled' : null,
      reason: text(r.reason), decisions: pending ? [{ id: `run:${r.id}:pending`, engine: 'codex',
        label: r.status === 'awaiting-release' ? 'Release approval in host controller' : 'Approval in host controller' }] : [],
      capabilities: [{ action: 'copy_resume', enabled: canCopyResume,
        reason: canCopyResume ? null : pending ? 'Resolve the host decision first' : active ? 'A worker owns this run'
          : terminal ? 'This run is terminal' : 'This state does not permit ordinary resume' }],
      command: canCopyResume ? `great-cto resume ${r.id} --host codex` : null,
      evidence: (r.rolesCompleted || []).map(role => ({ kind: 'recorded_role', label: role })),
      stage: text(r.active) || text(r.pending?.role) || (r.wave?.status === 'running' && Array.isArray(r.wave.roles) ? r.wave.roles.filter(role => typeof role === 'string').join(', ') : null),
      inspector: taskInspector([r.id], activity),
      release: r.release ? { status: text(r.release.status), url: text(r.release.url), verifiedAt: date(r.release.verifiedAt) } : null,
    });
  }
  for (const t of issues) {
    const terminal = ['closed', 'done'].includes(t.raw_status || t.status);
    const pending = !!t.is_gate && !terminal && t.raw_status !== 'blocked' && t.status !== 'blocked';
    entries.push({ key: `issue:${t.id}`, kind: 'issue', taskId: null, runId: null, issueIds: [t.id],
      title: text(t.title) || t.id, goal: null, acceptance: text(t.acceptance) ? [t.acceptance] : [],
      host: null, phase: null, nativeState: text(t.raw_status || t.status), terminal,
      updatedAt: date(t.updated_at), outcome: terminal ? 'Issue closed; task acceptance is not recorded' : null,
      reason: 'Legacy work item; no execution run is linked',
      decisions: pending ? [{ id: t.id, engine: 'beads', label: 'Review decision' }] : [],
      capabilities: [{ action: pending ? 'review_decision' : 'view_issue', enabled: true, reason: null }],
      command: null, evidence: [], release: null,
      inspector: taskInspector([], activity),
    });
  }
  for (const t of tasks) {
    const linkedRuns = entries.filter(e => e.kind === 'run' && t.links.runs.includes(e.runId));
    const linkedIssues = entries.filter(e => e.kind === 'issue' && e.issueIds.some(id => t.links.issues.includes(id)));
    for (const linked of [...linkedRuns, ...linkedIssues]) {
      linked.taskId = t.taskId; linked.goal = t.goal; linked.acceptance = t.acceptance;
      if (!linked.terminal) entries.splice(entries.indexOf(linked), 1);
    }
    const owner = t.operations.some(o => o.state === 'running');
    const run = linkedRuns.length === 1 ? linkedRuns[0] : null;
    const approval = decisionCapabilities(t).find(d => d.capability.enabled);
    const approveCommand = approval ? `great-cto task work approve --task ${t.taskId} --decision ${approval.decisionId} --revision ${t.revision}` : null;
    const enabled = !['cancelled', 'verified', 'completed'].includes(t.phase) && !owner && (t.host === 'codex'
      ? !!run?.capabilities.some(c => c.action === 'copy_resume' && c.enabled)
      : t.managed !== false && t.links.sessions.length === 1 && !['needs_decision', 'working'].includes(t.phase));
    entries.push({ key: `task:${t.taskId}`, kind: 'task', taskId: t.taskId, runId: run?.runId || null,
      issueIds: t.links.issues, title: t.goal, goal: t.goal, acceptance: t.acceptance,
      host: t.host, phase: t.phase, nativeState: run?.nativeState || t.phase,
      terminal: ['cancelled', 'completed'].includes(t.phase), updatedAt: t.updatedAt, outcome: t.outcome?.state === 'completed' ? `${t.intent || 'delivery'} outcome explicitly completed` : null, reason: t.reason,
      intent: t.intent || 'delivery', stage: t.stage || null, taskOutcome: t.outcome || null,
      decisions: decisionCapabilities(t).map(d => ({ ...d, id: d.decisionId, label: d.label || 'Host decision' })), evidence: (t.evidence || []).map(e => ({ kind: 'verdict', label: `${e.role}: ${e.verdict || 'not recorded'}` })),
      release: run?.release || null, revision: t.revision, metrics: t.metrics,
      inspector: taskInspector([...t.links.runs, ...t.links.sessions], activity),
      capabilities: [...(approval ? [{ action: 'copy_approve', enabled: true, reason: null }] : []), { action: 'copy_resume', enabled, reason: enabled ? null : owner ? 'Host operation is active; duplicate resume is refused'
        : t.managed === false ? 'Continue this observed session inside its native host'
        : t.phase === 'needs_decision' ? 'Resolve the native host decision first' : 'Execution link or resumable host state is unavailable' }],
      command: approveCommand || (enabled ? `great-cto resume --task ${t.taskId} --host ${t.host} --revision ${t.revision}` : null),
    });
  }
  entries.sort((a, b) => (a.terminal - b.terminal) || (b.decisions.length - a.decisions.length)
    || (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0) || a.key.localeCompare(b.key));
  const health = sources.some(s => ['degraded', 'unavailable'].includes(s.health)) ? 'degraded' : 'current';
  const measurement = measureWork(tasks);
  const payload = { schemaVersion: 1, projectId, observedAt, health, sources, tasks, entries, measurement, simplification: compareWork(measurement, null),
    sessions: sessions.map(s => ({ session: s.session, state: s.state, since: date(s.since), reason: text(s.reason) })),
    decisions: entries.flatMap(e => e.decisions.map(d => ({ ...d, entryKey: e.key }))),
    execution: { enabled: false, reason: 'This board prepares commands; host execution is not connected' } };
  // A timestamp is not a revision. Stable revision changes only with projected content.
  const { observedAt: ignored, sources: sourceRows, ...content } = payload;
  payload.revision = createHash('sha256').update(JSON.stringify({ ...content,
    sources: sourceRows.map(({ observedAt: ignoredSourceTime, ...s }) => s) })).digest('hex');
  return payload;
}

export function getWork(cwd) {
  const observedAt = new Date().toISOString();
  let activity;
  try { activity = agentActivity(cwd, { limit: 200 }); }
  catch { activity = { state: 'unreadable', events: [] }; }
  const sources = []; let issues = [], codex = { state: 'absent', runs: [] }, sessions = [], tasks = [];
  const source = (id, health, reason = null) => sources.push({ id, health, reason, observedAt });
  source('activity', activity.state === 'unreadable' || activity.bad ? 'degraded' : 'current',
    activity.state === 'unreadable' ? 'Cannot read project activity' : activity.bad ? 'Some activity records are malformed' : null);
  try {
    const listing = listWorkTasks(cwd); tasks = listing.tasks.map(publicWorkTask);
    source('tasks', listing.state === 'degraded' ? 'degraded' : 'current', listing.unreadable ? `${listing.unreadable} task state file(s) could not be read` : null);
  } catch { source('tasks', 'unavailable', 'Cannot read shared task metadata'); }
  try {
    issues = getTasks(cwd);
    const reason = getReadDegradation(cwd);
    source('issues', reason ? 'degraded' : 'current', reason);
  } catch { source('issues', 'unavailable', 'Cannot read project work items'); }
  try {
    codex = listCodexRuns({ root: cwd });
    source('codex', codex.state === 'degraded' ? 'degraded' : 'current', codex.unreadable
      ? `${codex.unreadable} run state file(s) could not be read; project membership is unknown` : null);
  } catch { source('codex', 'unavailable', 'Cannot read the host run store'); }
  try {
    // Native reader drops malformed files. Check separately so absence stays honest.
    let files = [];
    try { files = readdirSync(join(cwd, '.great_cto', 'status')).filter(f => f.endsWith('.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let unreadable = 0;
    for (const f of files) {
      try {
        const s = JSON.parse(readFileSync(join(cwd, '.great_cto', 'status', f), 'utf8'));
        if (!text(s.session) || !date(s.since) || !['blocked', 'waiting', 'working'].includes(s.state)) unreadable++;
      } catch { unreadable++; }
    }
    sessions = readSessionStatus(cwd);
    source('claude_sessions', unreadable ? 'degraded' : 'current', unreadable ? `${unreadable} session state file(s) could not be read` : null);
  } catch { source('claude_sessions', 'unavailable', 'Cannot read Claude session status'); }
  let canonical = cwd;
  try { canonical = realpathSync(cwd); } catch { /* source health already reports inaccessible data */ }
  const projectId = 'project:' + createHash('sha256').update(canonical).digest('hex');
  return { ...projectWork({ projectId, issues, codex, tasks, sessions, sources, activity, observedAt }), projectName: basename(cwd) };
}
