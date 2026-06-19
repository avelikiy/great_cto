// tests/lib/gate-plan.test.mjs — the runtime composition that the orchestrator calls
// at the start of a change: classify(diff) → effectiveGates(archetype, size, tier).
//
// Run: node --test tests/lib/gate-plan.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseProject, planGates } from '../../scripts/lib/gate-plan.mjs';

// ── parseProject ──────────────────────────────────────────────────────────────

test('parseProject reads archetype + project_size', () => {
  const p = parseProject('# proj\narchetype: fintech\nproject_size: large\n');
  assert.equal(p.archetype, 'fintech');
  assert.equal(p.size, 'large');
});

test('parseProject falls back to primary + defaults size to medium', () => {
  const p = parseProject('primary: web-service\n');
  assert.equal(p.archetype, 'web-service');
  assert.equal(p.size, 'medium');
});

// ── planGates: classify → effectiveGates ──────────────────────────────────────

test('docs-only change on a plain archetype → T0, zero gates', () => {
  const r = planGates({ archetype: 'web-service', size: 'medium', changedFiles: ['README.md'] });
  assert.equal(r.tier, 'T0');
  assert.deepEqual(r.gates, []);
});

test('source feature on a plain archetype → T1, [plan]', () => {
  const r = planGates({ archetype: 'web-service', size: 'medium', changedFiles: ['src/app.ts'] });
  assert.equal(r.tier, 'T1');
  assert.deepEqual(r.gates, ['plan']);
});

test('migration on a regulated archetype → T2, full gates', () => {
  const r = planGates({ archetype: 'fintech', size: 'medium', changedFiles: ['migrations/1.sql'] });
  assert.equal(r.tier, 'T2');
  assert.ok(r.gates.includes('security') && r.gates.includes('compliance') && r.gates.includes('ship'));
});

test('a fix on a regulated archetype still floors to security+compliance+ship', () => {
  const r = planGates({ archetype: 'fintech', size: 'medium', changedFiles: ['docs/x.md'] });
  assert.equal(r.tier, 'T0');
  assert.deepEqual(r.gates, ['security', 'ship', 'compliance']);
});

test('reasons + escalation are surfaced for the audit log', () => {
  const r = planGates({ archetype: 'fintech', size: 'medium', changedFiles: ['migrations/2.sql'], labels: ['tier:t0'] });
  assert.equal(r.tier, 'T2');
  assert.equal(r.escalatedFromLabel, 'T0');
  assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0);
});

test('unknown archetype is handled (empty baseline → no gates below T2)', () => {
  const r = planGates({ archetype: 'greenfield', size: 'medium', changedFiles: ['docs/x.md'] });
  assert.equal(r.tier, 'T0');
  assert.deepEqual(r.gates, []);
});
