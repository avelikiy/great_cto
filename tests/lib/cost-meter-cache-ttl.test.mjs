// A 1-hour cache write bills at 2× the input price, a 5-minute one at 1.25×.
// Pricing every write at 1.25× understated long Claude Code sessions, which
// write the 1-hour cache (found by session-shape, 2026-09-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheWriteUsd, costForUsage } from '../../scripts/lib/cost-meter.mjs';

test('the TTL split is priced per TTL; without it the flat 5-minute rate stands', () => {
  const split = { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 600_000, ephemeral_5m_input_tokens: 400_000 } };
  assert.equal(cacheWriteUsd(split, 1), 600_000 * 2 + 400_000 * 1.25);
  assert.equal(cacheWriteUsd({ cache_creation_input_tokens: 1_000_000 }, 1), 1_250_000);
  assert.equal(cacheWriteUsd({ cache_creation_input_tokens: 1_000, cache_creation: { ephemeral_1h_input_tokens: 400 } }, 1), 400 * 2 + 600 * 1.25,
    'tokens the split does not name are priced at the 5-minute rate');
  assert.equal(cacheWriteUsd({}, 1), 0);
});

test('a call that wrote only the 1-hour cache costs 2× input for the write', () => {
  const prices = { 'test-model': { input: 10, output: 50 } };
  const usd = costForUsage({ model: 'test-model', prices, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 } } });
  assert.equal(usd, 20);
});
