// scripts/lib/flow-runner.mjs — execute a vertical autopilot flow (Phase 4).
//
// This is the "doing" layer: it walks a flow's steps in order and actually runs each one.
//   - an AGENT step (🤖 intake / process / deliver / monitor) invokes its connectors and records
//     the result — in stub mode it returns deterministic mock data; in live mode it hits the real
//     adapter (e.g. the FHIR connector reads a real clinical note).
//   - a HUMAN step (🧑‍⚖️ a gate) PAUSES the run — the autopilot does the volume up to the judgment
//     call, then stops and hands off to the named human. This is the assistant↔autopilot boundary,
//     enforced at runtime, not just on the page.
//
// Returns a run trace (what ran, what each tool returned, where it paused). Stub mode is
// deterministic + network-free, so the whole flow is unit-testable. Live mode proves the same
// path against real systems one connector at a time.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { call, getConnector } from './connectors.mjs';

const FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'flows');

/** Load a flow by vertical slug from flows/<vertical>.flow.json. */
export function loadFlow(vertical) {
  return JSON.parse(readFileSync(join(FLOWS_DIR, `${vertical}.flow.json`), 'utf8'));
}

/** The op a runner invokes on a connector — its first declared capability (demo/representative). */
function defaultOp(connectorId) {
  const spec = getConnector(connectorId);
  return spec && spec.capabilities[0];
}

// Representative demo inputs per connector:op, so a live run can actually exercise an adapter that
// requires inputs (in production the orchestrator threads these from prior steps). The caller's
// `payload` always overrides these.
const DEMO_INPUTS = {
  'code-sets:lookup-code': { q: 'type 2 diabetes' },
  'code-sets:validate-code': { code: 'E11.9' },
  'ncci-mue:check-ptp': { code1: '99213', code2: '36415' },
  'ncci-mue:check-mue': { code: '99213', units: 1 },
  'e-signature:send-for-signature': { docType: 'mutual NDA' },
  'e-signature:check-excluded': { docType: 'mutual NDA' },
};

/**
 * Run a flow.
 * @param {object} flow  a flow object (from loadFlow)
 * @param {{ mode?: 'stub'|'live', payload?: object, stopAtGate?: boolean }} opts
 *   - mode: connector execution mode (default 'stub').
 *   - stopAtGate: if true (default), the run PAUSES at the first human checkpoint and returns;
 *     if false, gate steps are recorded as 'awaiting-human' but the run continues past them
 *     (useful to dry-run the whole flow).
 * @returns {Promise<{vertical, mode, status, pausedAt, steps:[…]}>}
 */
export async function runFlow(flow, { mode = 'stub', payload = {}, stopAtGate = true } = {}) {
  const trace = { vertical: flow.vertical, mode, status: 'completed', pausedAt: null, steps: [] };

  for (let i = 0; i < (flow.steps || []).length; i++) {
    const s = flow.steps[i];

    if (s.gate) {
      trace.steps.push({ i, does: s.does, human: s.human, gate: s.gate, status: 'awaiting-human' });
      if (stopAtGate) { trace.status = 'paused-at-gate'; trace.pausedAt = s.gate; break; }
      continue;
    }

    const toolCalls = [];
    for (const t of s.tools || []) {
      const op = defaultOp(t);
      if (!op) { toolCalls.push({ connector: t, op: null, ok: false, error: 'unknown connector' }); continue; }
      const r = await call(t, op, { ...DEMO_INPUTS[`${t}:${op}`], ...payload }, { mode });
      toolCalls.push({ connector: t, op, ok: !!r.ok, mode: r.mode, error: r.error });
    }
    trace.steps.push({ i, does: s.does, agent: s.agent, status: 'done', toolCalls });
  }

  return trace;
}

/** Compact summary of a run trace. */
export function summarizeRun(trace) {
  const done = trace.steps.filter((s) => s.status === 'done').length;
  const calls = trace.steps.flatMap((s) => s.toolCalls || []);
  const okCalls = calls.filter((c) => c.ok).length;
  return {
    vertical: trace.vertical, mode: trace.mode, status: trace.status,
    stepsRun: done, toolCalls: calls.length, toolCallsOk: okCalls, pausedAt: trace.pausedAt,
  };
}

/** Human-readable run report. */
export function formatRun(trace) {
  const out = [`=== Run: ${trace.vertical} autopilot (${trace.mode}) ===`];
  for (const s of trace.steps) {
    if (s.gate) { out.push(`  🧑‍⚖️ ${s.i + 1}. ${s.does}  → PAUSE · ${s.human} (${s.gate})`); continue; }
    const tools = (s.toolCalls || []).map((c) => `${c.connector}:${c.op}${c.ok ? '✓' : '✗'}`).join(' ');
    out.push(`  🤖 ${s.i + 1}. ${s.does}  [${s.agent}]${tools ? ' · ' + tools : ''}`);
  }
  out.push(`\n  status: ${trace.status}${trace.pausedAt ? ` (awaiting human at ${trace.pausedAt})` : ''}`);
  return out.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vertical = process.argv[2];
  const live = process.argv.includes('--live');
  const full = process.argv.includes('--full'); // don't stop at the gate
  if (!vertical) { console.error('usage: flow-runner.mjs <vertical> [--live] [--full]'); process.exit(2); }
  runFlow(loadFlow(vertical), { mode: live ? 'live' : 'stub', stopAtGate: !full })
    .then((t) => { console.log(formatRun(t)); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
