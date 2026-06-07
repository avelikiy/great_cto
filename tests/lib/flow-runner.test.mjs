// tests/lib/flow-runner.test.mjs — connector runtime + flow execution (Phase 4)
//
// Run: node --test tests/lib/flow-runner.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { call, hasLiveAdapter, stubCall } from '../../scripts/lib/connectors.mjs';
import { loadFlow, runFlow, summarizeRun, formatRun, validateFlow } from '../../scripts/lib/flow-runner.mjs';

// ── connector runtime (call dispatcher) ───────────────────────────────────────

test('call: stub mode returns deterministic mock', async () => {
  const r = await call('ehr-fhir', 'fetch-note', { id: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'stub');
  assert.equal(r.data._stub, true);
});

test('call: stub is deterministic (same input → same output)', async () => {
  const a = await call('code-sets', 'lookup-code', { q: 'x' });
  const b = await call('code-sets', 'lookup-code', { q: 'x' });
  assert.deepEqual(a.data, b.data);
});

test('hasLiveAdapter: all six verticals have a live connector; ocr is not yet', () => {
  for (const id of ['ehr-fhir', 'code-sets', 'clearinghouse', 'ncci-mue', 'e-signature', 'bank-feed',
    'sanctions-screen', 'rmm', 'tax-engine']) assert.equal(hasLiveAdapter(id), true, id);
  assert.equal(hasLiveAdapter('ocr'), false);
});

test('sanctions live adapter: hard-blocks a sanctioned party, clears a benign one', async () => {
  const m = await import('../../scripts/lib/connectors/sanctions.mjs');
  const hit = await m.call('screen-party', { name: 'Wagner Group LLC' });
  assert.equal(hit.data.hit, true);
  assert.match(hit.data.decision, /HARD BLOCK/);
  const clean = await m.call('screen-party', { name: 'Acme Office Supplies' });
  assert.equal(clean.data.hit, false);
});

test('rmm live adapter: stage-change produces a canary→fleet staged plan with rollback', async () => {
  const m = await import('../../scripts/lib/connectors/rmm.mjs');
  const r = await m.call('stage-change', { change: { name: 'KB5001' } });
  assert.deepEqual(r.data.stages.map((s) => s.ring), ['canary', 'early', 'broad', 'fleet']);
  assert.equal(r.data.stages[0].targetPct, 1);
  assert.match(r.data.rollback, /tested rollback/);
});

test('tax-engine live adapter: computes 2025 federal tax + classifies a position', async () => {
  const m = await import('../../scripts/lib/connectors/tax-engine.mjs');
  const ret = await m.call('compute-return', { income: 85000, filingStatus: 'single', withheld: 12000 });
  assert.equal(ret.data.taxableIncome, 70000);   // 85000 − 15000 std deduction
  assert.equal(ret.data.tax, 10314);             // real 2025 single brackets
  const pos = await m.call('classify-position', { support: 0.1 });
  assert.equal(pos.data.escalate, true);
});

test('bank-feed live adapter: fetches a feed and classifies each txn to a GL account', async () => {
  const m = await import('../../scripts/lib/connectors/bank-feed.mjs');
  assert.equal(m.classify('GUSTO PAYROLL', 12850).account, '6000 · Payroll expense');
  assert.equal(m.classify('STRIPE PAYOUT', -4200).side, 'credit');
  const r = await m.call('fetch-transactions', {});
  assert.equal(r.ok, true);
  assert.ok(r.data.count >= 1);
  assert.ok(r.data.transactions.every((t) => t.account && t.side));
});

test('e-signature live adapter: ESIGN/UETA exclusion + envelope build', async () => {
  const m = await import('../../scripts/lib/connectors/e-signature.mjs');
  assert.equal(m.checkExcluded('Last Will and Testament').excluded, true);
  assert.equal(m.checkExcluded('mutual NDA').excluded, false);
  // refuses to e-sign an excluded document
  const will = await m.call('send-for-signature', { docType: 'will' });
  assert.equal(will.ok, false);
  assert.equal(will.blocked, true);
  // prepares a real DocuSign envelope for a permitted document
  const nda = await m.call('send-for-signature', { docType: 'mutual NDA' });
  assert.equal(nda.ok, true);
  assert.match(nda.data.envelope.emailSubject, /mutual NDA/);
  assert.ok(nda.data.envelope.recipients.signers.length >= 1);
});

test('ncci live adapter: detects unbundling, modifier edits, and MUE excess', async () => {
  const m = await import('../../scripts/lib/connectors/ncci.mjs');
  const bundled = await m.call('check-ptp', { code1: '80053', code2: '80048' });
  assert.equal(bundled.data.edit, true);
  assert.equal(bundled.data.modifierIndicator, 0);
  const mod = await m.call('check-ptp', { code1: '99213', code2: '36415' });
  assert.equal(mod.data.allowedWithModifier, true);
  const clean = await m.call('check-ptp', { code1: '99213', code2: '99214' });
  assert.equal(clean.data.edit, false);
  const mue = await m.call('check-mue', { code: '99213', units: 3 });
  assert.equal(mue.data.exceeds, true);
  assert.equal(mue.data.mue, 1);
});

test('clearinghouse: build837 produces a structurally valid X12 837P claim', async () => {
  const { build837 } = await import('../../scripts/lib/connectors/clearinghouse.mjs');
  const { claim, segments, controlNumber, totalCharge } = build837({ lines: [{ cpt: '99213', charge: '125.00', units: '1', dxPointer: '1' }] });
  assert.match(claim, /^ISA\*/);                 // interchange header
  assert.match(claim, /~\nGS\*HC\*/);            // functional group
  assert.match(claim, /\nST\*837\*/);            // 837 transaction
  assert.match(claim, /\nCLM\*/);                // claim segment
  assert.match(claim, /\nHI\*ABK:/);             // principal diagnosis
  assert.match(claim, /\nSV1\*HC:99213\*/);      // service line w/ CPT
  assert.match(claim, /\nIEA\*1\*/);             // interchange trailer
  assert.ok(segments >= 20);
  assert.equal(totalCharge, '125.00');
  assert.equal(controlNumber.length, 9);
});

test('clearinghouse: submit-837 live generates a claim without a real endpoint', async () => {
  const r = await call('clearinghouse', 'submit-837', {}, { mode: 'live' });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'live');
  assert.equal(r.submitted, false);
  assert.match(r.data.claim, /ST\*837\*/);
  assert.match(r.note, /GREATCTO_CLEARINGHOUSE_URL|clearinghouse/i);
});

