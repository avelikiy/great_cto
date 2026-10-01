// Tests for scripts/lib/cost-history.mjs — the one reader of cost-history.log.
//
// Three writers put rows in that file and they mean different things:
//   log-verdict.sh                  `<ts> <agent> <usd>`                 one run
//   subagent-stop, agent transcript `<ts> <agent> <usd> turns=N … model=` one run
//   subagent-stop, legacy host      `<ts> <agent> <usd> turns=N`          the session's
//                                                                          running total
// Before this module, cost-guard looked for `cost_usd=N` (no writer emits it, so
// every budget compared against $0) and the two summing readers treated every
// `turns=` row as a running total (so consecutive runs of one agent under-counted).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costRows, sumCostHistory, spendWindows } from '../../scripts/lib/cost-history.mjs';

test('a plain row is one run', () => {
  const r = sumCostHistory('2026-09-30T10:00:00Z architect 0.50\n2026-09-30T11:00:00Z senior-dev 1.25\n');
  assert.deepEqual(r, { sum: 1.75, rows: 2 });
});

test('malformed lines and a "-" cost (log-verdict with no cost) are skipped', () => {
  const r = sumCostHistory([
    'malformed',
    '2026-09-30T10:00:00Z qa -',
    '2026-09-30T10:00:00Z qa notanumber',
    '',
    '2026-09-30T10:00:00Z qa 2',
  ].join('\n'));
  assert.deepEqual(r, { sum: 2, rows: 1 });
});

// The rows this repository's log actually holds since 2026-09-11: each one is the
// cost of ONE agent run, read from that agent's own transcript. Two runs of the
// same agent are two costs. The old increment rule counted 6.40 + (11.55 - 6.40).
test('rows with model= are per-run measurements and add up in full', () => {
  const r = sumCostHistory([
    '2026-09-27T14:49:26Z general-purpose 6.403 turns=54 in=108 out=10733 cache_r=7080131 cache_w=415046 model=unverifiable served=claude-opus-5-5',
    '2026-09-28T02:53:27Z general-purpose 11.5452 turns=99 in=198 out=19248 cache_r=17240960 cache_w=390802 model=unverifiable served=claude-opus-5-5',
  ].join('\n'));
  assert.equal(r.sum, 17.95);
});

test('legacy turns= rows without model= are running totals, summed by increment', () => {
  const r = sumCostHistory([
    '2026-08-17T12:32:39Z qa-engineer 3385.111 turns=9013',
    '2026-08-17T12:32:39Z qa-engineer 3392.0572 turns=9033',
    '2026-08-17T12:32:39Z qa-engineer 3405.2423 turns=9069',
  ].join('\n'));
  assert.equal(r.sum, 3405.24);
});

test('a running total that drops is a new session and counts in full', () => {
  const r = sumCostHistory([
    '2026-08-17T10:00:00Z qa-engineer 10 turns=100',
    '2026-08-17T11:00:00Z qa-engineer 14 turns=140',
    '2026-08-17T12:00:00Z qa-engineer 3 turns=30',
  ].join('\n'));
  assert.equal(r.sum, 17);
});

test('costRows gives each row its date and the dollars it contributes', () => {
  const rows = costRows([
    '2026-09-29T23:59:00Z qa 1 turns=10',
    '2026-09-30T00:10:00Z qa 4 turns=40',
  ].join('\n'));
  assert.deepEqual(rows.map((r) => [r.date, r.usd]), [['2026-09-29', 1], ['2026-09-30', 3]]);
});

test('spendWindows splits today, this month and all time (UTC dates)', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const w = spendWindows([
    '2026-08-31T10:00:00Z architect 5',
    '2026-09-01T10:00:00Z architect 2',
    '2026-09-30T09:00:00Z senior-dev 1.5 turns=20 model=match',
    '2026-09-30T10:00:00Z senior-dev 2.5 turns=30 model=match',
  ].join('\n'), now);
  assert.deepEqual(w, { spentToday: 4, spentMonth: 6, spentAll: 11 });
});

test('a running-total increment that crosses midnight counts on the day it was spent', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const w = spendWindows([
    '2026-09-29T23:00:00Z qa 10 turns=100',
    '2026-09-30T01:00:00Z qa 12 turns=120',
  ].join('\n'), now);
  assert.equal(w.spentToday, 2, 'only the $2 spent after midnight is today\'s');
});

test('empty or missing text is zero spend, not an error', () => {
  assert.deepEqual(sumCostHistory(''), { sum: 0, rows: 0 });
  assert.deepEqual(spendWindows(null, new Date()), { spentToday: 0, spentMonth: 0, spentAll: 0 });
});

test('CLI prints one window as a two-decimal figure, and $0.00 with no log', async (t) => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cli = new URL('../../scripts/lib/cost-history.mjs', import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), 'cost-history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'cost-history.log');
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(log, `${now} qa 1.5\n${now} architect 2 turns=9 model=match\n`);
  assert.equal(execFileSync('node', [cli, 'today', log], { encoding: 'utf8' }).trim(), '3.50');
  assert.equal(execFileSync('node', [cli, 'month', join(dir, 'absent.log')], { encoding: 'utf8' }).trim(), '0.00');
  assert.deepEqual(JSON.parse(execFileSync('node', [cli, '--json', log], { encoding: 'utf8' })),
    { spentToday: 3.5, spentMonth: 3.5, spentAll: 3.5 });
});

// devops appends a fourth kind of row to the same file: monthly INFRASTRUCTURE
// estimates, pipe-delimited, read by /digest cost and /inbox. They are not LLM
// spend. A numeric service name put one in the LLM total until 2026-10-01.
test('pipe-delimited infrastructure rows are not LLM spend, whatever the service is called', () => {
  const r = sumCostHistory([
    '# Cost history — append only. Format: ISO8601 | service | estimated_usd_month | actual_usd_month | source | feature',
    '2026-10-01T10:00:00Z | api | 120 | - | arch-estimate | checkout',
    '2026-10-01T10:00:00Z | 42 | 120 | 95 | console | checkout',
    '2026-10-01T11:00:00Z qa 1.5',
  ].join('\n'));
  assert.deepEqual(r, { sum: 1.5, rows: 1 });
});
