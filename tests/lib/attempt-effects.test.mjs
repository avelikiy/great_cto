// Whether to retry depends on what the failed attempt already DID.
//
// `provider-exhaustion` answers "could retrying change the answer" — correct,
// and not sufficient. An agent that died after writing an ARCH document but
// before its verdict is not where one that died on its first token is, even with
// a byte-identical provider error. Re-dispatching the first makes a second
// architecture document that nothing downstream can tell from a clean first run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRetry, summariseEffects, observeEffects, describeRetry, UNKNOWN_EFFECTS } from '../../scripts/lib/attempt-effects.mjs';

const NONE = { wroteArtefacts: false, recordedVerdict: false, deliveredOutput: false };
const transient = { terminal: false, kind: 'transient', why: 'connection reset' };
const rateLimit = { terminal: false, kind: 'rate-limit', why: 'rate limited — this resolves on its own' };
const credits = { terminal: true, kind: 'credits', why: 'the provider account is out of credits' };

// ── The new axis wins over the old one ──────────────────────────────────────

test('a retryable error does NOT justify a retry when the attempt already wrote something', () => {
  // The whole point. Same error, opposite decision, because of what happened
  // before it — a second run would produce a duplicate artefact.
  const d = decideRetry({ classification: transient, effects: { ...NONE, wroteArtefacts: true } });
  assert.equal(d.action, 'stop-ambiguous');
  assert.match(d.why, /duplicates/);
});

test('the same error with nothing left behind fails over', () => {
  const d = decideRetry({ classification: transient, effects: NONE });
  assert.equal(d.action, 'failover');
});

test('a recorded verdict stops a retry, even on a rate limit', () => {
  const d = decideRetry({ classification: rateLimit, effects: { ...NONE, recordedVerdict: true } });
  assert.equal(d.action, 'stop-ambiguous');
  assert.match(d.why, /already recorded a verdict/);
});

test('delivered output stops a retry — a second answer would contradict the first', () => {
  const d = decideRetry({ classification: transient, effects: { ...NONE, deliveredOutput: true } });
  assert.equal(d.action, 'stop-ambiguous');
  assert.match(d.why, /contradict/);
});

// ── Fail-closed on the question itself ──────────────────────────────────────

test('effects that could not be established are treated as present', () => {
  // "We did not check" must never act like "it did not happen". The cost of a
  // wrong "no effects" is a duplicate nobody knows about; the cost of a wrong
  // "effects" is someone glancing at a directory.
  const d = decideRetry({ classification: transient, effects: UNKNOWN_EFFECTS });
  assert.equal(d.action, 'stop-ambiguous');
  assert.equal(d.effects, 'unknown');
  assert.match(d.why, /cannot establish/);
});

test('no effects argument at all is unknown, not none', () => {
  assert.equal(decideRetry({ classification: transient }).action, 'stop-ambiguous');
});

test('summariseEffects keeps none, some and unknown apart', () => {
  assert.equal(summariseEffects(NONE).state, 'none');
  assert.equal(summariseEffects({ ...NONE, wroteArtefacts: true }).state, 'some');
  assert.equal(summariseEffects({ ...NONE, wroteArtefacts: null }).state, 'unknown');
});

test('a known effect outranks an unknown one in the reported reason', () => {
  const s = summariseEffects({ wroteArtefacts: true, recordedVerdict: null, deliveredOutput: null });
  assert.equal(s.state, 'some', 'something definitely happened — that is the stronger fact');
});

// ── The existing axis still applies when nothing was left behind ────────────

test('terminal errors stop, and say retrying cannot help', () => {
  const d = decideRetry({ classification: credits, effects: NONE });
  assert.equal(d.action, 'stop-terminal');
  assert.match(d.why, /out of credits/);
});

test('a rate limit retries the same provider rather than failing over', () => {
  // Failing over on a rate limit spends a second provider's budget to dodge a
  // wait that was going to end anyway.
  assert.equal(decideRetry({ classification: rateLimit, effects: NONE }).action, 'retry-same');
});

test('automatic continuations are bounded, then a person decides', () => {
  assert.equal(decideRetry({ classification: transient, effects: NONE, autoContinues: 1 }).action, 'failover');
  const stopped = decideRetry({ classification: transient, effects: NONE, autoContinues: 2 });
  assert.equal(stopped.action, 'stop-ambiguous');
  assert.match(stopped.why, /rather than looping/);
});

// ── Observing effects ───────────────────────────────────────────────────────

test('a verdict newer than the attempt is this attempt\'s verdict', () => {
  const e = observeEffects({ since: 1000, verdictSeenAt: 2000, changedPaths: [], delivered: false });
  assert.equal(e.recordedVerdict, true);
  assert.equal(observeEffects({ since: 3000, verdictSeenAt: 2000, changedPaths: [] }).recordedVerdict, false);
});

test('without a start time, whose verdict it is cannot be known — so it is not claimed', () => {
  assert.equal(observeEffects({ verdictSeenAt: 2000, changedPaths: [] }).recordedVerdict, null);
});

test('durable directories count as artefacts; a scratch file does not', () => {
  assert.equal(observeEffects({ changedPaths: ['docs/architecture/ARCH-x.md'] }).wroteArtefacts, true);
  assert.equal(observeEffects({ changedPaths: ['.great_cto/verdicts/architect.log'] }).wroteArtefacts, true);
  assert.equal(observeEffects({ changedPaths: ['/tmp/scratch.txt', 'node_modules/x'] }).wroteArtefacts, false);
});

test('paths that were never looked at stay unknown', () => {
  assert.equal(observeEffects({}).wroteArtefacts, null);
});

test('describeRetry names the action and the reason', () => {
  const d = decideRetry({ classification: transient, effects: { ...NONE, wroteArtefacts: true } });
  assert.match(describeRetry(d), /STOP — state ambiguous/);
  assert.match(describeRetry(d), /duplicates/);
});
