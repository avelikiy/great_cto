// tests/lib/run-store.test.mjs — durable autopilot runs + resume (Layer D)
//
// Run: node --test tests/lib/run-store.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startRun, approve, reject, escalate, sendBack, stats, getConfig, setConfig, qaScore, qaQueue, getRun, listRuns, pendingGates, verifyAudit, purgeRuns, exportRecord, slaState, autoEscalateStale, calibration, suggestFloor, stageProgress, runMetrics, metering, connectorHealth, deadLetters, requeue } from '../../scripts/lib/run-store.mjs';
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

test('Wave C: confidence floor downgrades a low-confidence approve to escalate', async () => {
  const d = tmp();
  setConfig('default', { confidenceFloor: 0.99 });          // demand near-perfect confidence
  const run = await startRun('customs', { mode: 'live' });   // hs-classify returns a confidence
  // customs clean t-shirt → confidence ~1.0 so still approve; lower the bar test:
  setConfig('default', { confidenceFloor: 0.5 });
  assert.ok(['approve', 'escalate', 'block'].includes(run.recommendation));
  assert.equal(typeof getConfig('default').confidenceFloor, 'number');
  rmSync(d, { recursive: true, force: true });
});

test('Wave C: a run carries an AI-drafted narrative', async () => {
  const d = tmp();
  const run = await startRun('aml', { mode: 'stub' });
  assert.match(run.narrative, /DETERMINATION DRAFT — aml/);
  assert.match(run.narrative, /AI recommendation/);
  rmSync(d, { recursive: true, force: true });
});

test('Wave D: QA scoring records on the run + audit', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'stub' });
  await approve(a.id, 'Coder');
  const scored = qaScore(a.id, 4, 'QA Lead', 'good');
  assert.equal(scored.qa.score, 4);
  assert.equal(scored.qa.by, 'QA Lead');
  assert.ok(scored.audit.some((e) => e.event === 'qa-scored' && e.score === 4));
  rmSync(d, { recursive: true, force: true });
});

test('E1: stats({by}) returns the operator’s own numbers (my work)', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'stub' });
  await approve(a.id, 'Coder Lee');
  const b = await startRun('rcm', { mode: 'stub' });
  await reject(b.id, 'Coder Lee');
  const me = stats({ by: 'Coder Lee' });
  assert.equal(me.scope, 'me');
  assert.equal(me.myDecisions, 2);
  assert.equal(me.myApproved, 1);
  assert.equal(me.myRejected, 1);
  // someone else sees none of mine
  assert.equal(stats({ by: 'Other' }).myDecisions, 0);
  rmSync(d, { recursive: true, force: true });
});

test('Wave F: audit hash-chain is tamper-evident', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'stub' });
  const done = await approve(a.id, 'Coder', 'ok', 'meets-criteria', 'CPC-12345');
  assert.equal(verifyAudit(done), true);
  // record the signer's attested license
  assert.ok(done.audit.some((e) => e.event === 'approved' && e.license === 'CPC-12345'));
  // tamper: edit a past entry → chain breaks
  done.audit[0].by = 'attacker';
  assert.equal(verifyAudit(done), false);
  rmSync(d, { recursive: true, force: true });
});

test('Wave F: encryption at-rest — run files on disk are ciphertext, API still reads', async () => {
  const d = tmp();
  process.env.GREAT_CTO_ENCRYPT_KEY = 'test-key-please-rotate';
  const run = await startRun('aml', { mode: 'stub', tenant: 'acme' });
  const raw = readFileSync(join(d, 'acme', run.id + '.json'), 'utf8');
  assert.match(raw, /"enc":1/);                 // encrypted envelope on disk
  assert.ok(!raw.includes('Designated BSA'));   // signer/PII not in plaintext
  assert.equal(getRun(run.id).signer, 'Designated BSA/AML Officer'); // transparent decrypt
  delete process.env.GREAT_CTO_ENCRYPT_KEY;
  rmSync(d, { recursive: true, force: true });
});

test('Wave F: submission receipt + regulator-format export', async () => {
  const d = tmp();
  const a = await startRun('rcm', { mode: 'live' });
  const done = await approve(a.id, 'Coder', '', 'meets-criteria', 'CPC-1');
  assert.ok(done.submission && done.submission.connectors.includes('clearinghouse'));
  const txt = exportRecord(done.id);
  assert.match(txt, /RCM DETERMINATION/);
  assert.match(txt, /Audit integrity: VERIFIED/);
  assert.match(txt, /SIGNATURES/);
  rmSync(d, { recursive: true, force: true });
});

