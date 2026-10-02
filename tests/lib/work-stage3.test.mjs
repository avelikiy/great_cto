import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { beginWork, finishWork, linkWork, readWorkTask, observeWorkSession, observeNativePipeline, observeWorkRun, publicWorkTask, controlledDecisions } from '../../scripts/lib/work-tasks.mjs';
import { applyOutcome, readOutcomeEvidence } from '../../scripts/lib/work-outcomes.mjs';
import { approveWorkDecision, decisionCapabilities } from '../../scripts/lib/work-decisions.mjs';
import { measureWork, compareWork } from '../../scripts/lib/work-metrics.mjs';
import { newRun, advance } from '../../scripts/lib/codex-pipeline.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
const base = mkdtempSync(join(tmpdir(), 'gcto-stage3-')); let n = 0;
after(() => rmSync(base, { recursive: true, force: true }));
function fixture(host = 'claude-code', intent = 'delivery') {
  const dir = join(base, String(++n)), root = join(dir, 'project'), store = join(dir, 'tasks'), runsStore = join(dir, 'runs');
  mkdirSync(root, { recursive: true }); mkdirSync(runsStore); mkdirSync(join(root, 'docs'));
  execFileSync('git', ['init', '-q', root]); writeFileSync(join(root, 'README.md'), 'fixture\n');
  execFileSync('git', ['-C', root, 'add', 'README.md']); execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  const f = { root, store, runsStore, dir, host, session: randomUUID() };
  const w = beginWork({ root, host, intent, goal: 'Report CSV findings', acceptance: ['Document authorization'], authority: host === 'codex' ? { mode: 'explicit-paths', writeScope: ['docs'] } : { mode: 'native-interactive', writeScope: null } }, f);
  f.taskId = w.task.taskId;
  if (host === 'claude-code') linkWork(f.taskId, 'sessions', f.session, { ...f, host });
  finishWork(f.taskId, w.operation.operationId, 0, f); w.lease.release(); return f;
}
const current = f => readWorkTask(f.taskId, f);
function evidence(f, override = {}) {
  const t = current(f), file = join(f.dir, 'evidence.json'), path = 'docs/report.md';
  writeFileSync(join(f.root, path), 'Actual findings\n');
  const doc = { taskId: t.taskId, goal: t.goal, revision: t.revision, kind: t.intent, goalSatisfied: true,
    criteria: [{ index: 0, text: t.acceptance[0], state: 'passed', evidence: 'Operator inspected report authorization section' }],
    artifacts: [{ path, sha256: createHash('sha256').update(readFileSync(join(f.root, path))).digest('hex') }], ...override };
  writeFileSync(file, JSON.stringify(doc), { mode: 0o600 }); return file;
}
const verify = (f, more = {}) => applyOutcome({ root: f.root, taskId: f.taskId, kind: 'verify', expectedRevision: current(f).revision, operationId: randomUUID(), evidenceFile: more.evidenceFile || evidence(f), ...more }, f);
test('explicit research verification and completion bind actual report, criteria and revision; replay has no extra operation', () => {
  const f = fixture('claude-code', 'research'); const v = verify(f);
  assert.equal(v.phase, 'verified'); assert.equal(v.outcome.source, 'operator-attestation');
  const request = { root: f.root, taskId: f.taskId, kind: 'complete', expectedRevision: v.revision, operationId: randomUUID() };
  const completed = applyOutcome(request, f); assert.equal(completed.phase, 'completed'); assert.equal(completed.outcome.kind, 'research');
  assert.equal(applyOutcome(request, f).operations.length, completed.operations.length);
  observeWorkSession({ cwd: f.root, session_id: f.session, hook_event_name: 'UserPromptSubmit' }, f);
  assert.equal(current(f).phase, 'completed');
});
test('stale artifact/tree and wrong criteria cannot complete a requested outcome', () => {
  const f = fixture(); const file = evidence(f, { criteria: [] });
  assert.throws(() => verify(f, { evidenceFile: file }), /criterion/);
  const v = verify(f); writeFileSync(join(f.root, 'docs/report.md'), 'Different report');
  assert.throws(() => applyOutcome({ root: f.root, taskId: f.taskId, kind: 'complete', expectedRevision: v.revision, operationId: randomUUID() }, f), /stale|changed/);
  assert.equal(current(f).phase, 'verified'); assert.equal(current(f).operations.at(-1).exitCode, 2);
});
test('workspace proof, symlink proof, wrong goal and research implementation artifacts fail closed', () => {
  const f = fixture('claude-code', 'research'); const file = evidence(f);
  assert.throws(() => readOutcomeEvidence(f.root, join(f.root, 'proof.json')), /outside/);
  const alias = join(f.dir, 'alias.json'); symlinkSync(file, alias); assert.throws(() => readOutcomeEvidence(f.root, alias), /private regular|symlink/);
  const wrong = evidence(f, { goal: 'Other goal' }); assert.throws(() => verify(f, { evidenceFile: wrong }), /bind/);
  const codePath = 'app.js'; writeFileSync(join(f.root, codePath), 'implementation');
  const impl = evidence(f, { artifacts: [{ path: codePath, sha256: createHash('sha256').update('implementation').digest('hex') }] });
  assert.throws(() => verify(f, { evidenceFile: impl }), /research outcomes/);
});
test('native decision adapter retains pending gates across Stop and ordinary input, then records explicit dispatch progress', () => {
  const f = fixture(), receipt = treeReceipt(f.root);
  const event = { root: f.root, sessionId: f.session, agent: 'architect', verdict: 'DONE', recordDigest: 'first', receipt, decisionKind: 'gate', gates: ['gate:arch'] };
  observeNativePipeline(event, f);
  const before = current(f); assert.equal(before.phase, 'needs_decision'); assert.equal(decisionCapabilities(before)[0].capability.enabled, false);
  observeWorkSession({ cwd: f.root, session_id: f.session, hook_event_name: 'Stop' }, f);
  observeWorkSession({ cwd: f.root, session_id: f.session, hook_event_name: 'UserPromptSubmit' }, f);
  assert.equal(current(f).decisions[0].decisionId, before.decisions[0].decisionId);
  assert.equal(observeNativePipeline({ ...event, sessionId: randomUUID() }, f), null);
  observeNativePipeline({ ...event, decisionKind: 'next', gates: [] }, f);
  assert.equal(current(f).decisions.length, 0); assert.equal(current(f).evidence[0].verified, false);
});
test('resume evidence distinguishes actual bound stage progress from exit zero and decision waiting', () => {
  const f = fixture(); let w = beginWork({ root: f.root, host: f.host, kind: 'resume', taskId: f.taskId }, f);
  observeWorkSession({ cwd: f.root, session_id: f.session, hook_event_name: 'UserPromptSubmit' }, f);
  observeWorkSession({ cwd: f.root, session_id: f.session, hook_event_name: 'Stop' }, f);
  finishWork(f.taskId, w.operation.operationId, 0, f); w.lease.release(); assert.equal(current(f).operations.at(-1).resume.state, 'unobserved');
  w = beginWork({ root: f.root, host: f.host, kind: 'resume', taskId: f.taskId }, f);
  observeNativePipeline({ root: f.root, sessionId: f.session, agent: 'architect', verdict: 'DONE', receipt: treeReceipt(f.root), recordDigest: 'new-result', decisionKind: 'done' }, f);
  finishWork(f.taskId, w.operation.operationId, 0, f); w.lease.release(); assert.equal(current(f).operations.at(-1).resume.state, 'progressed');
  const report = measureWork([current(f)]).cohorts.find(c => c.host === f.host && c.intent === 'delivery');
  assert.equal(report.resumes, 2); assert.equal(report.knownResumes, 1); assert.equal(report.progressedResumes, 1);
});
function pendingRun(f) {
  const r = newRun({ root: f.root, prompt: current(f).goal, allowed: ['docs'], entry: 'architect' });
  r.taskId = f.taskId; r.graph = { architect: { on: ['APPROVED'], gate: 'gate:arch', next: [] } };
  r.results.architect = { verdict: 'APPROVED', digest: 'result-1', receipt: treeReceipt(f.root), verification: { state: 'verified' } }; r.queue = []; advance(r);
  linkWork(f.taskId, 'runs', r.id, { ...f, host: 'codex' });
  writeFileSync(join(f.runsStore, r.id + '.json'), JSON.stringify(r), { mode: 0o600 }); observeWorkRun(r, f); return r;
}
test('controlled approval operation uses parent ownership, host tree binding and idempotent receipts without public tokens', () => {
  const f = fixture('codex'), r = pendingRun(f), oldStore = process.env.GREAT_CTO_CODEX_RUNS_DIR; process.env.GREAT_CTO_CODEX_RUNS_DIR = f.runsStore;
  try {
    const t = current(f), request = { root: f.root, taskId: f.taskId, decisionId: t.decisions[0].decisionId, expectedRevision: t.revision, operationId: randomUUID() };
    assert.equal(JSON.stringify(publicWorkTask(t)).includes(r.pending.token), false);
    const accepted = approveWorkDecision(request, f); assert.equal(accepted.operations.at(-1).exitCode, 0);
    assert.equal(accepted.decisions.length, 0); assert.equal(JSON.parse(readFileSync(join(f.runsStore, r.id + '.json'))).status, 'done');
    assert.equal(approveWorkDecision(request, f).operations.length, accepted.operations.length);
    assert.throws(() => approveWorkDecision({ ...request, operationId: randomUUID() }, f), /stale/);
  } finally { if (oldStore === undefined) delete process.env.GREAT_CTO_CODEX_RUNS_DIR; else process.env.GREAT_CTO_CODEX_RUNS_DIR = oldStore; }
});
test('changed proposal/tree invalidates approval; unresolved host decisions prevent verification', () => {
  const f = fixture('codex'), r = pendingRun(f), oldStore = process.env.GREAT_CTO_CODEX_RUNS_DIR; process.env.GREAT_CTO_CODEX_RUNS_DIR = f.runsStore;
  try {
    const t = current(f); writeFileSync(join(f.root, 'README.md'), 'Changed');
    assert.throws(() => approveWorkDecision({ root: f.root, taskId: f.taskId, decisionId: t.decisions[0].decisionId, expectedRevision: t.revision, operationId: randomUUID() }, f), /host refused.*changed/);
    assert.equal(current(f).decisions.length, 1); assert.throws(() => verify(f), /not settled/);
    r.pending.token = randomUUID(); assert.notEqual(controlledDecisions(r)[0].decisionId, t.decisions[0].decisionId);
  } finally { if (oldStore === undefined) delete process.env.GREAT_CTO_CODEX_RUNS_DIR; else process.env.GREAT_CTO_CODEX_RUNS_DIR = oldStore; }
});
test('research cannot route to implementation/release and stage attempt budgets stay bounded', () => {
  const f = fixture(); assert.throws(() => newRun({ root: f.root, prompt: 'Research', allowed: ['src'], entry: 'project-auditor', intent: 'research' }), /report-only/);
  assert.throws(() => newRun({ root: f.root, prompt: 'Research', allowed: ['docs'], entry: 'architect', intent: 'research' }), /report-only/);
  const r = newRun({ root: f.root, prompt: 'Research', allowed: ['docs'], entry: 'project-auditor', intent: 'research', maxAttempts: 2 });
  assert.equal(r.maxAttempts, 2); assert.deepEqual(r.graph['project-auditor'].next, []);
});
test('measurement policy refuses missing or mismatched baseline and never mutates authority', () => {
  const f = fixture(), currentReport = measureWork([current(f)]);
  assert.equal(compareWork(currentReport, null).cohorts[0].state, 'insufficient_evidence');
  const c = { host: 'codex', intent: 'delivery', tasks: 20, knownResumes: 5, technicalInterruptionsPerTask: 0.2, resumeProgressRate: 1 };
  const report = compareWork({ cohorts: [c] }, { cohorts: [{ ...c, technicalInterruptionsPerTask: 1 }] });
  assert.equal(report.cohorts[0].state, 'candidate_for_review'); assert.equal(report.automaticAuthorityChanges, false);
  assert.equal(compareWork({ cohorts: [c] }, { cohorts: [{ ...c, intent: 'research' }] }).cohorts[0].state, 'insufficient_evidence');
});
test('native stale receipt is explicit and private tree contents never enter public decisions', () => {
  const f = fixture(), receipt = treeReceipt(f.root);
  observeNativePipeline({ root: f.root, sessionId: f.session, agent: 'architect', verdict: 'DONE', receipt, recordDigest: 'first', decisionKind: 'gate', gates: ['gate:arch'] }, f);
  assert.equal(publicWorkTask(current(f)).decisions[0].bindingState, 'current');
  writeFileSync(join(f.root, 'README.md'), 'drift');
  const d = decisionCapabilities(current(f))[0]; assert.equal(d.bindingState, 'stale'); assert.match(d.capability.reason, /stale/);
  assert.equal(JSON.stringify(d).includes('README.md'), false); assert.equal(d.receipt, undefined);
});