test('call: live mode on a connector WITHOUT a live adapter falls back to stub', async () => {
  const r = await call('ocr', 'extract-text', {}, { mode: 'live' });
  assert.equal(r.mode, 'stub');
  assert.match(r.note, /no live adapter/);
});

test('code-sets live adapter: capabilities + cpt is gracefully unsupported', async () => {
  const m = await import('../../scripts/lib/connectors/codesets.mjs');
  assert.deepEqual(m.capabilities, ['lookup-code', 'validate-code']);
  const cpt = await m.call('lookup-code', { q: 'x', system: 'cpt' });
  assert.equal(cpt.ok, false);
  assert.match(cpt.error, /AMA-licensed/);
});

test('call: unknown op fails cleanly in stub', async () => {
  const r = await call('ehr-fhir', 'no-such-op');
  assert.equal(r.ok, false);
});

test('stubCall mode is always stub', () => {
  assert.equal(stubCall('rmm', 'stage-change').mode, 'stub');
});

// ── flow execution (stub mode — deterministic, no network) ──────────────────────

test('runFlow: rcm runs autonomous steps and PAUSES at the human gate', async () => {
  const trace = await runFlow(loadFlow('rcm'), { mode: 'stub' });
  assert.equal(trace.vertical, 'rcm');
  assert.equal(trace.status, 'paused-at-gate');
  assert.equal(trace.pausedAt, 'gate:coding-signoff');
  // steps before the gate ran; the gate is the last recorded step
  const last = trace.steps[trace.steps.length - 1];
  assert.equal(last.gate, 'gate:coding-signoff');
  assert.equal(last.status, 'awaiting-human');
  // every prior step is a completed agent step with tool calls
  for (const s of trace.steps.slice(0, -1)) {
    assert.equal(s.status, 'done');
    assert.ok(s.agent);
  }
});

test('runFlow: tool calls succeed in stub mode', async () => {
  const trace = await runFlow(loadFlow('rcm'), { mode: 'stub' });
  const sum = summarizeRun(trace);
  assert.ok(sum.toolCalls > 0);
  assert.equal(sum.toolCallsOk, sum.toolCalls); // all stub calls ok
});

test('runFlow: stopAtGate=false runs the whole flow, recording gates as awaiting-human', async () => {
  const trace = await runFlow(loadFlow('rcm'), { mode: 'stub', stopAtGate: false });
  assert.equal(trace.status, 'completed');
  assert.equal(trace.steps.length, loadFlow('rcm').steps.length);
  assert.ok(trace.steps.some((s) => s.status === 'awaiting-human'));
});

test('runFlow: every shipped vertical flow runs in stub mode and pauses at its gate', async () => {
  for (const v of ['rcm', 'legaltech', 'procurement', 'accounting', 'msp', 'tax', 'prior-auth', 'aml', 'soc', 'insurance', 'mortgage', 'title', 'credentialing', 'collections', 'freight', 'cro']) {
    const trace = await runFlow(loadFlow(v), { mode: 'stub' });
    assert.equal(trace.status, 'paused-at-gate', `${v} should pause at a human gate`);
    assert.ok(trace.pausedAt, `${v} should name the gate it paused at`);
  }
});

