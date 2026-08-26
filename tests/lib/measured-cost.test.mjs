// Four defects that together made every agent cost $0.00 while the real spend
// sat measured on the same disk. Each test below is one of them, phrased as the
// property that was violated rather than as an expected string.
//
// The chain: a hook measures token usage from the session transcript, prices it,
// and appends a line to cost-history.log; the board reads that line and enriches
// the verdict, which has no cost of its own because agents do not measure
// themselves. Every link was present. Three were broken and one was mislabelled,
// and the result looked exactly like a project that had never been measured.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readVerdicts } from '../../packages/board/lib/verdicts.mjs';
import { priceUsage, resolvePrice, DEFAULT_PRICES } from '../../scripts/lib/cost-meter.mjs';

const TS = '2026-08-26T10:00:00Z';

function project({ verdictCost = 0, history = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-cost-'));
  mkdirSync(join(root, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(root, '.great_cto/verdicts/senior-dev.log'),
    JSON.stringify({ v: 1, ts: TS, agent: 'senior-dev', verdict: 'APPROVED',
                     project: 't', cost_usd: verdictCost, meta: { feature: 'x' } }) + '\n');
  if (history !== null) writeFileSync(join(root, '.great_cto/cost-history.log'), history);
  return root;
}

// ── defect 1: a self-reported zero shadowed the measured figure ──────────────

test('a measured cost replaces a self-reported zero', () => {
  const root = project({ verdictCost: 0, history: `${TS} senior-dev 1.2345 turns=42\n` });
  const [v] = readVerdicts(root);
  assert.equal(v.cost_usd, 1.2345, 'zero is the absence of a measurement, not a measurement of zero');
  assert.equal(v.cost_source, 'measured');
});

test('a non-zero figure the agent did report is left alone', () => {
  const root = project({ verdictCost: 0.5, history: `${TS} senior-dev 9.99 turns=1\n` });
  const [v] = readVerdicts(root);
  assert.equal(v.cost_usd, 0.5, 'only an absent figure is filled in');
});

// ── defect 2: the writer put an entire JSON verdict in the timestamp column ──

test('a line whose timestamp column holds a JSON verdict is refused, not half-read', () => {
  const junk = `{"v":1,"ts":"${TS}","agent":"qa"} senior-dev 9286.5251\n`;
  const root = project({ verdictCost: 0, history: junk });
  const [v] = readVerdicts(root);
  assert.equal(v.cost_usd, 0, 'the corrupt era must not be imported');
  assert.notEqual(v.cost_source, 'measured');
});

test('the legacy space-delimited format still reads', () => {
  const root = project({ verdictCost: 0, history: `${TS} senior-dev 0.30\n` });
  assert.equal(readVerdicts(root)[0].cost_usd, 0.3);
});

test('a trailing provenance field does not break parsing', () => {
  const root = project({ verdictCost: 0, history: `${TS} senior-dev 0.77 turns=9\n` });
  assert.equal(readVerdicts(root)[0].cost_usd, 0.77);
});

// ── defect 3: a zero in the history file was labelled "measured" ─────────────

test('a zero in the history file is not a measurement either', () => {
  const root = project({ verdictCost: 0, history: `${TS} senior-dev 0\n` });
  const [v] = readVerdicts(root);
  assert.notEqual(v.cost_source, 'measured',
    'log-verdict.sh writes through what the agent reported — which is nothing');
});

// ── defect 4: an unpriced model cost nothing instead of being unpriced ───────

test('a model nobody has priced is unpriced, not free', () => {
  const r = priceUsage({ model: 'some-model-nobody-listed', usage: { input_tokens: 1e6 } });
  assert.equal(r.priced, false);
  assert.equal(r.usd, 0);
  assert.equal(r.source, 'none', 'the caller must be able to tell this apart from a cheap model');
});

test('a family guess is priced but flagged as a guess', () => {
  const r = priceUsage({ model: 'claude-opus-99-unreleased', usage: { input_tokens: 1e6 } });
  assert.equal(r.priced, true);
  assert.equal(r.assumed, true, 'billing an unknown Opus at a known Opus rate is an assumption');
});

test('the current models are priced exactly, not by family guess', () => {
  for (const id of ['claude-opus-5', 'claude-fable-5', 'claude-sonnet-5', 'claude-opus-4-8']) {
    const r = priceUsage({ model: id, usage: { input_tokens: 1e6 } });
    assert.equal(r.assumed, false, `${id} must not fall through to the family rate`);
    assert.equal(r.source, 'exact');
  }
});

test('Opus 5 is not billed at the Opus 4 rate', () => {
  // The defect that made one session read $9,485 instead of $3,375: /opus/i
  // matched, and the fallback charged $15/$75 for a $5/$25 model.
  assert.equal(DEFAULT_PRICES['claude-opus-5'].input, 5);
  assert.equal(DEFAULT_PRICES['claude-opus-5'].output, 25);
  assert.notDeepEqual(resolvePrice('claude-opus-5').price, DEFAULT_PRICES['claude-opus-4']);
});

test('cache tokens are billed at their own multipliers, not as fresh input', () => {
  const base = priceUsage({ model: 'claude-opus-5', usage: { input_tokens: 1_000_000 } }).usd;
  const read = priceUsage({ model: 'claude-opus-5', usage: { cache_read_input_tokens: 1_000_000 } }).usd;
  const write = priceUsage({ model: 'claude-opus-5', usage: { cache_creation_input_tokens: 1_000_000 } }).usd;
  assert.ok(Math.abs(read - base * 0.1) < 1e-9, 'cache read is 0.1x input');
  assert.ok(Math.abs(write - base * 1.25) < 1e-9, 'cache write is 1.25x input');
});
