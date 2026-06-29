// tests/lib/quality.test.mjs — QUALITY-DEEPEN #5 unified quality verdict.
// Run: node --test tests/lib/quality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedScore, assess } from '../../scripts/lib/quality.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('combinedScore: ceiling weighted most; all 100 → 100', () => {
  assert.equal(combinedScore({ floor: 100, ceiling: 100, contracts: 100 }).overall, 100);
});

test('combinedScore: blend with weights 30/50/20', () => {
  // 80*.3 + 100*.5 + 50*.2 = 24+50+10 = 84
  assert.equal(combinedScore({ floor: 80, ceiling: 100, contracts: 50 }).overall, 84);
});

test('combinedScore: contracts n/a → drop + renormalize floor/ceiling', () => {
  // floor 80 (w .375) + ceiling 100 (w .625) = 30 + 62.5 = 92.5 → 93 (rounded; .375/.625 weights)
  const r = combinedScore({ floor: 80, ceiling: 100, contracts: null });
  assert.ok(!('domain' in r.weights));
  assert.equal(r.overall, 93);
});

test('combinedScore: grade boundaries', () => {
  assert.equal(combinedScore({ floor: 0, ceiling: 0, contracts: 0 }).grade, 'F');
  assert.equal(combinedScore({ floor: 90, ceiling: 90, contracts: 90 }).grade, 'A');
});

test('assess: real codebase returns all three lenses + overall', () => {
  const r = assess(join(ROOT, 'packages', 'cli'));
  assert.ok(typeof r.floor === 'number' && typeof r.ceiling === 'number');
  assert.ok(r.overall >= 0 && r.overall <= 100);
  assert.ok(r.archetype);
});
