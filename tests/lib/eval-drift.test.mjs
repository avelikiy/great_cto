// tests/lib/eval-drift.test.mjs — DEEPEN W3.6 eval-drift detection + noise gate.
// Run: node --test tests/lib/eval-drift.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvalHistory, recentNoise } from '../../scripts/lib/eval-drift.mjs';

test('parseEvalHistory: keeps {eval,rate,stddev}, skips junk', () => {
  const text = '{"eval":"A","rate":0.9,"stddev":0.05}\n{bad}\n{"eval":"B","rate":0.5}\n{"rate":1}\n';
  const rows = parseEvalHistory(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eval, 'A');
  assert.equal(rows[1].stddev, 0, 'missing stddev → 0');
});

test('recentNoise: averages the LAST stddev per eval', () => {
  const rows = [
    { eval: 'A', rate: 0.9, stddev: 0.4 },
    { eval: 'A', rate: 0.9, stddev: 0.1 }, // last for A wins
    { eval: 'B', rate: 0.5, stddev: 0.3 },
  ];
  // (0.1 + 0.3) / 2 = 0.2
  assert.ok(Math.abs(recentNoise(rows) - 0.2) < 1e-9);
});

test('recentNoise: empty → 0', () => {
  assert.equal(recentNoise([]), 0);
});
