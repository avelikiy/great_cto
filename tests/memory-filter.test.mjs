// Tests for scripts/memory-filter.mjs
//
// Run with:  node --test tests/memory-filter.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILTER = resolve(__dirname, '../scripts/memory-filter.mjs');

const DECISIONS_FIXTURE = `# Decisions log

## D-001 — Use Postgres for primary store
- date: 2026-01-01
- gate: architect
- reasoning: Relational data, ACID guarantees, good at JOIN-heavy queries.

## D-002 — Use Stripe for payments
- date: 2026-01-05
- gate: pci-reviewer
- reasoning: PCI-DSS SAQ-A, hosted fields, no card data on our infra.

## D-003 — Use Redis for session cache
- date: 2026-01-10
- gate: architect
- reasoning: Sub-millisecond reads for session tokens, TTL support built-in.

## D-004 — Reject GraphQL — use REST
- date: 2026-01-15
- gate: architect
- reasoning: Team unfamiliar with GraphQL; REST well-understood; tooling simpler.

## D-005 — Use BullMQ for background jobs
- date: 2026-01-20
- gate: architect
- reasoning: Node-native queue, built-in dashboard, retry semantics.

## D-006 — TDD enforced at gate:ship
- date: 2026-01-25
- gate: qa-engineer
- reasoning: Test coverage delta must be ≥0 for any PR to merge.
`;

const LESSONS_FIXTURE = `## pattern: always-validate-webhook-signature
date: 2026-03-01
task: add Stripe webhooks
archetypes: commerce
confidence: high
what: Stripe webhook calls must validate the Wh-Signature header before processing.
why: Without validation any caller can trigger order fulfillment.

## pattern: redis-ttl-on-session
date: 2026-03-05
task: fix auth bug
archetypes: saas
confidence: medium
what: Always set TTL on Redis session keys.
why: Leaked session keys without TTL are permanent — security risk.

## pattern: run-db-migrations-in-tx
date: 2026-03-10
task: add user table migration
archetypes: saas, fintech
confidence: high
what: Wrap every schema migration in a transaction.
why: Partial migration on failure leaves DB in inconsistent state.

## pattern: use-structured-logging
date: 2026-03-15
task: add observability
archetypes: saas, fintech, devops
confidence: medium
what: Use JSON structured logs instead of printf-style.
why: Enables log-based alerting, filtering, and dashboard queries.

## pattern: haiku-for-lightweight-agents
date: 2026-04-01
task: optimize agent costs
archetypes: ai-system
confidence: high
what: Use Haiku for high-frequency, low-complexity agent calls.
why: 3× cheaper than Sonnet for tasks that don't require deep reasoning.
`;

