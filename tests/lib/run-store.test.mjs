// tests/lib/run-store.test.mjs — durable autopilot runs + resume (Layer D)
//
// Run: node --test tests/lib/run-store.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startRun, approve, reject, getRun, listRuns, pendingGates } from '../../scripts/lib/run-store.mjs';
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
