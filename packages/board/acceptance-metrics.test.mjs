// Acceptance-oriented metrics: cost per gate-APPROVED change and rework rounds,
// derived from verdict logs. The "verified acceptance" shift — measure what a
// gate accepted and how often work bounced, not raw throughput.
//
// Three counts, not one. A halting verdict (BLOCKED / FAIL / REJECTED) is either
// a pass the implementer can make (`need=implementer`), a question for a human
// (`need=decision`), or undeclared. Counting every halt as rework called a
// waiver request "rework", and REWORK itself — the token the dispatcher sends
// work back with — was not counted at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceMetrics } from './lib/metrics.mjs';

const V = (verdict, over = {}) => ({ ts: '2026-07-19T10:00:00Z', agent: 'code-reviewer', verdict, ...over });
const need = (n) => ({ meta: { need: n } });

test('cost_per_accepted = window cost / count of APPROVED verdicts', () => {
  const m = acceptanceMetrics([V('APPROVED'), V('APPROVED'), V('DONE')], 10);
  assert.equal(m.accepted, 2);
  assert.equal(m.cost_per_accepted, 5); // 10 / 2
});

test('REWORK is rework — it is the token work is actually sent back with', () => {
  const m = acceptanceMetrics([V('REWORK'), V('REWORK'), V('APPROVED')], 8);
  assert.equal(m.rework_rounds, 2);
});

test('a requested change is rework whatever it declares', () => {
  const m = acceptanceMetrics([V('CHANGES'), V('CHANGES_REQUESTED')], null);
  assert.equal(m.rework_rounds, 2);
  assert.equal(m.undeclared_blocks, 0);
});

test('a halt the implementer can fix is rework', () => {
  const m = acceptanceMetrics(
    [V('BLOCKED', need('implementer')), V('FAIL', need('implementer')), V('REJECTED', need('implementer'))], null);
  assert.equal(m.rework_rounds, 3);
  assert.equal(m.decisions, 0);
});

test('a halt that needs a human is a decision, not rework', () => {
  const m = acceptanceMetrics([V('BLOCKED', need('decision')), V('FAILED', need('decision'))], null);
  assert.equal(m.decisions, 2);
  assert.equal(m.rework_rounds, 0);
});

test('a halt that declares nothing is counted as undeclared — not rework, not a decision', () => {
  const m = acceptanceMetrics([V('BLOCKED'), V('REJECT'), V('FAIL', { meta: {} }), V('BLOCKED', need('maybe'))], null);
  assert.equal(m.undeclared_blocks, 4, 'an unknown need value is not a guess at one of the two');
  assert.equal(m.rework_rounds, 0);
  assert.equal(m.decisions, 0);
});

test('DONE / PASS are not rework and not (by themselves) an accepted change', () => {
  // Only an explicit gate APPROVED counts as an accepted change here — DONE is a
  // stage completion, not a human/gate acceptance.
  const m = acceptanceMetrics([V('DONE'), V('PASS')], 5);
  assert.equal(m.accepted, 0);
  assert.equal(m.rework_rounds, 0);
  assert.equal(m.undeclared_blocks, 0);
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

test('empty input is safe', () => {
  const m = acceptanceMetrics([], 5);
  assert.deepEqual(m, { accepted: 0, cost_per_accepted: null, rework_rounds: 0, decisions: 0, undeclared_blocks: 0 });
});
