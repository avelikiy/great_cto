// The weekly holdout run costs about $47 and nobody knew.
//
// `scheduled-evals-drift.yml` asks for `--samples 3 --judge-votes 3` across 75
// holdout evals. The history prices that at $0.62 an eval. The number was never
// felt because GitHub Actions has been failing at the billing layer for weeks,
// so the schedule was inert — which is the only reason an unpriced $200/month
// job sat in the repository without anyone noticing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRun, costLine } from '../../scripts/lib/eval-cost-estimate.mjs';

const row = (o) => ({ eval: 'E', split: 'holdout', samples: 3, costUsd: 0.5, ...o });

test('a run is priced from runs of the same shape', () => {
  const rows = [
    row({ eval: 'A', costUsd: 0.4 }),
    row({ eval: 'B', costUsd: 0.6 }),
    row({ eval: 'C', samples: 1, costUsd: 0.1 }),   // different shape, ignored
    row({ eval: 'D', split: 'all', costUsd: 9 }),   // different split, ignored
  ];
  const est = estimateRun({ rows, split: 'holdout', samples: 3, evals: 10 });
  assert.equal(est.perEval, 0.5, 'only the two matching rows count');
  assert.equal(est.usd, 5);
  assert.equal(est.basis, 2);
});

test('a shape that has never run is unknown, not free', () => {
  // The defect this repo keeps removing: an unpriced run reported as $0 reads
  // exactly like a run that costs nothing.
  const est = estimateRun({ rows: [row({ samples: 3 })], split: 'holdout', samples: 9 });
  assert.equal(est.usd, null);
  assert.equal(est.confidence, 'none');
  assert.match(est.why, /never been priced/);
  assert.match(costLine(est), /unknown/);
});

test('an empty history is unknown too', () => {
  const est = estimateRun({ rows: [], split: 'holdout', samples: 3 });
  assert.equal(est.usd, null);
  assert.equal(est.basis, 0);
});

test('confidence reflects how much it is standing on', () => {
  const many = (n, c) => Array.from({ length: n }, (_, i) => row({ eval: `E${i}`, costUsd: c }));
  assert.equal(estimateRun({ rows: many(3, 1), split: 'holdout', samples: 3, evals: 1 }).confidence, 'weak');
  assert.equal(estimateRun({ rows: many(20, 1), split: 'holdout', samples: 3, evals: 1 }).confidence, 'fair');
  assert.equal(estimateRun({ rows: many(60, 1), split: 'holdout', samples: 3, evals: 1 }).confidence, 'good');
});

test('the eval count defaults to the distinct evals in that split', () => {
  const rows = [
    row({ eval: 'A' }), row({ eval: 'B' }), row({ eval: 'A' }),
    row({ eval: 'Z', split: 'all' }),
  ];
  const est = estimateRun({ rows, split: 'holdout', samples: 3 });
  assert.equal(est.evals, 2, 'A and B, counted once each, and not Z');
});

test('a negative or missing cost is not treated as a price', () => {
  const rows = [row({ eval: 'A', costUsd: undefined }), row({ eval: 'B', costUsd: -1 }), row({ eval: 'C', costUsd: 0.8 })];
  const est = estimateRun({ rows, split: 'holdout', samples: 3, evals: 1 });
  assert.equal(est.basis, 1);
  assert.equal(est.perEval, 0.8);
});

test('the line a human reads says what it is standing on', () => {
  const est = estimateRun({ rows: [row({ eval: 'A', costUsd: 0.62 })], split: 'holdout', samples: 3, evals: 75 });
  const line = costLine(est);
  assert.match(line, /\$46\.50/);
  assert.match(line, /75 evals/);
  assert.match(line, /confidence weak/, 'one row is not a confident estimate and must not read as one');
});