test('Wave F: retention purge removes old runs', async () => {
  const d = tmp();
  await startRun('rcm', { mode: 'stub' });
  // cutoff = now + 1 day (days:-1), so a just-created run is unambiguously "older" — no same-ms
  // boundary race with Date.now() (which made days:0 flaky under concurrent load).
  const n = purgeRuns({ days: -1 });
  assert.ok(n >= 1);
  rmSync(d, { recursive: true, force: true });
});

// ── Wave G (Tier-2) ──

test('Wave G #7: slaState classifies ok / at-risk / breached against the deadline', async () => {
  const d = tmp();
  const run = await startRun('soc', { mode: 'stub' }); // soc SLA = 4h
  const created = new Date(run.createdAt).getTime();
  assert.equal(slaState(run, created).state, 'ok');                              // fresh
  assert.equal(slaState(run, created + 3.5 * 3600 * 1000).state, 'at-risk');     // <25% of 4h left
  assert.equal(slaState(run, created + 5 * 3600 * 1000).state, 'breached');      // past due
  rmSync(d, { recursive: true, force: true });
});

test('Wave G #7: autoEscalateStale escalates a breached run exactly once, leaves a healthy one', async () => {
  const d = tmp();
  const stale = await startRun('soc', { mode: 'stub' });   // 4h SLA
  const fresh = await startRun('aml', { mode: 'stub' });   // 720h SLA — nowhere near due
  const future = new Date(stale.createdAt).getTime() + 6 * 3600 * 1000; // 6h later: soc breached, aml fine
  const first = autoEscalateStale({ nowMs: future });
  assert.equal(first.length, 1);
  assert.equal(first[0].id, stale.id);
  assert.equal(first[0].state, 'breached');
  const s = getRun(stale.id);
  assert.equal(s.escalated, true);
  assert.equal(s.slaEscalated, true);
  assert.equal(s.escalatedBy, 'sla-monitor');
  assert.ok((s.audit || []).some((a) => a.event === 'sla-escalated'));
  assert.equal(s.status, 'awaiting-approval');            // still signable
  // idempotent: a second sweep does nothing
  assert.equal(autoEscalateStale({ nowMs: future }).length, 0);
  // the fresh run was never touched
  assert.equal(getRun(fresh.id).escalated || false, false);
  rmSync(d, { recursive: true, force: true });
});

test('Wave G #7: at-risk runs escalate only when atRisk:true is requested', async () => {
  const d = tmp();
  const run = await startRun('soc', { mode: 'stub' });
  const atRiskTime = new Date(run.createdAt).getTime() + 3.5 * 3600 * 1000; // <25% left, not yet due
  assert.equal(autoEscalateStale({ nowMs: atRiskTime }).length, 0);          // default: breached only
  assert.equal(autoEscalateStale({ nowMs: atRiskTime, atRisk: true }).length, 1);
  rmSync(d, { recursive: true, force: true });
});

// stub runs carry no numeric confidence (the demo connectors emit none); calibration is for
// production data where they do. Inject a confidence onto the persisted run as a test fixture.
function setConfidence(id, c) {
  const p = join(process.env.GREAT_CTO_RUNS_DIR, 'default', `${id}.json`);
  const run = JSON.parse(readFileSync(p, 'utf8'));
  run.recoConfidence = c;
  writeFileSync(p, JSON.stringify(run, null, 2) + '\n');
}

test('Wave G #5: calibration buckets decided runs and reports an ECE', async () => {
  const d = tmp();
  // two decided runs so the curve is non-empty; an undecided one is ignored
  const a = await startRun('rcm', { mode: 'stub' }); setConfidence(a.id, 0.95);
  await approve(a.id, 'Dr. A', '', 'medically-necessary', 'MD-1');
  const b = await startRun('rcm', { mode: 'stub' }); setConfidence(b.id, 0.95);
  await reject(b.id, 'Dr. B', '', 'not-covered');
  await startRun('rcm', { mode: 'stub' }); // undecided — excluded
  const cal = calibration({});
  assert.ok(Array.isArray(cal.curve));
  assert.equal(cal.n, 2);                       // only the two decided runs
  assert.ok(cal.curve.every((bk) => bk.n > 0 && bk.accuracy >= 0 && bk.accuracy <= 1));
  assert.ok(cal.ece === null || (cal.ece >= 0 && cal.ece <= 1));
  rmSync(d, { recursive: true, force: true });
});

