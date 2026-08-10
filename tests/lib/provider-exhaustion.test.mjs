// A 75-file run spent $13.99, ran out of credits at file 58, and then made 147
// more calls that could not possibly succeed — one per remaining case, each
// returning the same 402.
//
// The dropout gate did its job and reported thirteen files as NOT MEASURED
// rather than as scores. But the run had already written those thirteen into
// results-history.jsonl with `rate: 0`, and eval-drift reads `rate`. The next
// comparison would have seen thirteen evals collapse from ~0.85 to zero
// overnight and alarmed on an empty wallet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderError, exhaustionReport, admissibleToHistory } from '../../scripts/lib/provider-exhaustion.mjs';

test('out of credits is terminal — no retry inside this run can help', () => {
  const c = classifyProviderError(new Error('OpenRouter API 402: {"error":{"message":"Insufficient credits, or ..."}}'));
  assert.equal(c.terminal, true);
  assert.equal(c.kind, 'credits');
});

test('a bad key is terminal too', () => {
  assert.equal(classifyProviderError(new Error('OpenRouter API 401: invalid api key')).kind, 'auth');
  assert.equal(classifyProviderError(new Error('OpenRouter API 401: invalid api key')).terminal, true);
});

test('rate limiting is NOT terminal — it resolves on its own', () => {
  // The distinction that matters is not the status code but whether waiting
  // could change the answer. Treating 429 as terminal would abandon a run over
  // the provider asking us to slow down.
  const c = classifyProviderError(new Error('OpenRouter API 429: rate limit exceeded'));
  assert.equal(c.terminal, false);
  assert.equal(c.kind, 'rate-limit');
});

test('an unrecognised failure is transient, not terminal', () => {
  // Polarity: guessing "terminal" on an unknown error abandons a paid run. The
  // safe default is to carry on and let the dropout gate judge the result.
  const c = classifyProviderError(new Error('socket hang up'));
  assert.equal(c.terminal, false);
  assert.equal(c.kind, 'transient');
});

test('a 402 inside a response body is not the status of the call', () => {
  // The body of a 200 can contain any number. Matching bare digits anywhere
  // would abandon a healthy run because a model mentioned one.
  const c = classifyProviderError(new Error('OpenRouter API 200: {"id":"gen-402-abc","text":"see RFC 402"}'));
  assert.equal(c.terminal, false, 'the status token is what classifies, not any digits in the body');
});

test('a null or empty error does not crash the classifier', () => {
  assert.equal(classifyProviderError(null).terminal, false);
  assert.equal(classifyProviderError('').terminal, false);
});

// ── What may become tomorrow's baseline ─────────────────────────────────────

test('a file cut short by dropout is not admissible to the trend history', () => {
  const r = { judged: 8, dropout: { severe: true, why: 'the last 25 case(s) never reached the provider' } };
  const a = admissibleToHistory(r);
  assert.equal(a.ok, false);
  assert.match(a.why, /never reached the provider/);
});

test('a file where nothing was judged is not admissible either', () => {
  assert.equal(admissibleToHistory({ judged: 0 }).ok, false);
});

test('an ordinary result is admissible', () => {
  assert.equal(admissibleToHistory({ judged: 12, dropout: { severe: false } }).ok, true);
});

test('a missing dropout field does not block a real result', () => {
  // Rows predate the field. Absent must mean "no dropout recorded", not "assume
  // the worst" — that would silently empty the baseline.
  assert.equal(admissibleToHistory({ judged: 5 }).ok, true);
});

test('the stop report names the money, because that is the next question', () => {
  const out = exhaustionReport({ kind: 'credits', why: 'out of credits', completed: 58, total: 75, costUsd: 13.992 });
  assert.match(out, /\$13\.99/);
  assert.match(out, /58 of 75/);
  assert.match(out, /NOT MEASURED/);
  assert.match(out, /not zeros/);
});

test('an unrecorded cost says so rather than printing $0.00', () => {
  const out = exhaustionReport({ kind: 'credits', why: 'x', completed: 1, total: 2, costUsd: null });
  assert.match(out, /unrecorded amount/);
  assert.doesNotMatch(out, /\$0\.00/);
});
