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

// ── A locked account is not a blip ──────────────────────────────────────────
//
// "your account is locked due to a billing issue" classified as `transient`,
// which means "retry, this resolves". It does not resolve. This repository's own
// GitHub Actions have been refused with that exact message since 2026-06-25 —
// one hundred consecutive runs, every one of them failing identically, none of
// them able to succeed until a human pays a bill.
//
// That is the same shape as the 402 this module was written for: a state where
// every remaining call fails the same way, and calling again is not optimism but
// waste. The distinction is the whole point of the module, and billing was on
// the wrong side of it.
//
// Found by reading MaxMiksa/Auto-Company, whose usage-limit check greps for
// `billing` alongside `quota` and `overloaded`. It treats them all as one bucket
// — we keep the three-way split and only move this one across.
test('an account locked for billing is terminal, not transient', () => {
  const r = classifyProviderError('your account is locked due to a billing issue');
  assert.equal(r.terminal, true,
    'a billing lock does not clear on its own — retrying spends attempts on a certainty');
  assert.match(r.why, /billing|pay|bill/i, 'the reason must name what a human has to do');
});

test('a billing lock is told apart from running out of credits', () => {
  // Both are terminal and both need a human, but they need DIFFERENT humans doing
  // different things: topping up a balance is not the same as unlocking an
  // account, and a message that conflates them sends someone to the wrong screen.
  const locked = classifyProviderError('your account is locked due to a billing issue');
  const empty = classifyProviderError('API 402 insufficient credits');
  assert.equal(locked.terminal, true);
  assert.equal(empty.terminal, true);
  assert.notEqual(locked.kind, empty.kind, 'a lock and an empty balance are different states');
});

test('overload and rate limits stay transient — they really do clear', () => {
  // The counter-case, so the fix cannot drift into "any provider complaint is
  // terminal", which would stop runs that would have succeeded on the next call.
  for (const msg of ['API 529 overloaded_error: Overloaded', 'API 429 rate limit', 'Error: resource_exhausted']) {
    assert.equal(classifyProviderError(msg).terminal, false, `${msg} must stay retryable`);
  }
});

test('every wording of a locked account is recognised, not just the one we met', () => {
  // Mutation found this: breaking one alternative of the pattern left the suite
  // green, because a single example exercised only one branch. Providers phrase
  // the same state differently, and a pattern with an untested alternative is an
  // alternative that can rot without anyone noticing.
  for (const msg of [
    'your account is locked due to a billing issue',   // GitHub Actions, verbatim
    'Account is locked. Please contact support.',
    'billing problem — access disabled',
    'Your billing has been suspended',
  ]) {
    const r = classifyProviderError(msg);
    assert.equal(r.terminal, true, `not recognised as terminal: ${msg}`);
    assert.equal(r.kind, 'billing', `not classified as billing: ${msg}`);
  }
});
