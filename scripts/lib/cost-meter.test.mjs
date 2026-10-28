// scripts/lib/cost-meter.test.mjs — unit tests for cost-meter (no network/disk/env).
// Run: node --test scripts/lib/cost-meter.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { priceForModel, costForUsage, priceUsage, resolvePrice, round4, DEFAULT_PRICES } from './cost-meter.mjs';

const PRICES = {
  'claude-opus-4':   { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3,  output: 15 },
  'claude-haiku-4':  { input: 0.8, output: 4 },
};

test('priceForModel: exact key match', () => {
  assert.deepEqual(priceForModel('claude-opus-4', PRICES), { input: 15, output: 75 });
});

test('priceForModel: longest-prefix match for versioned id', () => {
  assert.deepEqual(priceForModel('claude-opus-4-8-20260101', PRICES), { input: 15, output: 75 });
  assert.deepEqual(priceForModel('claude-sonnet-4-5', PRICES), { input: 3, output: 15 });
});

test('priceForModel: family heuristic when no key matches', () => {
  assert.deepEqual(priceForModel('some-future-opus-model', PRICES), { input: 15, output: 75 });
  assert.deepEqual(priceForModel('mystery-haiku', PRICES), { input: 0.8, output: 4 });
});

test('priceForModel: unknown → null', () => {
  assert.equal(priceForModel('gpt-4', PRICES), null);
  assert.equal(priceForModel('', PRICES), null);
  assert.equal(priceForModel(null, PRICES), null);
});

test('costForUsage: opus 1000 in / 500 out = $0.0525', () => {
  const cost = costForUsage({ model: 'claude-opus-4', usage: { input_tokens: 1000, output_tokens: 500 }, prices: PRICES });
  // (1000*15 + 500*75) / 1e6 = (15000 + 37500)/1e6 = 0.0525
  assert.equal(round4(cost), 0.0525);
});

test('costForUsage: sonnet 10000 in / 2000 out = $0.06', () => {
  const cost = costForUsage({ model: 'claude-sonnet-4-5', usage: { input_tokens: 10000, output_tokens: 2000 }, prices: PRICES });
  // (10000*3 + 2000*15)/1e6 = (30000+30000)/1e6 = 0.06
  assert.equal(round4(cost), 0.06);
});

test('costForUsage: null usage or unknown model → 0', () => {
  assert.equal(costForUsage({ model: 'claude-opus-4', usage: null, prices: PRICES }), 0);
  assert.equal(costForUsage({ model: 'gpt-4', usage: { input_tokens: 100, output_tokens: 100 }, prices: PRICES }), 0);
});

test('costForUsage: missing token fields default to 0', () => {
  assert.equal(costForUsage({ model: 'claude-opus-4', usage: {}, prices: PRICES }), 0);
  const onlyIn = costForUsage({ model: 'claude-opus-4', usage: { input_tokens: 1_000_000 }, prices: PRICES });
  assert.equal(round4(onlyIn), 15);
});

test('DEFAULT_PRICES covers the eval runner default models (opus + sonnet families)', () => {
  assert.ok(priceForModel('claude-opus-4-5', DEFAULT_PRICES));
  assert.ok(priceForModel('claude-sonnet-4-5', DEFAULT_PRICES));
});

// ── OpenRouter slugs (provider/ prefix) ───────────────────────────────────────

test('priceForModel: OpenRouter "anthropic/claude-sonnet-4" strips prefix → sonnet price', () => {
  assert.deepEqual(priceForModel('anthropic/claude-sonnet-4', PRICES), { input: 3, output: 15 });
});

test('priceForModel: OpenRouter "anthropic/claude-haiku-4.5" → haiku family', () => {
  assert.deepEqual(priceForModel('anthropic/claude-haiku-4.5', PRICES), { input: 0.8, output: 4 });
});

test('priceForModel: full OpenRouter slug key matches exactly (kimi-k2)', () => {
  assert.ok(priceForModel('moonshotai/kimi-k2', DEFAULT_PRICES));
});

test('costForUsage: prices an OpenRouter anthropic slug', () => {
  const cost = costForUsage({ model: 'anthropic/claude-sonnet-4', usage: { input_tokens: 10000, output_tokens: 2000 }, prices: PRICES });
  assert.equal(round4(cost), 0.06);
});

const KIMI = 'moonshotai/kimi-k3.1-pro';
const kimiUsage = () => ({ prompt_tokens: 1000, completion_tokens: 200,
  prompt_tokens_details: { cached_tokens: 400 }, completion_tokens_details: { reasoning_tokens: 50 }, cost: 0.005 });

