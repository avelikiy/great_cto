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

// Extract the risk indicators a connector returns, so the runtime can derive an AI recommendation
// for the human (block / escalate / approve) from what the connectors actually found.
const SIGNAL_KEYS = ['hit', 'blocked', 'excluded', 'refer', 'met', 'confidence', 'decision', 'severity',
  'band', 'recommendation', 'requiresMdReview', 'requiresMedicalReview', 'requiresBrokerReview',
  'requiresPartnerSignoff', 'allowed', 'escalate', 'exceeds', 'edit', 'vetted'];
function riskSignal(r) {
  if (!r) return undefined;
  const src = { ...(r.data && typeof r.data === 'object' ? r.data : {}), blocked: r.blocked };
  const s = {};
  for (const k of SIGNAL_KEYS) if (src[k] !== undefined) s[k] = src[k];
  return Object.keys(s).length ? s : undefined;
}

/** Does a human checkpoint (a gate / a named human) appear strictly before step index i? */
function hasGateBefore(steps, i) {
  for (let j = 0; j < i; j++) if (steps[j].gate || steps[j].human) return true;
  return false;
}

/** The id of the nearest human gate strictly before step index i (the gate that protects it), or null. */
function protectingGate(steps, i) {
  for (let j = i - 1; j >= 0; j--) if (steps[j].gate) return steps[j].gate;
  return null;
}

/**
 * Validate a flow against the "the permission was the wound" invariant (Torlo, 2026): the danger is
 * an agent doing exactly what it's permitted — irreversibly, at machine speed, with no hesitation. So:
 *   1. every IRREVERSIBLE step (`reversible: false`) MUST be preceded by a human checkpoint — the
 *      autopilot runs the volume, but a person authorises the action that can't be undone;
 *   2. every autopilot MUST name an accountable `owner` — one human who answers for it (closes the
 *      "confused deputy / the AI did it" accountability gap).
 * Returns { ok, violations:[…] }. Steps without `reversible` are treated as reversible (safe, additive
 * default), so a flow that sets nothing stays valid except for the owner requirement.
 */
