// tests/lib/autopilot-gate.test.mjs — unit tests for the service-autopilot release gate
//
// Run: node --test tests/lib/autopilot-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateConfig, meetsAccuracySLA, checkDecisionLog, savingsRatio,
} from '../../scripts/lib/autopilot-gate.mjs';

const GOOD = {
  name: 'nda-autopilot',
  vertical: 'legaltech',
  judgment: { confidenceThreshold: 0.9, escalateTo: 'licensed attorney' },
  accuracySLA: [{ metric: 'clause_accuracy', min: 0.98 }, { metric: 'recall', min: 0.95 }],
  auditTrail: { enabled: true, fields: ['who', 'what', 'inputs', 'confidence', 'timestamp'] },
  unitEconomics: { costPerOutcomeUsd: 4, humanBaselineUsd: 400 },
  reversible: true,
};

// ── validateConfig ──────────────────────────────────────────────────────────────

test('validateConfig: well-formed manifest is valid', () => {
  assert.equal(validateConfig(GOOD).valid, true);
});

test('validateConfig: confidenceThreshold must be in (0,1)', () => {
  for (const t of [0, 1, 1.5, -0.1, 'x']) {
    const r = validateConfig({ ...GOOD, judgment: { confidenceThreshold: t, escalateTo: 'x' } });
    assert.equal(r.valid, false, `threshold ${t} should be invalid`);
    assert.match(r.errors.join(' '), /confidenceThreshold/);
  }
});

test('validateConfig: missing escalateTo fails', () => {
  const r = validateConfig({ ...GOOD, judgment: { confidenceThreshold: 0.9 } });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /escalateTo/);
});

test('validateConfig: empty accuracySLA fails (eval is the contract)', () => {
  assert.equal(validateConfig({ ...GOOD, accuracySLA: [] }).valid, false);
});

test('validateConfig: SLA min out of range fails', () => {
  const r = validateConfig({ ...GOOD, accuracySLA: [{ metric: 'x', min: 1.4 }] });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /min must be 0\.\.1/);
});

test('validateConfig: auditTrail must be enabled with who/what/confidence', () => {
  assert.equal(validateConfig({ ...GOOD, auditTrail: { enabled: false } }).valid, false);
  const r = validateConfig({ ...GOOD, auditTrail: { enabled: true, fields: ['who'] } });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /missing "what"|missing "confidence"/);
});

test('validateConfig: unitEconomics required (price per outcome)', () => {
  assert.equal(validateConfig({ ...GOOD, unitEconomics: {} }).valid, false);
});

test('validateConfig: irreversible without gatedActions fails', () => {
  const r = validateConfig({ ...GOOD, reversible: false });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /gatedActions/);
});

test('validateConfig: reversible via gatedActions list is accepted', () => {
  const r = validateConfig({ ...GOOD, reversible: { gatedActions: ['file_with_court'] } });
  assert.equal(r.valid, true);
});

// ── meetsAccuracySLA ──────────────────────────────────────────────────────────────

test('meetsAccuracySLA: all metrics clear the floor → ok', () => {
  const r = meetsAccuracySLA(GOOD, { clause_accuracy: 0.99, recall: 0.96 });
  assert.equal(r.ok, true);
});

test('meetsAccuracySLA: a metric below floor → breach', () => {
  const r = meetsAccuracySLA(GOOD, { clause_accuracy: 0.97, recall: 0.96 });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /clause_accuracy/);
});

test('meetsAccuracySLA: missing measurement counts as a failure', () => {
  const r = meetsAccuracySLA(GOOD, { clause_accuracy: 0.99 });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(' '), /recall: no measurement/);
});

// ── checkDecisionLog ──────────────────────────────────────────────────────────────

test('checkDecisionLog: clean log passes', () => {
  const rows = [
    { id: 'd1', autonomous: true, confidence: 0.95, logged: true, reversible: true },
    { id: 'd2', autonomous: false, confidence: 0.2, logged: false }, // human action, not checked
  ];
  assert.equal(checkDecisionLog(rows, GOOD).ok, true);
});

test('checkDecisionLog: unlogged autonomous action → violation', () => {
  const r = checkDecisionLog([{ id: 'd1', autonomous: true, confidence: 0.95, logged: false, reversible: true }], GOOD);
  assert.equal(r.ok, false);
  assert.match(r.violations[0], /not logged/);
});

test('checkDecisionLog: low-confidence autonomous action without escalation → violation', () => {
  const r = checkDecisionLog([{ id: 'd1', autonomous: true, confidence: 0.5, logged: true, reversible: true }], GOOD);
  assert.equal(r.ok, false);
  assert.match(r.violations[0], /without escalation/);
});

test('checkDecisionLog: low-confidence but escalated → ok', () => {
  const r = checkDecisionLog([{ id: 'd1', autonomous: true, confidence: 0.5, logged: true, reversible: true, escalated: true }], GOOD);
  assert.equal(r.ok, true);
});

test('checkDecisionLog: irreversible autonomous action not gated → violation', () => {
  const r = checkDecisionLog([{ id: 'd1', autonomous: true, confidence: 0.99, logged: true, reversible: false, gated: false }], GOOD);
  assert.equal(r.ok, false);
  assert.match(r.violations[0], /irreversible/);
});

test('checkDecisionLog: irreversible but gated → ok', () => {
  const r = checkDecisionLog([{ id: 'd1', autonomous: true, confidence: 0.99, logged: true, reversible: false, gated: true }], GOOD);
  assert.equal(r.ok, true);
});

// ── savingsRatio ──────────────────────────────────────────────────────────────

test('savingsRatio: computes cost reduction vs human baseline', () => {
  assert.equal(savingsRatio(GOOD), 1 - 4 / 400);
});

test('savingsRatio: null when no baseline', () => {
  assert.equal(savingsRatio({ unitEconomics: { costPerOutcomeUsd: 4 } }), null);
});