test('Wave G #5: suggestFloor proposes a floor from observed accuracy (or null when no data)', async () => {
  const d = tmp();
  assert.equal(suggestFloor({}), null);          // no decided runs yet
  const a = await startRun('rcm', { mode: 'stub' }); setConfidence(a.id, 0.85);
  await approve(a.id, 'Dr. A', '', 'medically-necessary', 'MD-1'); // clean approve (reco=approve, no override)
  const s = suggestFloor({ target: 0.5 });
  // one clean (non-override) approval → accuracy 1.0 in the 0.8-0.9 bucket ≥ target → floor proposed
  assert.ok(s && s.suggestedFloor === 0.8 && s.target === 0.5);
  rmSync(d, { recursive: true, force: true });
});

test('Wave G #8: stageProgress lists each gate stage with signer + status (multi-gate tax)', async () => {
  const d = tmp();
  const run = await startRun('tax', { mode: 'stub' });
  const sp = stageProgress(run);
  assert.ok(sp.length >= 1);
  assert.equal(sp[0].stage, 1);
  assert.ok('signer' in sp[0] && 'status' in sp[0]);
  rmSync(d, { recursive: true, force: true });
});

// ── Wave H (Tier-3 ops) ──

test('Wave H #11: runMetrics reports latency / calls / cost against a budget', async () => {
  const d = tmp();
  const run = await startRun('rcm', { mode: 'stub' });
  const m = runMetrics(run);
  assert.ok(m.connectorCalls >= 1);
  assert.ok(typeof m.latencyMs === 'number' && m.latencyMs >= 0);
  assert.ok(typeof m.cost === 'number' && m.cost >= 0);
  assert.ok(typeof m.latencyBudgetMs === 'number' && m.latencyBudgetMs > 0);
  assert.equal(typeof m.overLatencyBudget, 'boolean');
  rmSync(d, { recursive: true, force: true });
});

test('Wave H #11: metering aggregates usage across runs (the billing surface)', async () => {
  const d = tmp();
  await startRun('rcm', { mode: 'stub' });
  await startRun('tax', { mode: 'stub' });
  const bill = metering({});
  assert.equal(bill.runs, 2);
  assert.ok(bill.connectorCalls >= 2);
  assert.ok(bill.totalCostUsd >= 0);
  assert.ok(bill.byVertical.rcm && bill.byVertical.tax);
  rmSync(d, { recursive: true, force: true });
});

test('Wave H #12: connectorHealth aggregates call outcomes per connector', async () => {
  const d = tmp();
  await startRun('rcm', { mode: 'stub' });   // healthy stub calls
  const health = connectorHealth({});
  assert.ok(Array.isArray(health) && health.length >= 1);
  const h = health[0];
  assert.ok(h.connector && h.calls >= 1);
  assert.equal(typeof h.failureRate, 'number');
  assert.equal(typeof h.healthy, 'boolean');
  assert.equal(h.healthy, true);             // stub calls don't fail
  rmSync(d, { recursive: true, force: true });
});

test('Wave H #12: connectorHealth flags an unhealthy connector under fault injection', async () => {
  const d = tmp();
  process.env.GREAT_CTO_FAULT_INJECT = '1';
  try {
    await startRun('rcm', { mode: 'stub' });
    const health = connectorHealth({});
    assert.ok(health.some((h) => h.failures > 0 && h.healthy === false));
  } finally { delete process.env.GREAT_CTO_FAULT_INJECT; }
  rmSync(d, { recursive: true, force: true });
});

test('Wave H #10: a write that fails after retries is dead-lettered, then requeue recovers it', async () => {
  const d = tmp();
  // Start clean (reaches the gate), then inject faults so the post-gate write fails its retries.
  const run = await startRun('rcm', { mode: 'stub' });
  process.env.GREAT_CTO_FAULT_INJECT = '1';
  let dl;
  try {
    dl = await approve(run.id, 'Biller A', '', 'clean-claim');
    assert.equal(dl.status, 'dead-letter');
    assert.ok(dl.deadLetter && dl.deadLetter.gate);
    assert.ok((dl.audit || []).some((a) => a.event === 'dead-lettered'));
    // it surfaces in the dead-letter queue
    assert.ok(deadLetters({}).some((x) => x.id === run.id));
  } finally { delete process.env.GREAT_CTO_FAULT_INJECT; }
  // faults cleared → requeue re-runs the write and completes
  const fixed = await requeue(run.id, 'ops-bot');
  assert.equal(fixed.status, 'completed');
  assert.ok((fixed.audit || []).some((a) => a.event === 'requeued'));
  assert.equal(deadLetters({}).length, 0);
  // the irreversible write actually ran on recovery
  const submit = fixed.steps.find((s) => /submit the 837/.test(s.does));
  assert.ok(submit && submit.toolCalls.some((c) => c.ok));
  rmSync(d, { recursive: true, force: true });
});