function runFilter(args, env = {}) {
  const r = spawnSync('node', [FILTER, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', ...env },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

function withTempFile(name, content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-memfilter-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return fn(path);
}

// ─── Unit tests (module API) ──────────────────────────────────────────────────

test('parseEntries splits decisions.md into correct entries', async () => {
  const { parseEntries } = await import('../scripts/memory-filter.mjs');
  const entries = parseEntries(DECISIONS_FIXTURE);
  assert.equal(entries.length, 6);
  assert.equal(entries[0].heading, 'D-001 — Use Postgres for primary store');
  assert.equal(entries[1].heading, 'D-002 — Use Stripe for payments');
  assert.equal(entries[5].heading, 'D-006 — TDD enforced at gate:ship');
});

test('parseEntries handles lessons.md with ## headings', async () => {
  const { parseEntries } = await import('../scripts/memory-filter.mjs');
  const entries = parseEntries(LESSONS_FIXTURE);
  assert.equal(entries.length, 5);
  assert.match(entries[0].heading, /always-validate-webhook-signature/);
});

test('parseEntries returns [] for empty content', async () => {
  const { parseEntries } = await import('../scripts/memory-filter.mjs');
  assert.deepEqual(parseEntries(''), []);
  assert.deepEqual(parseEntries('\n\n'), []);
});

test('heuristicFilter returns top-k relevant entries', async () => {
  const { parseEntries, heuristicFilter } = await import('../scripts/memory-filter.mjs');
  const entries = parseEntries(DECISIONS_FIXTURE);

  const result = heuristicFilter('add Stripe payments webhook', entries, 2);
  assert.equal(result.length, 2);
  // D-002 (Stripe) should rank first
  assert.match(result[0].heading, /Stripe/);
});

test('heuristicFilter respects k limit', async () => {
  const { parseEntries, heuristicFilter } = await import('../scripts/memory-filter.mjs');
  const entries = parseEntries(DECISIONS_FIXTURE);
  const result = heuristicFilter('Postgres database migration', entries, 1);
  assert.equal(result.length, 1);
});

test('heuristicFilter handles k > entries.length gracefully', async () => {
  const { parseEntries, heuristicFilter } = await import('../scripts/memory-filter.mjs');
  const entries = parseEntries(DECISIONS_FIXTURE);
  const result = heuristicFilter('anything', entries, 100);
  assert.equal(result.length, entries.length);
});

test('filterMemory returns passthrough when entries <= k', async () => {
  const { filterMemory } = await import('../scripts/memory-filter.mjs');
  const tiny = '## D-001 — Postgres\n- reasoning: fast.\n\n## D-002 — Redis\n- reasoning: fast.\n';
  const result = await filterMemory('auth bug', tiny, { k: 5 });
  assert.equal(result.mode, 'passthrough');
  assert.equal(result.count, 2);
  assert.equal(result.total, 2);
});

test('filterMemory returns empty for empty content', async () => {
  const { filterMemory } = await import('../scripts/memory-filter.mjs');
  const result = await filterMemory('any task', '', { k: 3 });
  assert.equal(result.mode, 'empty');
  assert.equal(result.count, 0);
  assert.equal(result.filtered, '');
});

test('filterMemory heuristic-only flag works', async () => {
  const { filterMemory } = await import('../scripts/memory-filter.mjs');
  const result = await filterMemory('add Redis cache for sessions', DECISIONS_FIXTURE, {
    k: 2,
    heuristicOnly: true,
  });
  assert.equal(result.mode, 'heuristic');
  assert.ok(result.count <= 2);
  // Redis entry should appear
  assert.match(result.filtered, /Redis/);
});

test('filterMemory filtered output contains full entry text', async () => {
  const { filterMemory } = await import('../scripts/memory-filter.mjs');
  const result = await filterMemory('TDD enforcement code review', DECISIONS_FIXTURE, {
    k: 2,
    heuristicOnly: true,
  });
  // Full entry body should be present, not just headings
  assert.match(result.filtered, /gate:ship/);
});

// ─── CLI tests ────────────────────────────────────────────────────────────────

test('CLI --help exits 0 and prints usage', () => {
  const r = runFilter(['--help']);
  assert.equal(r.exit, 0);
  assert.match(r.stdout, /Usage/);
});

test('CLI exits 1 with no args', () => {
  const r = runFilter([]);
  assert.equal(r.exit, 1);
});

test('CLI exits 0 gracefully when file does not exist', () => {
  const r = runFilter(['task title', '/tmp/no-such-file-gcto-test.md']);
  assert.equal(r.exit, 0);
  assert.equal(r.stdout.trim(), '');
});

test('CLI filters decisions.md and returns relevant entries', () => {
  withTempFile('decisions.md', DECISIONS_FIXTURE, (path) => {
    const r = runFilter(['add Stripe webhook integration', path, '--k=2', '--heuristic']);
    assert.equal(r.exit, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Stripe/);
    // Should not dump all 6 entries
    const entryCount = (r.stdout.match(/^## /gm) || []).length;
    assert.ok(entryCount <= 2, `expected ≤2 entries, got ${entryCount}`);
  });
});

test('CLI filters lessons.md and returns relevant entries', () => {
  withTempFile('lessons.md', LESSONS_FIXTURE, (path) => {
    const r = runFilter(['fix auth bug session token', path, '--k=2', '--heuristic']);
    assert.equal(r.exit, 0);
    // redis-ttl-on-session should rank high
    assert.match(r.stdout, /redis-ttl|session/i);
  });
});

test('CLI --stats writes count to stderr', () => {
  withTempFile('decisions.md', DECISIONS_FIXTURE, (path) => {
    const r = runFilter(['postgres database', path, '--k=2', '--stats', '--heuristic']);
    assert.equal(r.exit, 0);
    assert.match(r.stderr, /memory-filter:.*\/6/);
  });
});

test('CLI passthrough when all entries fit within k', () => {
  const tiny = '## D-001\n- a\n\n## D-002\n- b\n';
  withTempFile('tiny.md', tiny, (path) => {
    const r = runFilter(['anything', path, '--k=10']);
    assert.equal(r.exit, 0);
    const entryCount = (r.stdout.match(/^## /gm) || []).length;
    assert.equal(entryCount, 2);
  });
});

test('GREAT_CTO_DISABLE_MEMORY_FILTER does not affect script (filter still runs)', () => {
  // The disable flag is an agent-level opt-out via env check in bash blocks,
  // not inside the script itself — script always runs when called directly.
  withTempFile('decisions.md', DECISIONS_FIXTURE, (path) => {
    const r = runFilter(['redis cache', path, '--k=2', '--heuristic'], {
      GREAT_CTO_DISABLE_MEMORY_FILTER: '1',
    });
    // Script ignores this flag; agent bash block checks it before calling script
    assert.equal(r.exit, 0);
  });
});
