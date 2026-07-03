// tests/lib/quality.test.mjs — QUALITY-DEEPEN #5 unified quality verdict.
// Run: node --test tests/lib/quality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedScore, assess, evaluateGate, readBaselineOverall, sparkline, buildTrend, renderTrendText } from '../../scripts/lib/quality.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'lib', 'quality.mjs');

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

// ── F5b: --trend — quality-scoped view over metrics-history.jsonl ─────────────

const FIXTURE_HISTORY = join(ROOT, 'tests', 'lib', 'fixtures', 'metrics-history.jsonl');

test('sparkline: empty series → empty string', () => {
  assert.equal(sparkline([]), '');
});

test('sparkline: one tick per value, length matches input', () => {
  const s = sparkline([0.1, 0.5, 0.9]);
  assert.equal(s.length, 3);
});

test('sparkline: flat series (no range) still renders without throwing', () => {
  assert.equal(sparkline([0.5, 0.5, 0.5]).length, 3);
});

test('buildTrend: keeps only quality.* keys, ignores other metrics-history rows', () => {
  const rows = [
    { key: 'quality.cli', value: 0.8 },
    { key: 'eval_pass_rate', value: 0.92 },
  ];
  const t = buildTrend(rows);
  assert.equal(t.length, 1);
  assert.equal(t[0].archetype, 'cli');
});

test('buildTrend: fixture history — cli trend has 5 points, latest 85, delta +5', () => {
  const rows = parseHistoryFixture();
  const t = buildTrend(rows);
  const cli = t.find(x => x.archetype === 'cli');
  assert.equal(cli.points, 5);
  assert.equal(cli.latest, 85);
  assert.equal(cli.delta, 5);
  assert.deepEqual(cli.scores, [70, 74, 72, 80, 85]);
});

test('buildTrend: fixture history — crud trend has 2 points, regression delta -25', () => {
  const rows = parseHistoryFixture();
  const t = buildTrend(rows);
  const crud = t.find(x => x.archetype === 'crud');
  assert.equal(crud.points, 2);
  assert.equal(crud.latest, 65);
  assert.equal(crud.delta, -25);
});

test('buildTrend: single point → delta null (first point)', () => {
  const t = buildTrend([{ key: 'quality.web', value: 0.5 }]);
  assert.equal(t[0].delta, null);
});

test('buildTrend: --last caps the window to the most recent N points', () => {
  const rows = parseHistoryFixture();
  const t = buildTrend(rows, { last: 2 });
  const cli = t.find(x => x.archetype === 'cli');
  assert.equal(cli.points, 2);
  assert.deepEqual(cli.scores, [80, 85]);
});

test('buildTrend: results sorted by archetype name', () => {
  const t = buildTrend(parseHistoryFixture());
  const names = t.map(x => x.archetype);
  assert.deepEqual(names, [...names].sort());
});

test('renderTrendText: no data → friendly message, not an error', () => {
  const s = renderTrendText([]);
  assert.match(s, /no recorded quality/);
});

test('renderTrendText: includes archetype, score, and delta sign for each series', () => {
  const t = buildTrend(parseHistoryFixture());
  const s = renderTrendText(t);
  assert.match(s, /cli/);
  assert.match(s, /85\/100/);
  assert.match(s, /Δ\+5/);
  assert.match(s, /crud/);
  assert.match(s, /Δ-25/);
});

test('CLI: --trend reads --history fixture, prints table, always exits 0', () => {
  const res = spawnSync(process.execPath, [TOOL, '--trend', '--history', FIXTURE_HISTORY], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Quality trend/);
  assert.match(res.stdout, /cli/);
});

test('CLI: --trend --json emits parseable JSON', () => {
  const res = spawnSync(process.execPath, [TOOL, '--trend', '--history', FIXTURE_HISTORY, '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.find(t => t.archetype === 'cli'));
});

test('CLI: --trend with a missing history file exits 0 with a friendly message (read-only, never crashes)', () => {
  const res = spawnSync(process.execPath, [TOOL, '--trend', '--history', '/nonexistent/metrics-history.jsonl'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /no recorded quality/);
});

function parseHistoryFixture() {
  const text = readFileSync(FIXTURE_HISTORY, 'utf8');
  return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
}
