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
  accumulateUsage, priceUsage, transcriptDirFor, upsertRow, PRICING_PER_MTOK,
  pipelineCompleted,
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

test('extractPreviewUrl prefers hash-segmented deployment URL over vanity alias', () => {
  // wave-0 regression: runbook mentions the PLANNED alias 5×, the real deploy once
  const url = extractPreviewUrl([
    'deployed: https://ats-1gljywn1v-softone.vercel.app/',
    'prod will be https://ats-prod.vercel.app and https://ats-prod.vercel.app/api',
  ]);
  assert.equal(url, 'https://ats-1gljywn1v-softone.vercel.app');
});

test('extractPreviewUrl falls back to plain preview URL, first mention wins', () => {
  const url = extractPreviewUrl([
    'see https://docs.aws.amazon.com/foo and https://ats-one.vercel.app/login',
    'later: https://ats-two.vercel.app.',
  ]);
  assert.equal(url, 'https://ats-one.vercel.app/login');
});

test('extractPreviewUrl returns null when only non-preview URLs present', () => {
  assert.equal(extractPreviewUrl(['https://github.com/x/y']), null);
});

// ─── failure detection ──────────────────────────────────────────────────────

test('detectFailure classifies spec-objection / cost-cap / gate-block / harness-timeout', () => {
  assert.equal(detectFailure(['ts | pm | SPEC-OBJECTION | scope creep']).class, 'spec-objection');
  assert.equal(detectFailure(['cost-guard: cap exceeded, blocking']).class, 'cost-cap');
  assert.equal(detectFailure(['ts | cso | BLOCKED | p0=2']).class, 'gate-block');
  assert.equal(detectFailure(['Background tasks still running after 600s; terminating. Set CLAUDE…']).class, 'harness-timeout');
  assert.equal(detectFailure(['ts | devops | DEPLOYED']), null);
});

test('pipelineCompleted spots the security sign-off in both verdict formats', () => {
  assert.ok(pipelineCompleted(['2026-07-10T18:18:19Z | security-officer | APPROVED | findings=P0:0']));
  assert.ok(pipelineCompleted(['2026-07-02T17:51:53Z security-officer PASS run p0=0']));
  assert.ok(!pipelineCompleted(['ts | pm | PLAN_READY | tasks=13']));
});

// ─── transcript cost ────────────────────────────────────────────────────────

test('accumulateUsage + priceUsage compute API-equivalent USD per model', () => {
  const acc = {};
  accumulateUsage(acc, JSON.stringify({ message: { model: 'claude-sonnet-5', usage: {
    input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 2_000_000, cache_creation_input_tokens: 0 } } }));
  accumulateUsage(acc, JSON.stringify({ message: { model: 'claude-unknown-9', usage: { input_tokens: 5 } } }));
  accumulateUsage(acc, 'not json');
  accumulateUsage(acc, JSON.stringify({ noMessage: true }));

  const r = priceUsage(acc);
  // sonnet-5: 1M×$3 + 0.1M×$15 + 2M×$0.30 = 3 + 1.5 + 0.6 = $5.10
  assert.equal(r.by_model['claude-sonnet-5'].usd, 5.1);
  assert.equal(r.usd, 5.1);
  assert.deepEqual(r.unpriced_models, ['claude-unknown-9']);
});

test('priceUsage strips date-suffixed model ids', () => {
  const acc = {};
  accumulateUsage(acc, JSON.stringify({ message: { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 1_000_000 } } }));
  const r = priceUsage(acc);
  assert.equal(r.usd, PRICING_PER_MTOK['claude-haiku-4-5'].in);
  assert.deepEqual(r.unpriced_models, []);
});

test('transcriptDirFor flattens the product path', () => {
  assert.ok(transcriptDirFor('/Users/x/bench/ats').endsWith('/.claude/projects/-Users-x-bench-ats'));
});

// ─── upsert ─────────────────────────────────────────────────────────────────

test('upsertRow replaces same-slug row, keeps others, appends new', () => {
  const existing = JSON.stringify({ slug: 'ats', v: 1 }) + '\n' + JSON.stringify({ slug: 'crm', v: 1 }) + '\n';
  const out = upsertRow(existing, { slug: 'ats', v: 2 });
  const rows = out.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.slug === 'ats').v, 2);
  assert.equal(rows.find(r => r.slug === 'crm').v, 1);
  assert.ok(out.endsWith('\n'));
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
    assert.equal(row.cost.logged_usd, 1);
    assert.equal(row.cost.logged_source, 'cost-history');
    assert.equal(row.cost.token_equiv_usd, null); // tmp fixture has no transcripts
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