export function validateFlow(flow) {
  const steps = flow.steps || [];
  const violations = [];
  steps.forEach((s, i) => {
    if (s.reversible === false && !hasGateBefore(steps, i)) {
      violations.push({ type: 'irreversible-without-gate', step: i, does: s.does, blastRadius: s.blastRadius || 'unknown' });
    }
  });
  if (!flow.owner) violations.push({ type: 'no-owner' });
  return { ok: violations.length === 0, violations };
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
  'sanctions-screen:screen-party': { name: 'Acme Office Supplies LLC' },
  'tax-engine:compute-return': { income: 85000, filingStatus: 'single', withheld: 12000 },
  'threat-intel:enrich-ioc': { ioc: '1.1.1.1' },
  'fraud-score:score-fraud': { amountUsd: 5000, daysSincePolicyStart: 600, priorClaims12mo: 0, lossType: 'collision', hasPoliceReport: true, reportedDelayDays: 1 },
  'aus:run-aus': { loanAmount: 300000, propertyValue: 400000, monthlyIncome: 9000, monthlyDebts: 500, ficoScore: 740, loanType: 'conventional', occupancy: 'primary' },
  'primary-source:verify-license': { name: 'Alice Goodprovider', npi: '1234567893' },
  'comms-outreach:send-outreach': { channel: 'sms', consumerLocalTime: '13:30', priorContacts7d: 2, hasPriorExpressConsent: true },
  'carrier-vet:vet-carrier': { dotNumber: '123456', authorityStatus: 'active', insuranceOnFile: true, safetyRating: 'Satisfactory' },
  'um-criteria:check-criteria': { service: '72148', icd10: 'M54.5', priorConservativeTherapyWeeks: 8 },
  'sar-filing:file-sar': { bsaOfficerApproved: true, subject: { name: 'Test Subject' }, suspiciousActivity: { type: 'structuring', amountUsd: 25000, dateRange: '2026-01' }, filingInstitution: { name: 'Demo Bank' } },
  'hs-classify:classify-hs': { description: 'cotton knit t-shirt' },
  'itgc-test:run-test': { controlType: 'logical-access', evidence: { terminatedUsersWithAccess: 0, sharedAdminAccounts: 0, mfaEnabled: true, accessReviewDate: '2026-05-01' } },
  'meddra-code:code-term': { verbatim: 'bad headache' },
  'customs-entry:file-entry': { importerOfRecord: 'Demo Importer LLC', hsLines: [{ hsCode: '6109.10.00', value: 12000, qty: 1000, country: 'CN' }] },
  'safety-report:submit-e2b': { caseId: 'CASE-DEMO-1', patient: { age: 47, sex: 'F' }, drug: { name: 'DemoDrug', indication: 'hypertension' }, reaction: { pt: 'Anaphylactic reaction', soc: 'Immune system disorders', seriousness: 'life-threatening' } },
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
export async function runFlow(flow, { mode = 'stub', payload = {}, stopAtGate = true, startAt = 0, approvedGates = [] } = {}) {
  const steps = flow.steps || [];
  const approved = new Set(approvedGates);
  const trace = {
    vertical: flow.vertical, mode, status: 'completed', pausedAt: null, pausedAtIndex: null,
    owner: flow.owner || null, validation: validateFlow(flow), steps: [],
  };

  for (let i = startAt; i < steps.length; i++) {
    const s = steps[i];

    if (s.gate) {
      // A human checkpoint. If a named human has already signed it, record it as approved and roll
      // on; otherwise pause here (the durable run waits in the inbox until someone approves).
      if (approved.has(s.gate)) {
        trace.steps.push({ i, does: s.does, human: s.human, gate: s.gate, status: 'approved' });
        continue;
      }
      trace.steps.push({ i, does: s.does, human: s.human, gate: s.gate, status: 'awaiting-human' });
      if (stopAtGate) { trace.status = 'paused-at-gate'; trace.pausedAt = s.gate; trace.pausedAtIndex = i; break; }
      continue;
    }

    // "The permission was the wound": an irreversible action runs ONLY after its protecting gate is signed.
    const blast = s.blastRadius || (s.reversible === false ? 'high' : 'low');
    if (s.reversible === false) {
      const pg = protectingGate(steps, i);
      if (!pg) {
        trace.steps.push({ i, does: s.does, agent: s.agent, status: 'blocked-unsafe', blastRadius: blast,
          note: 'irreversible action with no prior human checkpoint — refused' });
        trace.unsafe = true;
        continue;
      }
      if (!approved.has(pg)) {
        trace.steps.push({ i, does: s.does, agent: s.agent, status: 'gated', blastRadius: blast,
          note: `irreversible — requires human approval at ${pg} before it runs` });
        continue;
      }
      // protecting gate approved → execute the write below.
    }

    const toolCalls = [];
    for (const t of s.tools || []) {
      const op = defaultOp(t);
      if (!op) { toolCalls.push({ connector: t, op: null, ok: false, error: 'unknown connector' }); continue; }
      const r = await call(t, op, { ...DEMO_INPUTS[`${t}:${op}`], ...payload }, { mode });
      toolCalls.push({ connector: t, op, ok: !!r.ok, mode: r.mode, error: r.error, signal: riskSignal(r) });
    }
    trace.steps.push({ i, does: s.does, agent: s.agent, status: 'done', blastRadius: blast, toolCalls });
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
    owner: trace.owner, stepsRun: done, toolCalls: calls.length, toolCallsOk: okCalls,
    pausedAt: trace.pausedAt,
    blocked: trace.steps.filter((s) => s.status === 'blocked-unsafe').length,
    irreversible: trace.steps.filter((s) => s.status === 'gated').length,
    valid: trace.validation ? trace.validation.ok : undefined,
  };
}

/** Human-readable run report. */
export function formatRun(trace) {
  const out = [`=== Run: ${trace.vertical} autopilot (${trace.mode}) ===`];
  if (trace.owner) out.push(`  accountable owner: ${trace.owner}`);
  for (const s of trace.steps) {
    if (s.gate) { out.push(`  🧑‍⚖️ ${s.i + 1}. ${s.does}  → PAUSE · ${s.human} (${s.gate})`); continue; }
    if (s.status === 'blocked-unsafe') { out.push(`  ⛔ ${s.i + 1}. ${s.does}  [${s.agent}] · REFUSED (irreversible, no checkpoint)`); continue; }
    if (s.status === 'gated') { out.push(`  ⏸️ ${s.i + 1}. ${s.does}  [${s.agent}] · awaits approval (irreversible)`); continue; }
    const tools = (s.toolCalls || []).map((c) => `${c.connector}:${c.op}${c.ok ? '✓' : '✗'}`).join(' ');
    const tag = s.blastRadius && s.blastRadius !== 'low' ? ` ⚠️${s.blastRadius}` : '';
    out.push(`  🤖 ${s.i + 1}. ${s.does}  [${s.agent}]${tag}${tools ? ' · ' + tools : ''}`);
  }
  out.push(`\n  status: ${trace.status}${trace.pausedAt ? ` (awaiting human at ${trace.pausedAt})` : ''}`);
  if (trace.validation && !trace.validation.ok) {
    out.push(`  ⚠️ flow invariant violations: ${trace.validation.violations.map((v) => v.type).join(', ')}`);
  }
  return out.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vertical = process.argv[2];
  const live = process.argv.includes('--live');
  const full = process.argv.includes('--full'); // don't stop at the gate
  const validate = process.argv.includes('--validate');
  if (!vertical) { console.error('usage: flow-runner.mjs <vertical> [--live] [--full] [--validate]'); process.exit(2); }
  if (validate) {
    const v = validateFlow(loadFlow(vertical));
    console.log(`${vertical}: ${v.ok ? '✓ safe — every irreversible step is gated and an owner is named' : '⚠️ ' + JSON.stringify(v.violations)}`);
    process.exit(v.ok ? 0 : 1);
  }
  runFlow(loadFlow(vertical), { mode: live ? 'live' : 'stub', stopAtGate: !full })
    .then((t) => { console.log(formatRun(t)); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
