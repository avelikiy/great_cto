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

// One shared store so the CLI and the admin board always see the SAME runs, regardless of the cwd
// each is launched from. Override with GREAT_CTO_RUNS_DIR (tests, or a per-tenant path later).
function runsDir() { return process.env.GREAT_CTO_RUNS_DIR || join(homedir(), '.great_cto', 'autopilot-runs'); }
function ensureDir() { const d = runsDir(); if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function runPath(id) { return join(runsDir(), `${id}.json`); }
function now() { return new Date().toISOString(); }
function newId(vertical) {
  return `run_${vertical}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Persist a run object. */
function save(run) { ensureDir(); run.updatedAt = now(); writeFileSync(runPath(run.id), JSON.stringify(run, null, 2) + '\n'); return run; }

/** Load a run by id (or null). */
export function getRun(id) {
  try { return JSON.parse(readFileSync(runPath(id), 'utf8')); } catch { return null; }
}

/** All runs, newest first, optionally filtered by status. */
export function listRuns({ status } = {}) {
  ensureDir();
  const dir = runsDir();
  const runs = readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return status ? runs.filter((r) => r.status === status) : runs;
}

/** Runs awaiting a human signature (the inbox). */
export function pendingGates() {
  return listRuns({ status: 'awaiting-approval' }).map((r) => ({
    id: r.id, vertical: r.vertical, gate: r.pausedAt, signer: r.signer, does: r.gateDoes, createdAt: r.createdAt,
  }));
}

function statusFromTrace(trace) {
  return trace.status === 'paused-at-gate' ? 'awaiting-approval' : (trace.unsafe ? 'blocked' : 'completed');
}
function gateStep(trace) {
  return trace.steps.find((s) => s.gate && s.status === 'awaiting-human');
}

/** Start a durable run: execute to the first human gate and persist. */
export async function startRun(vertical, { mode = 'stub', payload = {} } = {}) {
  const flow = loadFlow(vertical);
  const trace = await runFlow(flow, { mode, payload });
  const g = gateStep(trace);
  const run = {
    id: newId(vertical), vertical, mode, status: statusFromTrace(trace),
    owner: trace.owner, createdAt: now(), updatedAt: now(),
    pausedAt: trace.pausedAt, pausedAtIndex: trace.pausedAtIndex,
    signer: g ? g.human : null, gateDoes: g ? g.does : null,
    steps: trace.steps,
    audit: [{ at: now(), event: 'started', mode, status: statusFromTrace(trace), pausedAt: trace.pausedAt }],
  };
  return save(run);
}

/** Approve the pending gate: resume the run, execute the irreversible write, persist. */
export async function approve(id, who, note = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  const flow = loadFlow(run.vertical);
  const resume = await runFlow(flow, {
    mode: run.mode, startAt: run.pausedAtIndex, approvedGates: [run.pausedAt],
  });
  const signedGate = run.pausedAt; // the gate we just resumed past
  // annotate the now-approved gate with who signed it
  const gs = resume.steps.find((s) => s.gate && s.status === 'approved');
  if (gs) { gs.approvedBy = who; gs.note = note || undefined; }
  // splice the resume trace in where the run paused
  run.steps = run.steps.slice(0, run.pausedAtIndex).concat(resume.steps);
  run.status = statusFromTrace(resume);
  const g = gateStep(resume);
  run.pausedAt = resume.pausedAt; run.pausedAtIndex = resume.pausedAtIndex;
  run.signer = g ? g.human : null; run.gateDoes = g ? g.does : null;
  run.audit.push({ at: now(), event: 'approved', gate: signedGate, by: who, note: note || undefined, newStatus: run.status });
  return save(run);
}

/** Reject the pending gate: nothing irreversible runs. */
export async function reject(id, who, note = '') {
  const run = getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  if (run.status !== 'awaiting-approval') throw new Error(`run ${id} is '${run.status}', not awaiting-approval`);
  run.status = 'rejected';
  run.audit.push({ at: now(), event: 'rejected', gate: run.pausedAt, by: who, note: note || undefined });
  return save(run);
}
