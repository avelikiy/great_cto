// Tests for scripts/hooks/reviewer-nudge.mjs and scripts/hooks/gate-expiry.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NUDGE = resolve(__dirname, '../../scripts/hooks/reviewer-nudge.mjs');
const EXPIRY = resolve(__dirname, '../../scripts/hooks/gate-expiry.mjs');

const { matchReviewers, filterNudges } = await import(NUDGE);
const { classifyGates } = await import(EXPIRY);

// ─── reviewer-nudge: pure matching ───────────────────────────────────────

test('matchReviewers flags payment + webhook file for both reviewers', () => {
  const r = matchReviewers('src/payments/stripe-webhook.ts');
  assert.ok(r.includes('pci-reviewer'));
});

test('matchReviewers respects EXCLUDE (docs, markdown, agent prompts)', () => {
  assert.deepEqual(matchReviewers('docs/payment-notes.md'), []);
  assert.deepEqual(matchReviewers('agents/pci-reviewer.md'), []);
});

test('matchReviewers ignores non-matching files', () => {
  assert.deepEqual(matchReviewers('src/utils/format.ts'), []);
});

test('filterNudges debounces within 30 min and respects fresh verdicts', () => {
  const now = Date.now();
  const reviewers = ['pci-reviewer', 'infra-reviewer', 'cli-reviewer'];
  const out = filterNudges(reviewers, {
    now,
    state: { 'pci-reviewer': now - 5 * 60 * 1000 },          // nudged 5 min ago
    verdictMtimes: { 'infra-reviewer': now - 60 * 60 * 1000 }, // verdict 1h ago
  });
  assert.deepEqual(out, ['cli-reviewer']);
});

// ─── gate-expiry: pure classification ────────────────────────────────────

const H = 3_600_000;
const gate = (id, ageH, now) => ({ id, title: id, created_at: new Date(now - ageH * H).toISOString() });

test('classifyGates: >72h expired, 24-72h aging, <24h silent', () => {
  const now = Date.now();
  const { expired, aging } = classifyGates(
    [gate('g-old', 80, now), gate('g-mid', 48, now), gate('g-new', 2, now)], now);
  assert.deepEqual(expired.map(g => g.id), ['g-old']);
  assert.deepEqual(aging.map(g => g.id), ['g-mid']);
});

test('classifyGates skips unparsable created_at', () => {
  const { expired, aging } = classifyGates([{ id: 'g-bad', created_at: 'nope' }], Date.now());
  assert.equal(expired.length + aging.length, 0);
});

test('classifyGates honors custom expiry hours', () => {
  const now = Date.now();
  const { expired } = classifyGates([gate('g', 30, now)], now, 24);
  assert.deepEqual(expired.map(g => g.id), ['g']);
});

// ─── e2e sandbox ─────────────────────────────────────────────────────────

test('e2e nudge: emits additionalContext once, silent on repeat (debounce)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-nudge-'));
  mkdirSync(join(dir, '.great_cto'), { recursive: true });
  const run = () => spawnSync('node', [NUDGE], {
    input: JSON.stringify({ tool_input: { file_path: 'terraform/main.tf' } }),
    encoding: 'utf8', cwd: dir,
    env: { ...process.env, GREAT_CTO_DISABLE_REVIEWER_NUDGE: '' },
  });
  try {
    const first = run();
    assert.equal(first.status, 0);
    const out = JSON.parse(first.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /infra-reviewer/);
    const second = run();
    assert.equal(second.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e nudge: silent outside a great_cto project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-nudge-'));
  try {
    const r = spawnSync('node', [NUDGE], {
      input: JSON.stringify({ tool_input: { file_path: 'terraform/main.tf' } }),
      encoding: 'utf8', cwd: dir,
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e gate-expiry: silent when bd/project absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-exp-'));
  try {
    const r = spawnSync('node', [EXPIRY], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
