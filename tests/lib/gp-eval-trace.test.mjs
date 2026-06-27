// tests/lib/gp-eval-trace.test.mjs — DEEPEN W2.4 crystallize→eval delta trace.
// Run: node --test tests/lib/gp-eval-trace.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta, stampTrace } from '../../scripts/lib/gp-eval-trace.mjs';

const row = (eval_, rate, stddev = 0, agent = 'security-officer') => ({ eval: eval_, rate, stddev, agent });

test('computeDelta: clear improvement beyond noise → confident improvement', () => {
  const base = [row('E1', 0.6, 0.02)];
  const cand = [row('E1', 0.9, 0.02)];
  const d = computeDelta(base, cand, 'security-officer');
  assert.equal(d.confident, true);
  assert.equal(d.direction, 'improvement');
  assert.ok(d.meanDelta > 0.25);
});

test('computeDelta: drop within the noise band → noisy, NOT a regression', () => {
  const base = [row('E1', 0.9, 0.2)];
  const cand = [row('E1', 0.78, 0.2)]; // Δ -0.12, band 0.4 → noise
  const d = computeDelta(base, cand, 'security-officer');
  assert.equal(d.confident, false);
  assert.equal(d.direction, 'noisy');
});

test('computeDelta: confident regression when drop exceeds noise', () => {
  const base = [row('E1', 0.9, 0.02)];
  const cand = [row('E1', 0.6, 0.02)];
  const d = computeDelta(base, cand, 'security-officer');
  assert.equal(d.direction, 'regression');
  assert.equal(d.confident, true);
});

test('computeDelta: only compares shared evals; ignores agent mismatch', () => {
  const base = [row('E1', 0.8), row('E2', 0.5)];
  const cand = [row('E1', 0.8)]; // E2 missing → not compared
  const d = computeDelta(base, cand, 'security-officer');
  assert.equal(d.perEval.length, 1);
  assert.equal(d.perEval[0].eval, 'E1');
});

// ── stampTrace ────────────────────────────────────────────────────────────────

const GP = `---
id: GP-0001
status: active
hits: 1
mttr_reduction: 40%
---

### GP-0001 — Demo
body here
`;

test('stampTrace: sets eval_delta + eval_confidence frontmatter and a trace line', () => {
  const d = computeDelta([row('E1', 0.6, 0.02)], [row('E1', 0.9, 0.02)], 'security-officer');
  const out = stampTrace(GP, { ke: 'KE-12', commit: 'abc123', delta: d, ts: '2026-06-27T00:00:00Z' });
  assert.match(out, /^eval_delta: \+30\.0% \(±4\.0%, improvement\)$/m);
  assert.match(out, /^eval_confidence: improvement$/m);
  assert.match(out, /^## Eval trace$/m);
  assert.match(out, /KE KE-12 · commit abc123/);
});

test('stampTrace: a noisy delta is recorded as "noisy", never "improvement"', () => {
  const d = computeDelta([row('E1', 0.9, 0.2)], [row('E1', 0.95, 0.2)], 'security-officer');
  const out = stampTrace(GP, { ke: 'KE-1', commit: 'sha', delta: d, ts: '2026-06-27T00:00:00Z' });
  assert.match(out, /^eval_confidence: noisy$/m);
  assert.doesNotMatch(out, /eval_confidence: improvement/m);
});

test('stampTrace: second stamp replaces frontmatter, appends to the trace log', () => {
  const d1 = computeDelta([row('E1', 0.6, 0.02)], [row('E1', 0.9, 0.02)], 'security-officer');
  const once = stampTrace(GP, { ke: 'KE-1', commit: 'aaa', delta: d1, ts: '2026-06-27T00:00:00Z' });
  const d2 = computeDelta([row('E1', 0.9, 0.02)], [row('E1', 0.95, 0.02)], 'security-officer');
  const twice = stampTrace(once, { ke: 'KE-2', commit: 'bbb', delta: d2, ts: '2026-06-28T00:00:00Z' });
  // one eval_delta line (replaced), two trace entries (appended)
  assert.equal((twice.match(/^eval_delta:/mg) || []).length, 1);
  assert.equal((twice.match(/· commit /g) || []).length, 2);
});
