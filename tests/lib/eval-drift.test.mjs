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

test('a row the runner could not measure never becomes a baseline', () => {
  // Thirteen such rows are already on disk from the run that found the problem:
  // rate 0 because the provider stopped answering, not because the agent failed
  // every case. A detector that trusts what is on disk must still refuse them.
  const lines = [
    JSON.stringify({ eval: 'A', rate: 0.9, stddev: 0.05, split: 'holdout', samples: 3 }),
    JSON.stringify({ eval: 'A', rate: 0, stddev: 0, split: 'holdout', samples: 1, dropout: { severe: true, why: 'never reached the provider' } }),
  ].join('\n');
  const rows = parseEvalHistory(lines);
  assert.equal(rows.length, 1, 'the unmeasured row is not a data point');
  assert.equal(rows[0].rate, 0.9);
});

test('a non-severe dropout is still real data', () => {
  // Losing two cases of forty is a weaker measurement, not an absent one — the
  // power verdict already carries that. Dropping it would throw away evidence.
  const line = JSON.stringify({ eval: 'A', rate: 0.8, stddev: 0.1, split: 'holdout', samples: 3, dropout: { severe: false } });
  assert.equal(parseEvalHistory(line).length, 1);
});

// ── Sample count is part of the shape too ───────────────────────────────────
//
// Filtering by split alone was half a fix, and the first real run at the
// scheduled shape exposed the other half: 49 of 75 evals "drifted", 29 up and
// 20 down. Symmetric drift is a ruler change, not a regression.
//
// One sample of a three-case eval can only score 0, 0.33, 0.67 or 1.00, so its
// own history swings 0.83 → 1.00 → 0.83 with nothing changing. A three-sample
// mean estimates the same quantity better and therefore reads as a drop against
// the average of those swings.

test('a three-sample run is not compared against single-sample draws', () => {
  const rows = [
    { eval: 'E', rate: 1.0, stddev: 0, split: 'holdout', samples: 1 },
    { eval: 'E', rate: 0.83, stddev: 0, split: 'holdout', samples: 1 },
    { eval: 'E', rate: 0.67, stddev: 0.1, split: 'holdout', samples: 3 },
  ];
  const only = sameShape(rows, { split: 'holdout', samples: 3 });
  assert.equal(only.length, 1);
  assert.equal(only[0].samples, 3);
});

test('no sample filter keeps the old behaviour', () => {
  const rows = [{ eval: 'E', rate: 1, stddev: 0, split: 'holdout', samples: 1 }];
  assert.equal(sameShape(rows, { split: 'holdout' }).length, 1);
});

test('split and samples both apply', () => {
  const rows = [
    { eval: 'E', rate: 1, stddev: 0, split: 'all', samples: 3 },
    { eval: 'E', rate: 1, stddev: 0, split: 'holdout', samples: 1 },
    { eval: 'E', rate: 1, stddev: 0, split: 'holdout', samples: 3 },
  ];
  assert.equal(sameShape(rows, { split: 'holdout', samples: 3 }).length, 1);
});

// ── A rise is not an alarm ──────────────────────────────────────────────────
//
// detectDrift flags movement in both directions. The first complete run at the
// scheduled shape printed "DRIFT DETECTED" in red over two evals that had both
// improved. Painting an improvement red is how a red banner stops meaning
// anything — the same cry-wolf failure that got a two-minute pre-push hook and
// a substring-matching privacy guard worked around instead of fixed.

test('only drops are regressions; rises are reported, not alarmed', () => {
  const alerts = [
    { key: 'A', drift: -0.3, alert: true },
    { key: 'B', drift: 0.25, alert: true },
    { key: 'C', drift: 0.02, alert: false },
  ];
  const drops = alerts.filter((d) => d.alert && d.drift < 0);
  const rises = alerts.filter((d) => d.alert && d.drift > 0);
  assert.deepEqual(drops.map((d) => d.key), ['A']);
  assert.deepEqual(rises.map((d) => d.key), ['B'], 'a rise is worth a look, not a red banner');
});
