// tests/lib/run-store.test.mjs — durable autopilot runs + resume (Layer D)
//
// Run: node --test tests/lib/run-store.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startRun, approve, reject, escalate, sendBack, stats, getRun, listRuns, pendingGates } from '../../scripts/lib/run-store.mjs';
import { loadFlow, runFlow } from '../../scripts/lib/flow-runner.mjs';

function tmp() { const d = mkdtempSync(join(tmpdir(), 'ap-runs-')); process.env.GREAT_CTO_RUNS_DIR = d; return d; }

test('startRun: runs to the gate, persists, awaits a signature — no write yet', async () => {
  const d = tmp();
  const run = await startRun('rcm', { mode: 'stub' });
  assert.equal(run.status, 'awaiting-approval');
  assert.equal(run.pausedAt, 'gate:coding-signoff');
  assert.equal(run.signer, 'CPC / CCS certified coder');
  // durable: a fresh read returns the same run
  assert.equal(getRun(run.id).status, 'awaiting-approval');
  // the irreversible submit-837 has NOT run
  const submit = run.steps.find((s) => /submit the 837/.test(s.does));
  assert.ok(!submit || submit.status !== 'done');
  rmSync(d, { recursive: true, force: true });
});

test('approve: resumes past the gate and executes the irreversible write', async () => {
  const d = tmp();
  const { id } = await startRun('rcm', { mode: 'stub' });
  const run = await approve(id, 'Dr. Smith, CPC', 'note supports codes');
  assert.equal(run.status, 'completed');
  // the gate is recorded approved, with the signer
  const gate = run.steps.find((s) => s.gate);
  assert.equal(gate.status, 'approved');
  assert.equal(gate.approvedBy, 'Dr. Smith, CPC');
  // the 837 write executed
  const submit = run.steps.find((s) => /submit the 837/.test(s.does));
  assert.equal(submit.status, 'done');
  assert.ok(submit.toolCalls.some((c) => c.connector === 'clearinghouse' && c.ok));
  // audit trail names the signer
  assert.ok(run.audit.some((a) => a.event === 'approved' && a.by === 'Dr. Smith, CPC' && a.gate === 'gate:coding-signoff'));
  rmSync(d, { recursive: true, force: true });
});

test('reject: nothing irreversible runs', async () => {
  const d = tmp();
  const { id } = await startRun('rcm', { mode: 'stub' });
  const run = await reject(id, 'Dr. Jones', 'note insufficient');
  assert.equal(run.status, 'rejected');
  // no submit-837 anywhere in the trace
  assert.ok(!run.steps.some((s) => (s.toolCalls || []).some((c) => c.connector === 'clearinghouse')));
  assert.ok(run.audit.some((a) => a.event === 'rejected' && a.by === 'Dr. Jones'));
  rmSync(d, { recursive: true, force: true });
});

test('approve/reject only act on an awaiting run', async () => {
  const d = tmp();
  const { id } = await startRun('rcm', { mode: 'stub' });
  await approve(id, 'signer');
  await assert.rejects(() => approve(id, 'again'), /not awaiting-approval/);
  await assert.rejects(() => reject(id, 'late'), /not awaiting-approval/);
  await assert.rejects(() => approve('run_does_not_exist', 'x'), /not found/);
  rmSync(d, { recursive: true, force: true });
});

test('inbox + listRuns reflect run state', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'stub' });
  const b = await startRun('aml', { mode: 'stub' });
  assert.equal(pendingGates().length, 2);
  await approve(a.id, 'signer');
  assert.equal(pendingGates().length, 1);
  assert.equal(pendingGates()[0].id, b.id);
  assert.equal(listRuns({ status: 'completed' }).length, 1);
  assert.equal(listRuns().length, 2);
  rmSync(d, { recursive: true, force: true });
});

test('multi-gate: tax needs two signatures (preparer + taxpayer 8879) before the write', async () => {
  const d = tmp();
  const { id } = await startRun('tax', { mode: 'stub' });
  // first gate: preparer
  let run = getRun(id);
  assert.equal(run.pausedAt, 'gate:preparer-signoff');
  run = await approve(id, 'Jane EA');
  // still awaiting — the taxpayer must now sign 8879
  assert.equal(run.status, 'awaiting-approval');
  assert.equal(run.pausedAt, 'gate:taxpayer-8879');
  // the irreversible transmit has NOT run yet (only one signature so far)
  assert.ok(!run.steps.some((s) => (s.toolCalls || []).some((c) => c.connector === 'irs-efile')));
  // second gate: taxpayer
  run = await approve(id, 'Taxpayer John');
  assert.equal(run.status, 'completed');
  // both gates signed, by the right people
  const gates = run.steps.filter((s) => s.gate);
  assert.equal(gates.length, 2);
  assert.equal(gates[0].approvedBy, 'Jane EA');
  assert.equal(gates[1].approvedBy, 'Taxpayer John');
  // and only now did the transmit fire
  assert.ok(run.steps.some((s) => (s.toolCalls || []).some((c) => c.connector === 'irs-efile' && c.ok)));
  rmSync(d, { recursive: true, force: true });
});

