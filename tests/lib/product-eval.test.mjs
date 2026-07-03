// tests/lib/product-eval.test.mjs — executed-quality scorer (the ceiling).
// Run: node --test tests/lib/product-eval.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXEC_RUBRIC, scoreExecution, parseTestCounts } from '../../scripts/lib/product-eval.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'lib', 'product-eval.mjs');

test('EXEC_RUBRIC weights sum to 100', () => {
  assert.equal(EXEC_RUBRIC.reduce((a, d) => a + d.weight, 0), 100);
});

test('scoreExecution: all green (tests pass, na elsewhere, no vulns/secrets) → 100', () => {
  const r = scoreExecution({ tests: { ran: true, total: 13, passed: 13, failed: 0 }, typecheck: 'na', lint: 'na', auditHigh: null, secretLeak: false });
  assert.equal(r.total, 100);
  assert.equal(r.grade, 'A');
});

test('scoreExecution: tests not run → tests dimension 0 (big hit)', () => {
  const r = scoreExecution({ tests: { ran: false }, typecheck: 'na', lint: 'na', auditHigh: 0, secretLeak: false });
  assert.equal(r.breakdown.find(b => b.key === 'tests').points, 0);
  assert.equal(r.total, 55); // 100 - 45 (tests)
});

test('scoreExecution: failing tests scale by pass-rate', () => {
  const r = scoreExecution({ tests: { ran: true, total: 10, passed: 6, failed: 4 }, typecheck: 'na', lint: 'na', auditHigh: 0, secretLeak: false });
  // tests signal 0.6 → 27/45
  assert.equal(r.breakdown.find(b => b.key === 'tests').points, 27);
});

test('scoreExecution: typecheck/lint fail and a secret leak drop their dims', () => {
  const r = scoreExecution({ tests: { ran: true, total: 1, passed: 1, failed: 0 }, typecheck: 'fail', lint: 'fail', auditHigh: 0, secretLeak: true });
  assert.equal(r.breakdown.find(b => b.key === 'typecheck').points, 0);
  assert.equal(r.breakdown.find(b => b.key === 'lint').points, 0);
  assert.equal(r.breakdown.find(b => b.key === 'secrets').points, 0);
});

test('scoreExecution: high vulns scale deps down', () => {
  assert.equal(scoreExecution({ auditHigh: 1, tests: { ran: true, total: 1, passed: 1 }, typecheck: 'na', lint: 'na' }).breakdown.find(b => b.key === 'deps').signal, 0.66);
  assert.equal(scoreExecution({ auditHigh: 3, tests: { ran: true, total: 1, passed: 1 }, typecheck: 'na', lint: 'na' }).breakdown.find(b => b.key === 'deps').signal, 0);
});

test('parseTestCounts: node:test spec + TAP forms', () => {
  assert.deepEqual(parseTestCounts('ℹ tests 13\nℹ pass 13\nℹ fail 0'), { total: 13, pass: 13, fail: 0 });
  assert.deepEqual(parseTestCounts('# tests 5\n# pass 4\n# fail 1'), { total: 5, pass: 4, fail: 1 });
  assert.deepEqual(parseTestCounts('no counts here'), { total: null, pass: null, fail: null });
});

// ── F6a/F6b: --browser opt-in hook — additive, never shifts EXEC_RUBRIC's total ────

test('CLI: --browser is opt-in — EXECUTED SCORE is identical with and without it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-browser-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'true' } }));
  const without = spawnSync(process.execPath, [TOOL, dir, '--json'], { encoding: 'utf8' });
  const withBrowser = spawnSync(process.execPath, [TOOL, dir, '--browser', '--json'], { encoding: 'utf8' });
  assert.equal(without.status, 0, without.stdout + without.stderr);
  assert.equal(withBrowser.status, 0, withBrowser.stdout + withBrowser.stderr);
  const a = JSON.parse(without.stdout);
  const b = JSON.parse(withBrowser.stdout);
  assert.equal(a.total, b.total, 'the a11y/vitals signals must not shift the fixed-weight executed score');
  rmSync(dir, { recursive: true, force: true });
});

test('CLI: --browser --json includes a browser field with na signals (no preview script)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-browser-noscript-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'true' } }));
  const res = spawnSync(process.execPath, [TOOL, dir, '--browser', '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.browser.a11y.signal, 'na');
  assert.equal(parsed.browser.vitals.signal, 'na');
  assert.equal(parsed.browser.reason, 'no dev/preview/start script');
  rmSync(dir, { recursive: true, force: true });
});

test('CLI: without --browser, --json has no browser field at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-nobrowser-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'true' } }));
  const res = spawnSync(process.execPath, [TOOL, dir, '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.ok(!('browser' in JSON.parse(res.stdout)));
  rmSync(dir, { recursive: true, force: true });
});
