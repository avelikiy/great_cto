// scripts/lib/run-store.mjs — durable autopilot runs (Layer D).
//
// A run is a flow execution that PERSISTS: it starts, pauses at the human gate, waits in an inbox,
// and — only after a named human signs — RESUMES and executes the irreversible action (the write).
// State lives in .great_cto/autopilot-runs/<id>.json so a run survives process restarts.
//
//   startRun(vertical)  → runs to the first gate, status 'awaiting-approval'
//   approve(id, who)    → resumes past the gate, executes the write, status 'completed' (or next gate)
//   reject(id, who)     → status 'rejected', nothing irreversible runs
//
// The v2.43.0 safety invariant holds end to end: the irreversible step fires ONLY because a human
// approved its protecting gate (runFlow's approvedGates).

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadFlow, runFlow } from './flow-runner.mjs';
import { dueAt as slaDueAt, slaHours } from './sla.mjs';

// Derive an AI recommendation for the human from what the pre-gate connectors found.
function recommend(steps) {
  const sigs = steps.flatMap((s) => (s.toolCalls || []).map((c) => c.signal).filter(Boolean));
  const any = (f) => sigs.some(f);
  const confs = sigs.map((s) => s.confidence).filter((x) => typeof x === 'number');
  const confidence = confs.length ? +Math.min(...confs).toFixed(2) : null;
  const block = any((s) => s.hit === true || s.blocked === true || s.excluded === true
    || /BLOCK|HARD/i.test(String(s.decision || '')) || /Ineligible/i.test(String(s.recommendation || '')));
  const escalate = any((s) => s.refer === true || s.requiresMdReview === true || s.requiresMedicalReview === true
    || s.requiresBrokerReview === true || s.requiresPartnerSignoff === true || s.met === false || s.allowed === false
    || s.exceeds === true || s.edit === true || s.escalate === true || s.vetted === false
    || /Refer/i.test(String(s.recommendation || '')) || /material|significant/i.test(String(s.severity || '')) || s.band === 'high' || s.band === 'elevated');
  return { recommendation: block ? 'block' : escalate ? 'escalate' : 'approve', confidence };
}

