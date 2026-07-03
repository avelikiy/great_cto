// tests/lib/product-score.test.mjs — product quality scorer.
// Run: node --test tests/lib/product-score.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, scoreProduct, inspect } from '../../scripts/lib/product-score.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Hermetic stand-in for "a real CLI codebase": package.json with `bin`, no
// .great_cto/PROJECT.md. Scoring the real packages/cli is NOT hermetic — a
// locally init'ed (untracked) .great_cto/PROJECT.md there flips detection from
// the bin-fallback family 'cli' to that file's `primary:` archetype.
function makeCliFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-ps-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture-cli', bin: { 'fixture-cli': 'index.mjs' },
  }));
  writeFileSync(join(dir, 'index.mjs'), '#!/usr/bin/env node\nconsole.log("hi");\n');
  return dir;
}

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

// ── P2: archetype-aware rubric ────────────────────────────────────────────────

import { rubricFor, ARCHETYPE_DROP, detectArchetype, normalizeArchetype } from '../../scripts/lib/product-score.mjs';

test('rubricFor: default keeps all 7 dims summing to 100', () => {
  const r = rubricFor(null);
  assert.equal(r.length, 7);
  assert.equal(Math.round(r.reduce((a, d) => a + d.weight, 0)), 100);
});

test('rubricFor: cli drops design_a11y + deploy, renormalizes to 100', () => {
  const r = rubricFor('cli');
  assert.ok(!r.find(d => d.key === 'design_a11y'));
  assert.ok(!r.find(d => d.key === 'deploy'));
  assert.equal(Math.round(r.reduce((a, d) => a + d.weight, 0)), 100);
});

test('archetype-aware: a CLI is not penalized for no UI/deploy (scores higher as cli)', () => {
  // a product with everything EXCEPT ui/design and deploy
  const sig = { completeness: 1, tests: 1, security: 1, design_a11y: 0, observability: 1, deploy: 0, verifiability: 1 };
  const asWeb = scoreProduct(sig, null).total;
  const asCli = scoreProduct(sig, 'cli').total;
  assert.ok(asCli > asWeb, `cli (${asCli}) should beat web (${asWeb}) when UI/deploy legitimately absent`);
});

test('detectArchetype: bin-fallback detects cli family directly', () => {
  // The bin heuristic returns the scoring-family name 'cli' directly (not the
  // canonical archetypes.ts id 'cli-tool' — that only comes from a PROJECT.md
  // archetype/primary line). normalizeArchetype is idempotent on the family.
  const dir = makeCliFixture();
  try {
    const a = detectArchetype(dir);
    assert.equal(a, 'cli');
    assert.equal(normalizeArchetype(a), 'cli');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect cli completeness: packages/cli scores its cli-completeness > 0', () => {
  const s = inspect(join(ROOT, 'packages', 'cli'), 'cli');
  assert.ok(s.completeness > 0, 'cli completeness (entry+commands+help) should be > 0');
});

// ── P3: scoreDir + renderScoreMarkdown ────────────────────────────────────────

import { scoreDir, renderScoreMarkdown } from '../../scripts/lib/product-score.mjs';

test('scoreDir: end-to-end returns a total + archetype (hermetic cli fixture)', () => {
  const dir = makeCliFixture();
  try {
    const r = scoreDir(dir);
    assert.ok(r.total >= 0 && r.total <= 100);
    assert.equal(r.archetype, 'cli'); // bin-fallback detection (no PROJECT.md in fixture)
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('renderScoreMarkdown: emits a SCORE artifact with total + table', () => {
  const res = scoreProduct({ completeness: 1, tests: 1 }, null);
  const md = renderScoreMarkdown('demo', res);
  assert.match(md, /^# SCORE-demo/m);
  assert.match(md, /Quality: \d+\/100/);
  assert.match(md, /\| Dimension \| Points \| Signal \|/);
});
