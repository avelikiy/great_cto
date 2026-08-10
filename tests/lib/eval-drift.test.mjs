// tests/lib/eval-drift.test.mjs — DEEPEN W3.6 eval-drift detection + noise gate.
// Run: node --test tests/lib/eval-drift.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvalHistory, recentNoise, sameShape } from '../../scripts/lib/eval-drift.mjs';

test('parseEvalHistory: keeps {eval,rate,stddev}, skips junk', () => {
  const text = '{"eval":"A","rate":0.9,"stddev":0.05}\n{bad}\n{"eval":"B","rate":0.5}\n{"rate":1}\n';
  const rows = parseEvalHistory(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eval, 'A');
  assert.equal(rows[1].stddev, 0, 'missing stddev → 0');
});

test('recentNoise: averages the LAST stddev per eval', () => {
  // `samples` is explicit now: a stddev only means something when more than one
  // observation produced it. These rows represent measured variance, which is
  // what the test always intended — it predates the field.
  const rows = [
    { eval: 'A', rate: 0.9, stddev: 0.4, samples: 3 },
    { eval: 'A', rate: 0.9, stddev: 0.1, samples: 3 }, // last for A wins
    { eval: 'B', rate: 0.5, stddev: 0.3, samples: 3 },
  ];
  // (0.1 + 0.3) / 2 = 0.2
  assert.ok(Math.abs(recentNoise(rows) - 0.2) < 1e-9);
});

test('recentNoise: nothing measured → unknown, not zero', () => {
  // This used to assert 0, and 0 is what a caller compares against a threshold:
  // an empty history read as a perfectly quiet signal and the gate opened. The
  // answer to "how noisy is it" with no measurements is not a number.
  assert.equal(recentNoise([]), null);
});

// ── Comparing like with like ────────────────────────────────────────────────
//
// The history interleaves 285 holdout rows, 148 full-split rows and 5 tuning
// rows. The parser dropped `split`, so a scheduled `--split holdout` run was
// compared against whatever ran last — often a one-sample full-split run on a
// laptop. The same eval then read as a 0.11 regression or a 0.16 improvement
// depending only on which rows happened to be adjacent.

test('history is compared within a split, not across splits', () => {
  const rows = [
    { eval: 'E', rate: 0.9, stddev: 0.05, split: 'holdout', samples: 3 },
    { eval: 'E', rate: 0.4, stddev: 0, split: 'all', samples: 1 },
    { eval: 'E', rate: 0.88, stddev: 0.05, split: 'holdout', samples: 3 },
  ];
  const only = sameShape(rows, { split: 'holdout' });
  assert.equal(only.length, 2);
  assert.ok(only.every(r => r.split === 'holdout'));
});

test('no filter keeps every row, so the default is unchanged', () => {
  const rows = [{ eval: 'E', rate: 1, stddev: 0, split: 'all', samples: 1 }];
  assert.equal(sameShape(rows, {}).length, 1);
});

test('the parser keeps the run shape it used to discard', () => {
  const line = JSON.stringify({ eval: 'E', rate: 0.5, stddev: 0.2, split: 'holdout', samples: 3 });
  const [r] = parseEvalHistory(line);
  assert.equal(r.split, 'holdout');
  assert.equal(r.samples, 3);
});

// ── Unmeasured is not quiet ─────────────────────────────────────────────────
//
// A single-sample run reports stddev 0 because it ran the case once. Averaging
// those in gave a recent mean of 0.00 across a history where 416 of 438 rows are
// single-sample — so the gate that exists to refuse a noisy signal passed on a
// signal whose noise nobody had measured.

test('single-sample rows do not count as a quiet signal', () => {
  const rows = [
    { eval: 'A', rate: 1, stddev: 0, split: 'all', samples: 1 },
    { eval: 'B', rate: 1, stddev: 0, split: 'all', samples: 1 },
  ];
  assert.equal(recentNoise(rows), null, 'no variance was ever observed — that is unknown, not zero');
});

test('noise is measured only from runs that could measure it', () => {
  const rows = [
    { eval: 'A', rate: 1, stddev: 0, split: 'holdout', samples: 1 },   // ignored
    { eval: 'B', rate: 1, stddev: 0.2, split: 'holdout', samples: 3 }, // counted
  ];
  assert.equal(recentNoise(rows), 0.2, 'the single-sample zero must not dilute a real measurement');
});

test('a mix still reports the measured rows only', () => {
  const rows = [
    { eval: 'A', rate: 1, stddev: 0.1, split: 'holdout', samples: 3 },
    { eval: 'B', rate: 1, stddev: 0.3, split: 'holdout', samples: 5 },
    { eval: 'C', rate: 1, stddev: 0, split: 'holdout', samples: 1 },
  ];
  assert.equal(Number(recentNoise(rows).toFixed(4)), 0.2);
});
