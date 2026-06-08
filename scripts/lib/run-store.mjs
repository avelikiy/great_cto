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

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'node:crypto';
import { loadFlow, runFlow } from './flow-runner.mjs';
import { dueAt as slaDueAt, slaHours } from './sla.mjs';
import { latencyBudgetMs, unitCostUsd } from './budgets.mjs';

// ── Encryption at-rest (AES-256-GCM) — PHI/PII never in plaintext when a key is set ──
function encKey() { const k = process.env.GREAT_CTO_ENCRYPT_KEY; return k ? scryptSync(k, 'gcto-autopilot', 32) : null; }
function serialize(run) {
  const plain = JSON.stringify(run, null, 2);
  const k = encKey(); if (!k) return plain + '\n';
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return JSON.stringify({ enc: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: ct.toString('base64') }) + '\n';
}
function deserialize(raw) {
  const o = JSON.parse(raw); if (!o || !o.enc) return o;
  const k = encKey(); if (!k) throw new Error('run is encrypted but GREAT_CTO_ENCRYPT_KEY is not set');
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(o.iv, 'base64')); d.setAuthTag(Buffer.from(o.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8'));
}

// ── Tamper-evident audit: hash-chain every entry so any later edit is detectable ──
function hashEntry(e) { const { hash, ...rest } = e; return createHash('sha256').update(JSON.stringify(rest)).digest('hex'); }
function pushAudit(run, e) {
  run.audit = run.audit || [];
  e.prevHash = run.audit.length ? run.audit[run.audit.length - 1].hash : '';
  e.hash = hashEntry(e);
  run.audit.push(e);
}
/** True iff the audit chain is intact (no entry edited / inserted / removed). */
export function verifyAudit(run) {
  let prev = '';
  for (const e of run.audit || []) {
    if (e.prevHash !== prev || e.hash !== hashEntry(e)) return false;
    prev = e.hash;
  }
  return true;
}

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

// ── In-console config: an adjustable confidence floor per tenant (the routing dial) ──
function configPath() { return join(baseDir(), 'autopilot-config.json'); }
const DEFAULT_CONFIG = { confidenceFloor: 0.7, autoEligible: true };
export function getConfig(tenant = 'default') {
  try { const all = JSON.parse(readFileSync(configPath(), 'utf8')); return { ...DEFAULT_CONFIG, ...(all[tenant] || {}) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}
export function setConfig(tenant = 'default', patch = {}) {
  let all = {}; try { all = JSON.parse(readFileSync(configPath(), 'utf8')); } catch { /* new */ }
  all[tenant] = { ...DEFAULT_CONFIG, ...(all[tenant] || {}), ...patch };
  if (!existsSync(baseDir())) mkdirSync(baseDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(all, null, 2) + '\n');
  return all[tenant];
}

// AI-drafted rationale the signer reviews — composed from the connector findings (evidence).
function draftNarrative(vertical, recommendation, steps, signer) {
  const evid = steps.flatMap((s) => (s.toolCalls || []).filter((c) => c.signal)
    .map((c) => `${c.connector}: ${Object.entries(c.signal).map(([k, v]) => `${k}=${v}`).join(', ')}`));
  return [
    `DETERMINATION DRAFT — ${vertical} autopilot`,
    `AI recommendation: ${String(recommendation).toUpperCase()}.`,
    'Basis (connector findings — the evidence):',
    ...(evid.length ? evid.map((e) => `  • ${e}`) : ['  • (no risk signals; routine case)']),
    '',
    `The autopilot processed the case to the human checkpoint. ${signer || 'The named signer'} reviews`,
    'this draft and signs the determination; the irreversible action executes only on signature.',
  ].join('\n');
}

// ── QA: sample CLOSED cases for a quality review (the second loop, after the action) ──
function isSampled(id) { try { return parseInt(id.slice(-1), 36) % 5 === 0; } catch { return false; } } // ~20%
export function qaQueue({ tenant } = {}) {
  return listRuns({ tenant }).filter((r) => ['completed', 'rejected'].includes(r.status) && isSampled(r.id) && !r.qa);
}
export function qaScore(id, score, by, note = '') {
  const run = getRun(id); if (!run) throw new Error(`run ${id} not found`);
  run.qa = { score: Number(score), by, note: note || undefined, at: now() };
  pushAudit(run, { at: now(), event: 'qa-scored', by, score: Number(score), note: note || undefined });
  return save(run);
}

/** Retention: delete runs created more than `days` ago (optionally a single tenant). Returns count. */
export function purgeRuns({ days = 365, tenant } = {}) {
  const cutoff = Date.now() - days * 86400 * 1000;
  let n = 0;
  for (const r of listRuns({ tenant })) {
    if (new Date(r.createdAt).getTime() < cutoff) { try { rmSync(runPath(r.id, r.tenant || 'default')); n++; } catch { /* skip */ } }
  }
  return n;
}

/** Regulator-format export — the human-readable artifact (not raw JSON): the signed determination. */
export function exportRecord(id) {
  const run = getRun(id); if (!run) return null;
  const sig = (run.audit || []).filter((a) => ['approved', 'rejected'].includes(a.event));
  const L = [
    `GREATCTO AUTOPILOT — ${String(run.vertical).toUpperCase()} DETERMINATION`,
    `Case: ${run.id}    Tenant: ${run.tenant || 'default'}    Status: ${run.status}`,
    `Accountable owner: ${run.owner || run.signer || '—'}`,
    `Audit integrity: ${verifyAudit(run) ? 'VERIFIED (hash-chain intact)' : 'TAMPERED'}`,
    '',
    run.narrative || '',
    '',
    'SIGNATURES',
    ...(sig.length ? sig.map((a) => `  • ${a.event.toUpperCase()} by ${a.by}${a.license ? ' (license ' + a.license + ')' : ''} at ${a.at}${a.reason ? ' — ' + a.reason : ''}`) : ['  • (none)']),
  ];
  if (run.submission) L.push('', `SUBMISSION: ${run.submission.submitted ? 'transmitted to provider' : 'generated (no provider creds)'} via ${run.submission.connectors.join(', ')} (${run.submission.attempts} attempt(s))`);
  return L.join('\n');
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
function save(run) { const t = run.tenant || 'default'; ensureDir(t); run.updatedAt = now(); writeFileSync(runPath(run.id, t), serialize(run)); return run; }

/** Load a run by id (or null) — scans every tenant directory. */
export function getRun(id) {
  for (const t of listTenants()) {
    const p = runPath(id, t);
    if (existsSync(p)) { try { return deserialize(readFileSync(p, 'utf8')); } catch { return null; } }
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
      try { runs.push(deserialize(readFileSync(join(dir, f), 'utf8'))); } catch { /* skip */ }
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
export async function startRun(vertical, { mode = 'stub', payload = {}, tenant = 'default', source } = {}) {
  const flow = loadFlow(vertical);
  const id = newId(vertical);
  // idempotency: a stable key per run so a retried write never double-submits at the provider.
  const trace = await runFlow(flow, { mode, payload: { idempotencyKey: id, ...payload } });
  const g = gateStep(trace);
  const createdAt = now();
  const cfg = getConfig(tenant);
  const reco = recommend(trace.steps); // AI recommendation for the human, from the pre-gate connectors
  // confidence floor (the routing dial): low-confidence approvals are downgraded to escalate.
  let recommendation = reco.recommendation;
  if (recommendation === 'approve' && reco.confidence != null && reco.confidence < cfg.confidenceFloor) recommendation = 'escalate';
  const autoEligible = cfg.autoEligible && recommendation === 'approve' && (reco.confidence == null || reco.confidence >= cfg.confidenceFloor);
  const run = {
    id, vertical, tenant, mode, status: statusFromTrace(trace),
    owner: trace.owner, createdAt, updatedAt: createdAt,
    pausedAt: trace.pausedAt, pausedAtIndex: trace.pausedAtIndex,
    signer: g ? g.human : null, gateDoes: g ? g.does : null,
    recommendation, recoConfidence: reco.confidence, autoEligible,
    narrative: draftNarrative(vertical, recommendation, trace.steps, g ? g.human : trace.owner),
    slaHours: slaHours(vertical), dueAt: slaDueAt(vertical, createdAt),
    steps: trace.steps,
    audit: [],
  };
  pushAudit(run, { at: createdAt, event: 'started', mode, tenant, status: statusFromTrace(trace), pausedAt: trace.pausedAt, recommendation, source: source || 'manual' });
  return save(run);
}

/** Approve the pending gate: resume the run, execute the irreversible write, persist. Multi-gate aware. */
export async function approve(id, who, note = '', reason = '', license = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  const flow = loadFlow(run.vertical);
  const fromIndex = run.pausedAtIndex;     // where the write resumes (for dead-letter requeue)
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
  // submission receipt + dead-letter (Wave H #10): what the post-gate write actually did.
  if (run.status === 'completed') {
    const writeCalls = resume.steps.filter((s) => s.blastRadius === 'high' || s.blastRadius === 'medium')
      .flatMap((s) => (s.toolCalls || []));
    const ok = writeCalls.filter((c) => c.ok);
    const failed = writeCalls.filter((c) => c.ok === false);
    if (ok.length) run.submission = {
      at: now(), submitted: ok.some((c) => c.submitted === true),
      connectors: [...new Set(ok.map((c) => c.connector))],
      attempts: Math.max(1, ...ok.map((c) => c.attempts || 1)),
    };
    // a write that exhausted its retries → dead-letter, NOT a silent "completed". Recoverable via requeue.
    if (failed.length) {
      run.status = 'dead-letter';
      run.deadLetter = {
        at: now(), gate: signedGate, from: fromIndex,
        connectors: [...new Set(failed.map((c) => c.connector))],
        attempts: Math.max(1, ...failed.map((c) => c.attempts || 1)),
        error: failed.find((c) => c.error)?.error || 'write failed after retries',
      };
    }
  }
  // override: the human approved against the AI's caution (recommended block/escalate)
  const override = run.recommendation === 'block' || run.recommendation === 'escalate';
  pushAudit(run, { at: now(), event: 'approved', gate: signedGate, by: who, note: note || undefined, reason: reason || undefined, license: license || undefined, aiRecommendation: run.recommendation, override, newStatus: run.status });
  if (run.status === 'dead-letter') pushAudit(run, { at: now(), event: 'dead-lettered', gate: signedGate, by: 'runtime', error: run.deadLetter.error, attempts: run.deadLetter.attempts });
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
  pushAudit(run, { at: now(), event: 'rejected', gate: run.pausedAt, by: who, note: note || undefined, reason: reason || undefined, aiRecommendation: run.recommendation, override });
  return save(run);
}

/** Escalate the pending gate to a senior — stays in the queue, flagged. */
export async function escalate(id, who, note = '', reason = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  run.escalated = true; run.escalatedBy = who; run.escalateReason = reason || undefined;
  pushAudit(run, { at: now(), event: 'escalated', gate: run.pausedAt, by: who, note: note || undefined, reason: reason || undefined });
  return save(run); // status stays awaiting-approval so a senior can sign
}

/** Send back for more information — nothing irreversible runs; recoverable, not a hard reject. */
export async function sendBack(id, who, note = '', reason = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  run.status = 'sent-back';
  run.disposition = reason || 'needs-info';
  pushAudit(run, { at: now(), event: 'sent-back', gate: run.pausedAt, by: who, note: note || undefined, reason: reason || undefined });
  return save(run);
}

/** Aggregate KPIs over the runs an operator/admin can see (the analytics surface).
 *  With `by`, returns the OPERATOR's own numbers ("my work") instead of org totals. */
export function stats({ tenant, by } = {}) {
  const runs = listRuns({ tenant });
  if (by) {
    const mine = runs.flatMap((r) => (r.audit || []).filter((a) => a.by === by && ['approved', 'rejected', 'escalated', 'sent-back'].includes(a.event)).map((a) => ({ r, a })));
    const cnt = (e) => mine.filter((m) => m.a.event === e).length;
    const ttd = mine.filter((m) => m.r.createdAt).map((m) => (new Date(m.a.at).getTime() - new Date(m.r.createdAt).getTime()) / 60000);
    const overrides = mine.filter((m) => m.a.override === true).length;
    return {
      scope: 'me', by, myDecisions: mine.length,
      myApproved: cnt('approved'), myRejected: cnt('rejected'), myEscalated: cnt('escalated'), mySentBack: cnt('sent-back'),
      myOverrides: overrides,
      myAvgTimeToDecisionMin: ttd.length ? +(ttd.reduce((a, b) => a + b, 0) / ttd.length).toFixed(1) : null,
    };
  }
  const grp = (k) => runs.reduce((m, r) => ((m[r[k] || '—'] = (m[r[k] || '—'] || 0) + 1), m), {});
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
    byStatus: grp('status'),
    byVertical: grp('vertical'),
    approved: ev('approved'), rejected: ev('rejected'), escalated: ev('escalated'), sentBack: ev('sent-back'),
    overrides: runs.reduce((n, r) => n + (r.audit || []).filter((a) => a.override === true).length, 0),
    completed,
    approvalRate: decided ? +(ev('approved') / decided * 100).toFixed(1) : null,
    escalationRate: runs.length ? +((ev('escalated') / runs.length) * 100).toFixed(1) : null,
    awaiting: awaiting.length, slaBreaches, avgTimeToDecisionMin: avgTtd,
    autoEligible: awaiting.filter((r) => r.autoEligible).length,
    qaScored: runs.filter((r) => r.qa).length,
    qaAvgScore: (() => { const q = runs.filter((r) => r.qa); return q.length ? +(q.reduce((a, r) => a + r.qa.score, 0) / q.length).toFixed(1) : null; })(),
  };
}

// ── Wave G #7 — SLA auto-escalation: the deadline clock that ACTS, not just displays ──

/** How the SLA clock stands for a run: ok / at-risk (≤25% of the window left) / breached. */
export function slaState(run, nowMs = Date.now()) {
  if (!run || !run.dueAt || !run.createdAt) return { state: 'none', remainingMin: null, pct: null };
  const created = new Date(run.createdAt).getTime();
  const due = new Date(run.dueAt).getTime();
  const total = due - created;
  const remaining = due - nowMs;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const state = remaining <= 0 ? 'breached' : pct <= 0.25 ? 'at-risk' : 'ok';
  return { state, remainingMin: Math.round(remaining / 60000), pct: +pct.toFixed(3) };
}

/** Escalate awaiting runs whose SLA is breached (or at-risk, if asked) — once each. Idempotent via
 *  `slaEscalated`. Returns [{id,vertical,tenant,state,signer}] for the ones it just escalated. */
export function autoEscalateStale({ tenant, nowMs = Date.now(), atRisk = false } = {}) {
  const out = [];
  for (const r of listRuns({ status: 'awaiting-approval', tenant })) {
    if (r.slaEscalated) continue;                       // already handled by the monitor
    const s = slaState(r, nowMs);
    const trip = s.state === 'breached' || (atRisk && s.state === 'at-risk');
    if (!trip) continue;
    r.escalated = true; r.slaEscalated = true;
    r.escalatedBy = 'sla-monitor';
    r.escalateReason = `SLA ${s.state} — ${s.remainingMin}m vs deadline`;
    pushAudit(r, { at: now(), event: 'sla-escalated', by: 'sla-monitor', gate: r.pausedAt, slaState: s.state, remainingMin: s.remainingMin });
    save(r);
    out.push({ id: r.id, vertical: r.vertical, tenant: r.tenant || 'default', state: s.state, signer: r.signer, dueAt: r.dueAt });
  }
  return out;
}

// ── Wave G #5 — calibration + closed-loop: is the AI's confidence honest? ──

// A decided run is "AI-correct" iff the human did NOT override the recommendation and QA (if any)
// didn't fail it. Overrides and low QA scores are the training signal for the floor.
function aiCorrect(run) {
  const dec = (run.audit || []).find((a) => a.event === 'approved' || a.event === 'rejected');
  if (!dec) return null;
  if (dec.override === true) return false;
  if (run.qa && Number(run.qa.score) <= 2) return false;
  return true;
}
function confBucket(c) {
  const lo = Math.max(0, Math.min(0.9, Math.floor(c * 10) / 10));
  return `${lo.toFixed(1)}-${(lo + 0.1).toFixed(1)}`;
}

/** Reliability curve: bucket decided runs by recoConfidence, measure how often the AI was right.
 *  Also reports ECE (expected calibration error) — 0 = perfectly calibrated. */
export function calibration({ tenant } = {}) {
  const runs = listRuns({ tenant }).filter((r) => typeof r.recoConfidence === 'number' && aiCorrect(r) !== null);
  const buckets = {};
  for (const r of runs) {
    const key = confBucket(r.recoConfidence);
    const b = (buckets[key] = buckets[key] || { bucket: key, n: 0, correct: 0 });
    b.n++; if (aiCorrect(r)) b.correct++;
  }
  const curve = Object.values(buckets)
    .map((b) => ({ ...b, accuracy: +(b.correct / b.n).toFixed(3) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
  const total = curve.reduce((s, b) => s + b.n, 0);
  const ece = total
    ? +curve.reduce((s, b) => {
        const mid = parseFloat(b.bucket.split('-')[0]) + 0.05;
        return s + (b.n / total) * Math.abs(mid - b.accuracy);
      }, 0).toFixed(3)
    : null;
  return { curve, ece, n: total };
}

/** Closed loop: the lowest confidence band that hits `target` accuracy → a data-driven floor.
 *  Null when there isn't enough evidence (no bucket with n≥minN at/above target). */
export function suggestFloor({ tenant, target = 0.9, minN = 1 } = {}) {
  const { curve } = calibration({ tenant });
  const good = curve.filter((b) => b.accuracy >= target && b.n >= minN);
  if (!good.length) return null;
  return { suggestedFloor: parseFloat(good[0].bucket.split('-')[0]), basis: good[0], target };
}

// ── Wave G #8 — sequential review pipelines: surface the gate stages as a pipeline ──

/** The ordered human-gate stages of a run (intake → QC → review → submit), each with its signer +
 *  status — so a multi-gate flow reads as a pipeline, not a flat step list. */
export function stageProgress(run) {
  return (run.steps || [])
    .filter((s) => s.gate)
    .map((g, i) => ({ stage: i + 1, gate: g.does || g.gate || `stage ${i + 1}`, signer: g.human || null, status: g.status || 'pending', signedBy: g.approvedBy || null }));
}

// ── Wave H (Tier-3 ops) — metering, connector health, dead-letter / requeue ──

const runCalls = (run) => (run.steps || []).flatMap((s) => s.toolCalls || []);

/** Per-run ops metrics: latency, connector calls, retries, cost — against the vertical's latency budget. */
export function runMetrics(run) {
  const calls = runCalls(run);
  const latencyMs = calls.reduce((a, c) => a + (c.ms || 0), 0);
  const retries = calls.reduce((a, c) => a + Math.max(0, (c.attempts || 1) - 1), 0);
  const budget = latencyBudgetMs(run.vertical);
  return {
    latencyMs, connectorCalls: calls.length,
    failedCalls: calls.filter((c) => c.ok === false).length, retries,
    cost: +(calls.length * unitCostUsd()).toFixed(4),
    latencyBudgetMs: budget, overLatencyBudget: latencyMs > budget,
  };
}

/** Billing/metering surface: aggregate usage + cost across visible runs, with a per-vertical breakdown. */
export function metering({ tenant } = {}) {
  const runs = listRuns({ tenant });
  const per = runs.map((r) => ({ vertical: r.vertical, ...runMetrics(r) }));
  const sum = (k) => per.reduce((a, m) => a + (m[k] || 0), 0);
  const byVertical = {};
  for (const m of per) {
    const b = (byVertical[m.vertical] = byVertical[m.vertical] || { runs: 0, connectorCalls: 0, latencyMs: 0, cost: 0 });
    b.runs++; b.connectorCalls += m.connectorCalls; b.latencyMs += m.latencyMs; b.cost = +(b.cost + m.cost).toFixed(4);
  }
  return {
    runs: runs.length, connectorCalls: sum('connectorCalls'),
    totalLatencyMs: sum('latencyMs'), totalCostUsd: +sum('cost').toFixed(4),
    retries: sum('retries'), overLatencyBudget: per.filter((m) => m.overLatencyBudget).length,
    avgLatencyMs: per.length ? Math.round(sum('latencyMs') / per.length) : 0,
    byVertical,
  };
}

/** Connector health: per-connector call outcomes across runs — failure rate, p95 latency, last error. */
export function connectorHealth({ tenant } = {}) {
  const by = {};
  for (const r of listRuns({ tenant })) for (const c of runCalls(r)) {
    if (!c.connector) continue;
    const h = (by[c.connector] = by[c.connector] || { connector: c.connector, calls: 0, failures: 0, lat: [], lastError: null });
    h.calls++;
    if (c.ok === false) { h.failures++; if (c.error) h.lastError = c.error; }
    if (typeof c.ms === 'number') h.lat.push(c.ms);
  }
  return Object.values(by).map((h) => {
    const lat = h.lat.sort((a, b) => a - b);
    const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : null;
    const failureRate = h.calls ? +(h.failures / h.calls).toFixed(3) : 0;
    return { connector: h.connector, calls: h.calls, failures: h.failures, failureRate, p95LatencyMs: p95, lastError: h.lastError, healthy: failureRate < 0.5 };
  }).sort((a, b) => b.failureRate - a.failureRate);
}

/** The dead-letter queue: writes that exhausted their retries and need a human/ops requeue. */
export function deadLetters({ tenant } = {}) {
  return listRuns({ status: 'dead-letter', tenant }).map((r) => ({
    id: r.id, vertical: r.vertical, tenant: r.tenant || 'default',
    gate: r.deadLetter?.gate, connectors: r.deadLetter?.connectors, attempts: r.deadLetter?.attempts,
    error: r.deadLetter?.error, at: r.deadLetter?.at,
  }));
}

/** Requeue a dead-lettered run: re-execute the post-gate write (the gate was already signed). Recovers
 *  to 'completed' if the write now succeeds; stays dead-lettered (attempts bumped) if it fails again. */
export async function requeue(id, who = 'ops') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'dead-letter' || !run.deadLetter) throw new Error(`run ${id} is '${run.status}', not dead-letter`);
  const { from, gate } = run.deadLetter;
  const flow = loadFlow(run.vertical);
  const resume = await runFlow(flow, {
    mode: run.mode, startAt: from, approvedGates: [gate],
    payload: { idempotencyKey: run.id, signedBy: who, approved: true, brokerSignedOff: true, bsaOfficerApproved: true, qppvApproved: true },
  });
  run.steps = run.steps.slice(0, from).concat(resume.steps);
  const writeCalls = resume.steps.filter((s) => s.blastRadius === 'high' || s.blastRadius === 'medium').flatMap((s) => (s.toolCalls || []));
  const failed = writeCalls.filter((c) => c.ok === false);
  if (failed.length) {
    run.deadLetter = { ...run.deadLetter, at: now(), attempts: (run.deadLetter.attempts || 1) + 1, error: failed.find((c) => c.error)?.error || run.deadLetter.error };
    pushAudit(run, { at: now(), event: 'requeue-failed', by: who, attempts: run.deadLetter.attempts, error: run.deadLetter.error });
    return save(run);
  }
  const ok = writeCalls.filter((c) => c.ok);
  run.status = 'completed';
  run.submission = { at: now(), submitted: ok.some((c) => c.submitted === true), connectors: [...new Set(ok.map((c) => c.connector))], attempts: Math.max(1, ...ok.map((c) => c.attempts || 1)), requeued: true };
  delete run.deadLetter;
  pushAudit(run, { at: now(), event: 'requeued', by: who, newStatus: 'completed' });
  return save(run);
}
