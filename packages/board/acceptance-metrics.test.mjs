// Acceptance-oriented metrics: cost per gate-APPROVED change and rework rounds,
// derived from verdict logs. The "verified acceptance" shift — measure what a
// gate accepted and how often work bounced, not raw throughput.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceMetrics } from './lib/metrics.mjs';

const V = (verdict, over = {}) => ({ ts: '2026-07-19T10:00:00Z', agent: 'code-reviewer', verdict, ...over });

test('cost_per_accepted = window cost / count of APPROVED verdicts', () => {
  const m = acceptanceMetrics([V('APPROVED'), V('APPROVED'), V('DONE')], 10);
  assert.equal(m.accepted, 2);
  assert.equal(m.cost_per_accepted, 5); // 10 / 2
});

test('rework_rounds counts sent-back review outcomes', () => {
  const m = acceptanceMetrics([V('CHANGES'), V('REJECTED'), V('FAIL'), V('BLOCKED'), V('APPROVED')], 8);
  assert.equal(m.rework_rounds, 4);
});

test('DONE / PASS are not rework and not (by themselves) an accepted change', () => {
  // Only an explicit gate APPROVED counts as an accepted change here — DONE is a
  // stage completion, not a human/gate acceptance.
  const m = acceptanceMetrics([V('DONE'), V('PASS')], 5);
  assert.equal(m.accepted, 0);
  assert.equal(m.rework_rounds, 0);
});

test('no accepted change → cost_per_accepted is null, never a divide-by-zero number', () => {
  const m = acceptanceMetrics([V('CHANGES'), V('DONE')], 12);
  assert.equal(m.accepted, 0);
  assert.equal(m.cost_per_accepted, null, 'null, not Infinity or 0');
});

test('null window cost → cost_per_accepted null even with approvals', () => {
  const m = acceptanceMetrics([V('APPROVED')], null);
  assert.equal(m.accepted, 1);
  assert.equal(m.cost_per_accepted, null);
});

test('rounds to cents', () => {
  const m = acceptanceMetrics([V('APPROVED'), V('APPROVED'), V('APPROVED')], 10);
  assert.equal(m.cost_per_accepted, 3.33); // 10/3
});

test('CHANGES_REQUESTED and REJECT variants all count as rework', () => {
  const m = acceptanceMetrics([V('CHANGES_REQUESTED'), V('REJECT'), V('FAILED')], null);
  assert.equal(m.rework_rounds, 3);
});

test('empty input is safe', () => {
  const m = acceptanceMetrics([], 5);
  assert.deepEqual(m, { accepted: 0, cost_per_accepted: null, rework_rounds: 0 });
});
