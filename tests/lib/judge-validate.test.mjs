// tests/lib/judge-validate.test.mjs — judge qualification (ADR-004 runtime half).
// Run: node --test tests/lib/judge-validate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { qualifyJudge } from '../../scripts/judge-validate.mjs';

const row = (name, rate, threshold, split = 'holdout') => ({ eval: name, rate, threshold, split });

test('PROMOTE when the candidate judge matches the current judge on holdout', () => {
  const current = [row('a', 0.9, 0.8), row('b', 0.95, 0.8)];
  const candidate = [row('a', 0.9, 0.8), row('b', 0.96, 0.8)]; // parity + tiny gain
  const r = qualifyJudge(current, candidate);
  assert.equal(r.promote, true);
  assert.match(r.verdict, /PROMOTE/);
});

test('REJECT when the candidate judge regresses on any eval', () => {
  const current = [row('a', 0.9, 0.8), row('b', 0.95, 0.8)];
  const candidate = [row('a', 0.7, 0.8), row('b', 0.95, 0.8)]; // a drops below threshold + regresses
  const r = qualifyJudge(current, candidate);
  assert.equal(r.promote, false);
  assert.match(r.verdict, /REJECT/);
});

test('epsilon tolerates a tiny non-meaningful dip', () => {
  const current = [row('a', 0.90, 0.5)];
  const candidate = [row('a', 0.89, 0.5)]; // -0.01
  assert.equal(qualifyJudge(current, candidate, { epsilon: 0 }).promote, false);
  assert.equal(qualifyJudge(current, candidate, { epsilon: 0.02 }).promote, true);
});

test('only the holdout split is judged (train rows ignored)', () => {
  const current = [row('a', 0.9, 0.8)];
  const candidate = [row('a', 0.9, 0.8), { eval: 'b', rate: 0.1, threshold: 0.8, split: 'train' }];
  assert.equal(qualifyJudge(current, candidate).promote, true, 'a train-split flop must not block the judge');
});