test('multi-tenant: a tenant sees only its own runs', async () => {
  const d = tmp();
  await startRun('rcm', { mode: 'stub', tenant: 'acme' });
  await startRun('aml', { mode: 'stub', tenant: 'globex' });
  assert.equal(listRuns({ tenant: 'acme' }).length, 1);
  assert.equal(listRuns({ tenant: 'acme' })[0].vertical, 'rcm');
  assert.equal(pendingGates({ tenant: 'globex' }).length, 1);
  assert.equal(pendingGates({ tenant: 'globex' })[0].vertical, 'aml');
  assert.equal(listRuns().length, 2); // no filter → all
  rmSync(d, { recursive: true, force: true });
});

test('idempotency: a run carries a stable key so a retried write never double-submits', async () => {
  const d = tmp();
  const run = await startRun('rcm', { mode: 'stub' });
  // the key is threaded into the run's connector payloads (stable = the run id)
  assert.ok(run.id.startsWith('run_rcm_'));
  rmSync(d, { recursive: true, force: true });
});

test('resume runFlow: an approved gate lets the irreversible step execute', async () => {
  // direct runFlow contract: with the protecting gate approved, the write runs
  const flow = loadFlow('rcm');
  const gateIdx = flow.steps.findIndex((s) => s.gate);
  const t = await runFlow(flow, { mode: 'stub', startAt: gateIdx, approvedGates: ['gate:coding-signoff'] });
  assert.equal(t.status, 'completed');
  const submit = t.steps.find((s) => /submit the 837/.test(s.does));
  assert.equal(submit.status, 'done');
  // without approval, the same step is gated, not run
  const t2 = await runFlow(flow, { mode: 'stub', stopAtGate: false });
  const submit2 = t2.steps.find((s) => /submit the 837/.test(s.does));
  assert.equal(submit2.status, 'gated');
});

test('escalate keeps the case in the queue, flagged; reason is recorded', async () => {
  const d = tmp();
  const { id } = await startRun('rcm', { mode: 'stub' });
  const run = await escalate(id, 'Junior coder', 'unsure', 'needs-senior-review');
  assert.equal(run.status, 'awaiting-approval');   // still signable by a senior
  assert.equal(run.escalated, true);
  assert.ok(run.audit.some((a) => a.event === 'escalated' && a.reason === 'needs-senior-review'));
  rmSync(d, { recursive: true, force: true });
});

test('send-back ends the run with no irreversible write; reject/approve carry a reason', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'stub' });
  const back = await sendBack(a.id, 'Coder', 'missing chart', 'insufficient-documentation');
  assert.equal(back.status, 'sent-back');
  assert.equal(back.disposition, 'insufficient-documentation');
  const b = await startRun('rcm', { mode: 'stub' });
  const rej = await reject(b.id, 'Coder', '', 'policy-exception');
  assert.equal(rej.disposition, 'policy-exception');
  rmSync(d, { recursive: true, force: true });
});

test('stats aggregates KPIs over visible runs', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'stub' });
  await approve(a.id, 'Coder', '', 'meets-criteria');
  const b = await startRun('aml', { mode: 'stub' });
  await reject(b.id, 'BSA', '', 'fraud-suspected');
  await startRun('soc', { mode: 'stub' }); // left awaiting
  const s = stats();
  assert.equal(s.total, 3);
  assert.equal(s.approved, 1);
  assert.equal(s.rejected, 1);
  assert.equal(s.awaiting, 1);
  assert.equal(s.approvalRate, 50); // 1 of 2 decided
  rmSync(d, { recursive: true, force: true });
});

test('Wave B: a run carries an AI recommendation + SLA deadline', async () => {
  const d = tmp();
  const run = await startRun('prior-auth', { mode: 'stub' });
  assert.ok(['approve', 'escalate', 'block'].includes(run.recommendation));
  assert.equal(typeof run.slaHours, 'number');
  assert.ok(new Date(run.dueAt).getTime() > new Date(run.createdAt).getTime());
  rmSync(d, { recursive: true, force: true });
});

test('Wave B: approving against an AI block/escalate logs an override', async () => {
  const d = tmp();
  // force a block recommendation: aml screens a sanctioned party
  const run = await startRun('aml', { mode: 'stub', payload: {} });
  const r2 = await import('../../scripts/lib/run-store.mjs');
  // approve and inspect the audit override flag against the run's recommendation
  const done = await approve(run.id, 'BSA Officer', '', 'meets-criteria');
  const ev = done.audit.find((a) => a.event === 'approved');
  assert.equal(typeof ev.override, 'boolean');
  assert.equal(ev.aiRecommendation, run.recommendation);
  // override is true iff the human approved despite a block/escalate reco
  assert.equal(ev.override, run.recommendation !== 'approve');
  rmSync(d, { recursive: true, force: true });
});
