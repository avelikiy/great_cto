// tests/lib/quality.test.mjs — QUALITY-DEEPEN #5 unified quality verdict.
// Run: node --test tests/lib/quality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedScore, assess, evaluateGate, readBaselineOverall } from '../../scripts/lib/quality.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

// ── F5a: gate parity with product-eval.mjs --gate --baseline ──────────────────

test('evaluateGate: below min → BLOCK with score-vs-min reason', () => {
  const r = evaluateGate(65, { min: 70 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'score 65 < min 70');
});

test('evaluateGate: at/above min, no baseline → PASS', () => {
  assert.equal(evaluateGate(70, { min: 70 }).ok, true);
  assert.equal(evaluateGate(100, { min: 70 }).ok, true);
});

test('evaluateGate: regression > 2 points vs baseline → BLOCK (product-eval parity)', () => {
  const r = evaluateGate(80, { min: 70, baselineTotal: 85 }); // 85-80=5 > 2
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'regression 80 < baseline 85');
});

test('evaluateGate: regression exactly 2 points → still PASS (product-eval uses strict < prev-2)', () => {
  const r = evaluateGate(83, { min: 70, baselineTotal: 85 }); // 85-2=83, 83 < 83 is false
  assert.equal(r.ok, true);
});

test('evaluateGate: 3-point regression → BLOCK (boundary just past the >2 threshold)', () => {
  const r = evaluateGate(82, { min: 70, baselineTotal: 85 }); // 82 < 83 → true
  assert.equal(r.ok, false);
});

test('evaluateGate: score improved vs baseline → PASS', () => {
  assert.equal(evaluateGate(90, { min: 70, baselineTotal: 85 }).ok, true);
});

test('evaluateGate: min failure takes precedence even with a passing baseline delta', () => {
  const r = evaluateGate(50, { min: 70, baselineTotal: 50 }); // no regression vs itself, but below min
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'score 50 < min 70');
});

test('readBaselineOverall: reads `overall` field (quality.mjs --json shape)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-baseline-'));
  const f = join(dir, 'prev.json');
  writeFileSync(f, JSON.stringify({ overall: 77 }));
  assert.equal(readBaselineOverall(f), 77);
  rmSync(dir, { recursive: true, force: true });
});

test('readBaselineOverall: falls back to `total` field (product-eval.mjs baseline file shape)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-baseline-'));
  const f = join(dir, 'prev.json');
  writeFileSync(f, JSON.stringify({ total: 82 }));
  assert.equal(readBaselineOverall(f), 82);
  rmSync(dir, { recursive: true, force: true });
});

test('readBaselineOverall: missing file → null (gate skips regression check, never crashes)', () => {
  assert.equal(readBaselineOverall('/nonexistent/prev.json'), null);
});

test('readBaselineOverall: no path given → null', () => {
  assert.equal(readBaselineOverall(null), null);
});

test('readBaselineOverall: malformed JSON → null, not a throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-baseline-'));
  const f = join(dir, 'bad.json');
  writeFileSync(f, '{ not json');
  assert.equal(readBaselineOverall(f), null);
  rmSync(dir, { recursive: true, force: true });
});
