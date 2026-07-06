// Tests: measure real cost from a transcript, cache tokens included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageFromTranscript } from '../../scripts/lib/usage-from-transcript.mjs';
import { costForUsage } from '../../scripts/lib/cost-meter.mjs';

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
  // sonnet input=3/Mtok. turn2 alone: 200*3 + 100*15 + 40000*3*1.25 + 10000*3*0.1
  //  = 600 + 1500 + 150000 + 3000 = 155100 / 1e6 = $0.1551
  const only = usageFromTranscript(JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5', usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 40000, cache_read_input_tokens: 10000 } } }));
  assert.ok(Math.abs(only.usd - 0.1551) < 1e-4, `got ${only.usd}`);
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
