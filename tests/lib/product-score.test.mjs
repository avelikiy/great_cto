// tests/lib/product-score.test.mjs — product quality scorer.
// Run: node --test tests/lib/product-score.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, scoreProduct, inspect } from '../../scripts/lib/product-score.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('RUBRIC weights sum to 100', () => {
  assert.equal(RUBRIC.reduce((a, d) => a + d.weight, 0), 100);
});

test('scoreProduct: all-perfect signals → 100 / grade A', () => {
  const perfect = Object.fromEntries(RUBRIC.map(d => [d.key, 1]));
  const r = scoreProduct(perfect);
  assert.equal(r.total, 100);
  assert.equal(r.grade, 'A');
});

test('scoreProduct: empty signals → 0 / grade F', () => {
  const r = scoreProduct({});
  assert.equal(r.total, 0);
  assert.equal(r.grade, 'F');
});

test('scoreProduct: weighted partials sum correctly', () => {
  // completeness 1 (20) + tests 0.5 (10) + security 1 (15) = 45
  const r = scoreProduct({ completeness: 1, tests: 0.5, security: 1 });
  assert.equal(r.total, 45);
});

test('scoreProduct: clamps out-of-range signals', () => {
  assert.equal(scoreProduct({ completeness: 5 }).breakdown.find(b => b.key === 'completeness').signal, 1);
  assert.equal(scoreProduct({ tests: -3 }).breakdown.find(b => b.key === 'tests').signal, 0);
});

test('scoreProduct: grade boundaries', () => {
  assert.equal(scoreProduct({ completeness: 1, tests: 1, security: 1, design_a11y: 1, observability: 1 }).total, 80); // B
  assert.equal(scoreProduct({ completeness: 1, tests: 1, security: 1, design_a11y: 1, observability: 1 }).grade, 'B');
});

test('inspect: scores a real local codebase (packages/cli) with non-zero signals', () => {
  const signals = inspect(join(ROOT, 'packages', 'cli'));
  const r = scoreProduct(signals);
  assert.ok(r.total > 0, 'a real codebase should score > 0');
  assert.equal(typeof signals.tests, 'number');
  assert.ok(signals._evidence, 'evidence attached');
});

test('inspect: this repo has tests + CI (deploy.ci true)', () => {
  const signals = inspect(ROOT);
  assert.equal(signals._evidence.hasUnit, true);
  assert.equal(signals._evidence.hasCi, true);
});
