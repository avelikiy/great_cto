/** Cohort measurements are evidence; they do not change authority or auto-approve. */
const median = values => { const s = values.filter(Number.isFinite).sort((a,b) => a-b); return !s.length ? null : s.length % 2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };
export function measureWork(tasks) {
  const cohorts = [];
  for (const host of ['claude-code', 'codex']) for (const intent of ['delivery', 'research']) {
    const rows = tasks.filter(t => t.host === host && (t.intent || 'delivery') === intent);
    const resumes = rows.flatMap(t => t.operations.filter(o => o.kind === 'resume' && o.state === 'host_returned'));
    const known = resumes.filter(o => o.resume?.state && o.resume.state !== 'unobserved');
    const reasons = {};
    for (const t of rows) for (const [kind, count] of Object.entries(t.metrics?.interruptions || {})) reasons[kind] = (reasons[kind] || 0) + count;
    const technical = Object.entries(reasons).filter(([kind]) => !['host_approval','native_pipeline_approval','native_permission_or_input'].includes(kind)).reduce((n, [,v]) => n+v, 0);
    cohorts.push({ host, intent, tasks: rows.length, observedStarts: rows.filter(t => Number.isFinite(t.metrics?.timeToObservedStartMs)).length,
      medianTimeToObservedStartMs: median(rows.map(t => t.metrics?.timeToObservedStartMs)), interruptions: reasons,
      technicalInterruptionsPerTask: rows.length ? technical/rows.length : null, resumes: resumes.length, knownResumes: known.length,
      progressedResumes: known.filter(o => o.resume.state === 'progressed').length,
      resumeProgressRate: known.length ? known.filter(o => o.resume.state === 'progressed').length / known.length : null,
      completed: rows.filter(t => t.phase === 'completed').length, blocked: rows.filter(t => t.phase === 'blocked').length,
      verificationRework: rows.reduce((n,t) => n + (t.rework?.attempts || 0), 0) });
  }
  return { schemaVersion: 1, observation: 'task-stage-progress, not model latency or production defect rate', cohorts };
}
export function compareWork(current, baseline, { minTasks = 20, minKnownResumes = 5 } = {}) {
  if (!Number.isInteger(minTasks) || minTasks < 1 || !Number.isInteger(minKnownResumes) || minKnownResumes < 1) throw Error('invalid comparison sample policy');
  return { automaticAuthorityChanges: false, cohorts: current.cohorts.map(c => {
    const b = baseline?.cohorts?.find(x => x.host === c.host && x.intent === c.intent);
    const sufficient = !!b && c.tasks >= minTasks && b.tasks >= minTasks && c.knownResumes >= minKnownResumes && b.knownResumes >= minKnownResumes
      && Number.isFinite(c.technicalInterruptionsPerTask) && Number.isFinite(b.technicalInterruptionsPerTask) && Number.isFinite(c.resumeProgressRate) && Number.isFinite(b.resumeProgressRate);
    return { host: c.host, intent: c.intent, state: !sufficient ? 'insufficient_evidence' : c.technicalInterruptionsPerTask < b.technicalInterruptionsPerTask && c.resumeProgressRate >= b.resumeProgressRate ? 'candidate_for_review' : 'no_measured_improvement',
      reason: !sufficient ? 'Matched host/intent baseline and known resume sample are required' : 'Measurement can recommend review; safety, defect evidence and authority still require separate decisions' };
  }) };
}