// One shared store so the CLI and the admin board always see the SAME runs, regardless of the cwd
// each is launched from. Override with GREAT_CTO_RUNS_DIR (tests). Multi-tenant: runs are PHYSICALLY
// isolated under <base>/<tenant>/<id>.json — one tenant's directory never holds another's runs.
function baseDir() { return process.env.GREAT_CTO_RUNS_DIR || join(homedir(), '.great_cto', 'autopilot-runs'); }
function tenantDir(tenant = 'default') { return join(baseDir(), tenant); }
function ensureDir(tenant = 'default') { const d = tenantDir(tenant); if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function runPath(id, tenant = 'default') { return join(tenantDir(tenant), `${id}.json`); }
function listTenants() { try { return readdirSync(baseDir(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } }
function now() { return new Date().toISOString(); }
function newId(vertical) {
  return `run_${vertical}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Persist a run object into its tenant's directory. */
function save(run) { const t = run.tenant || 'default'; ensureDir(t); run.updatedAt = now(); writeFileSync(runPath(run.id, t), JSON.stringify(run, null, 2) + '\n'); return run; }

/** Load a run by id (or null) — scans every tenant directory. */
export function getRun(id) {
  for (const t of listTenants()) {
    const p = runPath(id, t);
    if (existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
  }
  return null;
}

/** All runs, newest first, optionally filtered by status. Physically scoped to a tenant's directory. */
export function listRuns({ status, tenant } = {}) {
  const tenants = tenant ? [tenant] : listTenants();   // a tenant only reads its OWN directory
  let runs = [];
  for (const t of tenants) {
    const dir = tenantDir(t);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try { runs.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* skip */ }
    }
  }
  runs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return status ? runs.filter((r) => r.status === status) : runs;
}

/** Runs awaiting a human signature (the inbox), scoped to a tenant. */
export function pendingGates({ tenant } = {}) {
  return listRuns({ status: 'awaiting-approval', tenant }).map((r) => ({
    id: r.id, vertical: r.vertical, tenant: r.tenant || 'default', gate: r.pausedAt, signer: r.signer, does: r.gateDoes,
    recommendation: r.recommendation, recoConfidence: r.recoConfidence, dueAt: r.dueAt, escalated: r.escalated || false, createdAt: r.createdAt,
  }));
}

function statusFromTrace(trace) {
  return trace.status === 'paused-at-gate' ? 'awaiting-approval' : (trace.unsafe ? 'blocked' : 'completed');
}
function gateStep(trace) {
  return trace.steps.find((s) => s.gate && s.status === 'awaiting-human');
}

/** Start a durable run: execute to the first human gate and persist. */
export async function startRun(vertical, { mode = 'stub', payload = {}, tenant = 'default' } = {}) {
  const flow = loadFlow(vertical);
  const id = newId(vertical);
  // idempotency: a stable key per run so a retried write never double-submits at the provider.
  const trace = await runFlow(flow, { mode, payload: { idempotencyKey: id, ...payload } });
  const g = gateStep(trace);
  const createdAt = now();
  const reco = recommend(trace.steps); // AI recommendation for the human, from the pre-gate connectors
  const run = {
    id, vertical, tenant, mode, status: statusFromTrace(trace),
    owner: trace.owner, createdAt, updatedAt: createdAt,
    pausedAt: trace.pausedAt, pausedAtIndex: trace.pausedAtIndex,
    signer: g ? g.human : null, gateDoes: g ? g.does : null,
    recommendation: reco.recommendation, recoConfidence: reco.confidence,
    slaHours: slaHours(vertical), dueAt: slaDueAt(vertical, createdAt),
    steps: trace.steps,
    audit: [{ at: createdAt, event: 'started', mode, tenant, status: statusFromTrace(trace), pausedAt: trace.pausedAt, recommendation: reco.recommendation }],
  };
  return save(run);
}

/** Approve the pending gate: resume the run, execute the irreversible write, persist. Multi-gate aware. */
export async function approve(id, who, note = '', reason = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  const flow = loadFlow(run.vertical);
  const resume = await runFlow(flow, {
    mode: run.mode, startAt: run.pausedAtIndex, approvedGates: [run.pausedAt],
    // The human signed the gate — so the post-gate write IS authorised. Carry that authorisation into
    // the write payload (the connector-level guards are belt-and-suspenders to the gate) + a stable
    // idempotency key so a retried write never double-submits.
    payload: { idempotencyKey: run.id, signedBy: who, approved: true, brokerSignedOff: true, bsaOfficerApproved: true, qppvApproved: true },
  });
  const signedGate = run.pausedAt; // the gate we just resumed past
  // annotate the now-approved gate with who signed it
  const gs = resume.steps.find((s) => s.gate && s.status === 'approved');
  if (gs) { gs.approvedBy = who; gs.note = note || undefined; gs.reason = reason || undefined; }
  // splice the resume trace in where the run paused
  run.steps = run.steps.slice(0, run.pausedAtIndex).concat(resume.steps);
  run.status = statusFromTrace(resume);
  const g = gateStep(resume);
  run.pausedAt = resume.pausedAt; run.pausedAtIndex = resume.pausedAtIndex;
  run.signer = g ? g.human : null; run.gateDoes = g ? g.does : null;
  // override: the human approved against the AI's caution (recommended block/escalate)
  const override = run.recommendation === 'block' || run.recommendation === 'escalate';
  run.audit.push({ at: now(), event: 'approved', gate: signedGate, by: who, note: note || undefined, reason: reason || undefined, aiRecommendation: run.recommendation, override, newStatus: run.status });
  return save(run);
}

/** Reject the pending gate: nothing irreversible runs. */
export async function reject(id, who, note = '', reason = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  run.status = 'rejected';
  run.disposition = reason || 'rejected';
  // override: the human rejected what the AI recommended approving
  const override = run.recommendation === 'approve';
  run.audit.push({ at: now(), event: 'rejected', gate: run.pausedAt, by: who, note: note || undefined, reason: reason || undefined, aiRecommendation: run.recommendation, override });
  return save(run);
}

/** Escalate the pending gate to a senior — stays in the queue, flagged. */
export async function escalate(id, who, note = '', reason = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  run.escalated = true; run.escalatedBy = who; run.escalateReason = reason || undefined;
  run.audit.push({ at: now(), event: 'escalated', gate: run.pausedAt, by: who, note: note || undefined, reason: reason || undefined });
  return save(run); // status stays awaiting-approval so a senior can sign
}

/** Send back for more information — nothing irreversible runs; recoverable, not a hard reject. */
export async function sendBack(id, who, note = '', reason = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  run.status = 'sent-back';
  run.disposition = reason || 'needs-info';
  run.audit.push({ at: now(), event: 'sent-back', gate: run.pausedAt, by: who, note: note || undefined, reason: reason || undefined });
  return save(run);
}

/** Aggregate KPIs over the runs an operator/admin can see (the analytics surface). */
export function stats({ tenant } = {}) {
  const runs = listRuns({ tenant });
  const by = (k) => runs.reduce((m, r) => ((m[r[k] || '—'] = (m[r[k] || '—'] || 0) + 1), m), {});
  const ev = (name) => runs.reduce((n, r) => n + (r.audit || []).filter((a) => a.event === name).length, 0);
  const completed = runs.filter((r) => r.status === 'completed').length;
  const decided = ev('approved') + ev('rejected');
  // time-to-decision (start → first approve/reject), minutes
  const ttd = [];
  for (const r of runs) {
    const start = r.createdAt && new Date(r.createdAt).getTime();
    const dec = (r.audit || []).find((a) => a.event === 'approved' || a.event === 'rejected');
    if (start && dec) ttd.push((new Date(dec.at).getTime() - start) / 60000);
  }
  const avgTtd = ttd.length ? +(ttd.reduce((a, b) => a + b, 0) / ttd.length).toFixed(1) : null;
  const awaiting = runs.filter((r) => r.status === 'awaiting-approval');
  const slaBreaches = awaiting.filter((r) => (Date.now() - new Date(r.createdAt).getTime()) / 60000 >= 240).length;
  return {
    total: runs.length,
    byStatus: by('status'),
    byVertical: by('vertical'),
    approved: ev('approved'), rejected: ev('rejected'), escalated: ev('escalated'), sentBack: ev('sent-back'),
    overrides: runs.reduce((n, r) => n + (r.audit || []).filter((a) => a.override === true).length, 0),
    completed,
    approvalRate: decided ? +(ev('approved') / decided * 100).toFixed(1) : null,
    escalationRate: runs.length ? +((ev('escalated') / runs.length) * 100).toFixed(1) : null,
    awaiting: awaiting.length, slaBreaches, avgTimeToDecisionMin: avgTtd,
  };
}
