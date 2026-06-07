// tests/lib/flow-runner.test.mjs — connector runtime + flow execution (Phase 4)
//
// Run: node --test tests/lib/flow-runner.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { call, hasLiveAdapter, stubCall } from '../../scripts/lib/connectors.mjs';
import { loadFlow, runFlow, summarizeRun, formatRun } from '../../scripts/lib/flow-runner.mjs';

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

test('hasLiveAdapter: ehr-fhir has one, code-sets does not', () => {
  assert.equal(hasLiveAdapter('ehr-fhir'), true);
  assert.equal(hasLiveAdapter('code-sets'), false);
});

test('call: live mode on a connector WITHOUT a live adapter falls back to stub', async () => {
  const r = await call('code-sets', 'lookup-code', {}, { mode: 'live' });
  assert.equal(r.mode, 'stub');
  assert.match(r.note, /no live adapter/);
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
  for (const v of ['rcm', 'legaltech', 'procurement', 'accounting', 'msp', 'tax']) {
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
