// Tests: measure real cost from a transcript, cache tokens included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageFromTranscript } from '../../scripts/lib/usage-from-transcript.mjs';
import { costForUsage , priceForModel } from '../../scripts/lib/cost-meter.mjs';

const fixture = [
  JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5', usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),
  JSON.stringify({ type: 'user', message: { content: 'hi' } }),                       // ignored
  JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5', usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 40000, cache_read_input_tokens: 10000 } } }),
  JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } }), // $0
  'not json',                                                                          // ignored
].join('\n');

test('sums real usage across assistant turns, skips non-assistant/synthetic', () => {
  const r = usageFromTranscript(fixture);
  assert.equal(r.turns, 2, 'two priced assistant turns');
  assert.equal(r.input_tokens, 1200);
  assert.equal(r.output_tokens, 600);
  assert.equal(r.cache_creation_input_tokens, 40000);
  assert.equal(r.cache_read_input_tokens, 10000);
  assert.ok(r.usd > 0);
});

test('cache tokens are priced (write 1.25x, read 0.1x input)', () => {
  // Derived from the price table, not hardcoded.
  //
  // This asserted $0.1551, a figure that only held while `claude-sonnet-5` fell
  // through the family fallback to Sonnet 4's $3/$15. Sonnet 5 is $2/$10, so the
  // test was pinning a wrong price as correct behaviour and would have blocked
  // the fix for it. A test that encodes a rate cannot also guard the rate.
  const usage = { input_tokens: 200, output_tokens: 100,
                  cache_creation_input_tokens: 40000, cache_read_input_tokens: 10000 };
  const p = priceForModel('claude-sonnet-5');
  const expected = (usage.input_tokens * p.input
                  + usage.output_tokens * p.output
                  + usage.cache_creation_input_tokens * p.input * 1.25
                  + usage.cache_read_input_tokens * p.input * 0.1) / 1e6;
  const only = usageFromTranscript(JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5', usage } }));
  assert.ok(Math.abs(only.usd - expected) < 1e-4, `got ${only.usd}, expected ${expected}`);
});

test('ignoring cache tokens would badly under-count (regression guard)', () => {
  const usage = { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 40000, cache_read_input_tokens: 10000 };
  const withCache = costForUsage({ model: 'claude-sonnet-5', usage });
  const withoutCache = costForUsage({ model: 'claude-sonnet-5', usage: { input_tokens: 200, output_tokens: 100 } });
  assert.ok(withCache > withoutCache * 20, 'cache tokens dominate the real cost');
});

test('empty / malformed input is safe ($0, no throw)', () => {
  assert.equal(usageFromTranscript('').usd, 0);
  assert.equal(usageFromTranscript('garbage\nlines\n').usd, 0);
  assert.equal(usageFromTranscript('/no/such/path.jsonl').usd, 0);
});

test('by_model breakdown', () => {
  const r = usageFromTranscript(fixture);
  assert.ok(r.by_model['claude-sonnet-5']);
  assert.equal(r.by_model['claude-sonnet-5'].turns, 2);
});