test('Kimi standard and canonical identities have exact advertised rates', () => {
  for (const model of [KIMI, `${KIMI}-20261023`]) {
    assert.deepEqual(resolvePrice(model, DEFAULT_PRICES), {
      price: { input: 2, output: 10, cacheRead: 0.2 }, source: 'exact',
    });
  }
  for (const model of [`${KIMI}-highspeed`, `${KIMI}-future`, 'other/kimi-k3.1-pro']) {
    assert.equal(resolvePrice(model, DEFAULT_PRICES).price, null);
  }
});

test('Kimi cache reads are a prompt subset and reasoning is already in completion', () => {
  const p = priceUsage({ model: KIMI, usage: kimiUsage(), prices: DEFAULT_PRICES });
  assert.equal(p.usd, 0.00328);
  assert.equal(p.priced, true);
  assert.equal(p.source, 'exact');
  assert.equal(p.providerReportedUsd, 0.005);
  assert.equal(p.costState, 'known');
  assert.equal(p.costProvenance, 'calculated-standard-token-rates');
  assert.equal(costForUsage({ model: KIMI, usage: kimiUsage(), prices: DEFAULT_PRICES }), p.usd);
});

test('Kimi partial or invalid usage stays Unknown, including absent zero counters', () => {
  for (const usage of [null, {}, { prompt_tokens: 1000, completion_tokens: 200 },
    { ...kimiUsage(), prompt_tokens: -1 }, { ...kimiUsage(), completion_tokens: NaN },
    { ...kimiUsage(), prompt_tokens_details: { cached_tokens: 1001 } },
    { ...kimiUsage(), completion_tokens_details: { reasoning_tokens: 201 } }]) {
    const p = priceUsage({ model: KIMI, usage, prices: DEFAULT_PRICES });
    assert.equal(p.priced, false);
    assert.equal(p.usd, null);
    assert.equal(p.costState, 'unknown');
  }
  const zero = { prompt_tokens: 0, completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } };
  assert.equal(priceUsage({ model: KIMI, usage: zero, prices: DEFAULT_PRICES }).usd, 0);
});

test('Kimi rejects contradictory or invalid present total token counts', () => {
  for (const model of [KIMI, `${KIMI}-20261023`]) {
    for (const total_tokens of [1, -1, 1200.5, '1200', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const usage = { ...kimiUsage(), total_tokens };
      const p = priceUsage({ model, usage, prices: DEFAULT_PRICES });
      assert.equal(p.usd, null, `invalid total ${String(total_tokens)} must not be priced`);
      assert.equal(p.priced, false);
      assert.equal(p.usageState, 'unknown');
      assert.equal(p.costState, 'unknown');
      assert.equal(costForUsage({ model, usage, prices: DEFAULT_PRICES }), null);
    }
    const p = priceUsage({ model, usage: { ...kimiUsage(), total_tokens: 1200 }, prices: DEFAULT_PRICES });
    assert.equal(p.usd, 0.00328);
    assert.equal(p.priced, true);
    assert.equal(p.usageState, 'known');
    assert.equal(p.costState, 'known');
  }
});

test('Kimi rejects invalid present provider cost rather than treating it as absent', () => {
  for (const model of [KIMI, `${KIMI}-20261023`]) {
    for (const cost of [-1, NaN, Infinity, -Infinity, '0.005', null, undefined]) {
      const usage = { ...kimiUsage(), cost };
      const p = priceUsage({ model, usage, prices: DEFAULT_PRICES });
      assert.equal(p.usd, null, `invalid cost ${String(cost)} must not be priced`);
      assert.equal(p.priced, false);
      assert.equal(p.providerReportedUsd, null);
      assert.equal(p.usageState, 'unknown');
      assert.equal(p.costState, 'unknown');
      assert.equal(costForUsage({ model, usage, prices: DEFAULT_PRICES }), null);
    }
    for (const cost of [0, 0.005]) {
      const p = priceUsage({ model, usage: { ...kimiUsage(), cost }, prices: DEFAULT_PRICES });
      assert.equal(p.usd, 0.00328);
      assert.equal(p.providerReportedUsd, cost);
      assert.equal(p.costState, 'known');
    }
    const usage = kimiUsage(); delete usage.cost;
    const p = priceUsage({ model, usage, prices: DEFAULT_PRICES });
    assert.equal(p.usd, 0.00328);
    assert.equal(p.providerReportedUsd, null);
    assert.equal(p.costState, 'known');
  }
});

test('cost CLI cannot print a measured zero for incomplete Kimi usage', () => {
  const r = spawnSync(process.execPath, [new URL('./cost-meter.mjs', import.meta.url).pathname,
    '--model', KIMI, '--in', '1000', '--out', '200'], { encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_MODEL_PRICES: JSON.stringify(DEFAULT_PRICES) } });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
});
