// tests/bench-collect.test.mjs — unit tests for the benchmark row collector.
// Pure-function coverage + one integration run against a tmp fixture product dir.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  wallTimeFromLines, fmtDuration, sumCostHistory, sumCostTags,
  extractPreviewUrl, detectFailure, parseTestCounts,
} from '../scripts/bench-collect.mjs';

// ─── wall time ──────────────────────────────────────────────────────────────

test('wallTimeFromLines spans min→max across mixed line formats', () => {
  const w = wallTimeFromLines([
    '2026-07-10T10:00:00Z | architect | APPROVED | cost=$0.50',
    '2026-07-10T09:30:00Z security-officer PASS run p0=0',        // space-separated
    'garbage line without timestamp',
    '2026-07-10T12:13:00Z | devops | DEPLOYED | url=x',
  ]);
  assert.equal(w.first, '2026-07-10T09:30:00Z');
  assert.equal(w.last, '2026-07-10T12:13:00Z');
  assert.equal(w.seconds, 9780);
  assert.equal(w.human, '2h 43m');
});

test('wallTimeFromLines returns null with no timestamps', () => {
  assert.equal(wallTimeFromLines(['no ts here', '']), null);
});

test('fmtDuration: seconds, minutes, hours', () => {
  assert.equal(fmtDuration(45), '45s');
  assert.equal(fmtDuration(300), '5m');
  assert.equal(fmtDuration(5160), '1h 26m');
});

// ─── cost ───────────────────────────────────────────────────────────────────

test('sumCostHistory sums third column, skips malformed lines', () => {
  const r = sumCostHistory([
    '2026-07-10T10:00:00Z architect 0.50',
    '2026-07-10T11:00:00Z senior-dev 1.25',
    'malformed',
    '2026-07-10T12:00:00Z qa notanumber',
  ].join('\n'));
  assert.deepEqual(r, { sum: 1.75, rows: 2 });
});

test('sumCostTags sums cost=$ tags from verdict lines', () => {
  const r = sumCostTags([
    '2026-07-10T10:00:00Z | a | OK | cost=$0.10',
    '2026-07-10T10:01:00Z | b | OK | no cost tag',
    '2026-07-10T10:02:00Z | c | OK | cost=$2.4',
  ]);
  assert.deepEqual(r, { sum: 2.5, rows: 2 });
});

// ─── preview URL ────────────────────────────────────────────────────────────

test('extractPreviewUrl picks last preview-host URL, ignores docs links', () => {
  const url = extractPreviewUrl([
    'see https://docs.aws.amazon.com/foo and https://ats-one.vercel.app/login',
    'later deploy: https://ats-two.vercel.app.',                   // trailing dot stripped
  ]);
  assert.equal(url, 'https://ats-two.vercel.app');
});

test('extractPreviewUrl returns null when only non-preview URLs present', () => {
  assert.equal(extractPreviewUrl(['https://github.com/x/y']), null);
});

// ─── failure detection ──────────────────────────────────────────────────────

test('detectFailure classifies spec-objection / cost-cap / gate-block', () => {
  assert.equal(detectFailure(['ts | pm | SPEC-OBJECTION | scope creep']).class, 'spec-objection');
  assert.equal(detectFailure(['cost-guard: cap exceeded, blocking']).class, 'cost-cap');
  assert.equal(detectFailure(['ts | cso | BLOCKED | p0=2']).class, 'gate-block');
  assert.equal(detectFailure(['ts | devops | DEPLOYED']), null);
});

// ─── test-output parsing ────────────────────────────────────────────────────

test('parseTestCounts: node --test TAP, vitest/jest, unknown', () => {
  assert.deepEqual(parseTestCounts('# tests 12\n# pass 12\n# fail 0\n'), { passed: 12, failed: 0 });
  assert.deepEqual(parseTestCounts('Tests: 2 failed, 10 passed, 12 total'), { passed: 10, failed: 2 });
  assert.equal(parseTestCounts('all good probably'), null);
});

// ─── integration: fixture product dir ───────────────────────────────────────

test('integration: collects a full row from a fixture product dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-fixture-'));
  try {
    mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
    writeFileSync(join(dir, '.great_cto', 'verdicts', 'architect.log'),
      '2026-07-10T10:00:00Z | architect | APPROVED | feature=ats | cost=$0.80\n');
    writeFileSync(join(dir, '.great_cto', 'verdicts', 'devops.log'),
      '2026-07-10T13:26:00Z | devops | DEPLOYED | url=https://bench-ats.vercel.app | cost=$0.20\n');
    writeFileSync(join(dir, '.great_cto', 'cost-history.log'),
      '2026-07-10T10:00:00Z architect 0.80\n2026-07-10T13:26:00Z devops 0.20\n');

    const out = execFileSync('node',
      ['scripts/bench-collect.mjs', dir, '--slug', 'ats', '--no-tests', '--no-probe'],
      { encoding: 'utf8' });
    const row = JSON.parse(out);

    assert.equal(row.slug, 'ats');
    assert.equal(row.wall.human, '3h 26m');
    assert.deepEqual(row.cost, { usd: 1, source: 'cost-history', rows: 2 });
    assert.equal(row.deploy.url, 'https://bench-ats.vercel.app');
    assert.equal(row.deploy.reachable, null);              // --no-probe
    assert.equal(row.failure, null);
    assert.ok(typeof row.score?.total === 'number');       // scorer ran (low score is fine)
    assert.equal(row.tests.ran, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: non-product dir exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-empty-'));
  try {
    assert.throws(
      () => execFileSync('node', ['scripts/bench-collect.mjs', dir], { encoding: 'utf8' }),
      /status 1|Command failed/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
