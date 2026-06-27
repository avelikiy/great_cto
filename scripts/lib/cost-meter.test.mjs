// scripts/lib/cost-meter.test.mjs — unit tests for cost-meter (no network/disk/env).
// Run: node --test scripts/lib/cost-meter.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceForModel, costForUsage, round4, DEFAULT_PRICES } from './cost-meter.mjs';

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