test('runFlow: a gate-only flow pauses immediately', async () => {
  const flow = { vertical: 'demo', steps: [{ does: 'sign', human: 'a person', gate: 'gate:demo' }] };
  const trace = await runFlow(flow, { mode: 'stub' });
  assert.equal(trace.status, 'paused-at-gate');
  assert.equal(trace.steps.length, 1);
});

test('runFlow: a no-gate flow completes', async () => {
  const flow = { vertical: 'demo', steps: [{ does: 'do', agent: 'x', tools: ['ocr'] }] };
  const trace = await runFlow(flow, { mode: 'stub' });
  assert.equal(trace.status, 'completed');
});

// ── "the permission was the wound" invariant (irreversible ⟹ gated; named owner) ─────

test('validateFlow: every shipped vertical is safe — irreversible steps are gated + an owner is named', () => {
  for (const v of ['rcm', 'legaltech', 'procurement', 'accounting', 'msp', 'tax', 'prior-auth', 'aml', 'soc', 'insurance', 'mortgage', 'title', 'credentialing', 'collections', 'freight', 'cro']) {
    const r = validateFlow(loadFlow(v));
    assert.equal(r.ok, true, `${v} violations: ${JSON.stringify(r.violations)}`);
  }
});

test('validateFlow: flags an irreversible step that runs before any human checkpoint', () => {
  const flow = { vertical: 'demo', owner: 'X', steps: [
    { does: 'wire the money', agent: 'pay', reversible: false, blastRadius: 'high', tools: [] },
    { does: 'sign', human: 'a person', gate: 'gate:x' },
  ] };
  const r = validateFlow(flow);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].type, 'irreversible-without-gate');
  assert.equal(r.violations[0].step, 0);
});

test('validateFlow: an irreversible step AFTER a gate is allowed', () => {
  const flow = { vertical: 'demo', owner: 'X', steps: [
    { does: 'sign', human: 'a person', gate: 'gate:x' },
    { does: 'wire the money', agent: 'pay', reversible: false, blastRadius: 'high', tools: [] },
  ] };
  assert.equal(validateFlow(flow).ok, true);
});

test('validateFlow: a flow with no owner is a violation (accountability)', () => {
  const flow = { vertical: 'demo', steps: [{ does: 'read', agent: 'r', tools: [] }] };
  const r = validateFlow(flow);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.type === 'no-owner'));
});

test('runFlow: REFUSES to autonomously run an irreversible step with no prior checkpoint', async () => {
  const flow = { vertical: 'demo', owner: 'X', steps: [
    { does: 'delete prod', agent: 'wipe', reversible: false, blastRadius: 'high', tools: ['ocr'] },
  ] };
  const trace = await runFlow(flow, { mode: 'stub', stopAtGate: false });
  const step = trace.steps[0];
  assert.equal(step.status, 'blocked-unsafe');
  assert.equal(step.toolCalls, undefined);   // connectors never fired
  assert.equal(trace.unsafe, true);
});

test('runFlow: an irreversible step is NOT auto-fired in a whole-flow dry-run (awaits approval)', async () => {
  const trace = await runFlow(loadFlow('rcm'), { mode: 'stub', stopAtGate: false });
  const submit = trace.steps.find((s) => /submit the 837/.test(s.does));
  assert.equal(submit.status, 'gated');
  assert.equal(submit.toolCalls, undefined); // the clearinghouse connector did not fire without approval
  // a reversible follow-on step still runs
  assert.ok(trace.steps.some((s) => s.status === 'done'));
});

test('runFlow: exposes the accountable owner + validation on the trace', async () => {
  const trace = await runFlow(loadFlow('procurement'), { mode: 'stub' });
  assert.equal(trace.owner, 'Head of Finance');
  assert.equal(trace.validation.ok, true);
});

// ── reporting ──────────────────────────────────────────────────────────────────

test('summarizeRun: counts steps + tool calls', async () => {
  const sum = summarizeRun(await runFlow(loadFlow('rcm'), { mode: 'stub' }));
  assert.equal(sum.vertical, 'rcm');
  assert.equal(sum.status, 'paused-at-gate');
  assert.ok(sum.stepsRun >= 1);
});

test('formatRun: shows the pause + the human role', async () => {
  const s = formatRun(await runFlow(loadFlow('rcm'), { mode: 'stub' }));
  assert.match(s, /PAUSE/);
  assert.match(s, /coding-signoff/);
  assert.match(s, /🤖/);
});
