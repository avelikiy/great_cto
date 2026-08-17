// What actually failed, for the agent that has to fix it.
//
// `/prompt-evolve` hands `ai-prompt-architect` a one-sentence LESSON while the
// eval history holds, per case, the actor's full response and the judge's reason
// for rejecting it. The candidate generator was working from a summary with the
// evidence sitting on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureDigest, latestRuns, describeFailures, readHistory } from '../../scripts/lib/failure-digest.mjs';

const row = (o = {}) => ({
  agent: 'some-agent', eval: 'EVAL-a', run_id: '2026-08-17T10:00:00Z',
  split: 'holdout', samples: 3, caseResults: [], ...o,
});
const fail = (num, reason, answer = 'the agent said something') =>
  ({ num, verdict: 'FAIL', reason, answer, judge: 'judge-model' });
const pass = (num) => ({ num, verdict: 'PASS', reason: 'fine', answer: 'ok' });

test('a failing case carries the judge reason and what the agent actually said', () => {
  const d = failureDigest('some-agent', {
    rows: [row({ caseResults: [fail(1, 'no file:line citation'), pass(2)] })],
  });
  assert.equal(d.state, 'failures');
  assert.equal(d.failures.length, 1);
  assert.equal(d.failures[0].case, 1);
  assert.match(d.failures[0].reason, /file:line/);
  assert.match(d.failures[0].answer, /agent said something/);
  assert.equal(d.failures[0].eval, 'EVAL-a', 'and which eval it came from');
});

// ── Four states, because they lead to different next actions ────────────────

test('measured and clean is not the same as never measured', () => {
  const clean = failureDigest('some-agent', { rows: [row({ caseResults: [pass(1)] })] });
  assert.equal(clean.state, 'clean');

  const never = failureDigest('nobody', { rows: [row()] });
  assert.equal(never.state, 'unmeasured');
  assert.match(never.why, /not the same as passing/);
});

test('an unreadable history is its own state, never "nothing failed"', () => {
  const d = failureDigest('some-agent', { rows: null });
  assert.equal(d.state, 'unreadable');
  assert.deepEqual(d.failures, []);
  assert.match(d.why, /not "nothing failed"/);
});

test('readHistory distinguishes absent from unreadable', () => {
  assert.deepEqual(readHistory('/nonexistent/path/history.jsonl'), [], 'absent reads as empty');
  assert.equal(readHistory('/'), null, 'a directory cannot be read — null, not []');
});

// ── Which run counts ────────────────────────────────────────────────────────

test('the newest run per eval wins, not the worst', () => {
  // Picking the run with the most failures would be selecting evidence to suit
  // the conclusion — the same reason gate-tier takes the newest row.
  const rows = [
    row({ run_id: '2026-08-01T00:00:00Z', caseResults: [fail(1, 'old failure')] }),
    row({ run_id: '2026-08-17T00:00:00Z', caseResults: [pass(1)] }),
  ];
  assert.equal(failureDigest('some-agent', { rows }).state, 'clean');
  assert.equal(latestRuns('some-agent', rows).length, 1);
});

test('a severely truncated run is not evidence', () => {
  const rows = [row({ caseResults: [fail(1, 'x')], dropout: { severe: true } })];
  assert.equal(failureDigest('some-agent', { rows }).state, 'unmeasured');
});

test('split and samples narrow the shape, and mismatches are simply absent', () => {
  const rows = [row({ split: 'tuning', samples: 1, caseResults: [fail(1, 'x')] })];
  assert.equal(failureDigest('some-agent', { rows, split: 'holdout', samples: 3 }).state, 'unmeasured');
  assert.equal(failureDigest('some-agent', { rows, split: 'tuning', samples: 1 }).state, 'failures');
});

test('failures from several evals are collected, each naming its source', () => {
  const rows = [
    row({ eval: 'EVAL-a', caseResults: [fail(1, 'a failed')] }),
    row({ eval: 'EVAL-b', caseResults: [fail(2, 'b failed')] }),
  ];
  const d = failureDigest('some-agent', { rows });
  assert.equal(d.evals, 2);
  assert.deepEqual(d.failures.map((f) => f.eval).sort(), ['EVAL-a', 'EVAL-b']);
});

// ── Bounded, and honest about absence ───────────────────────────────────────

test('the answer is bounded so a digest cannot cost more than the fix', () => {
  const d = failureDigest('some-agent', {
    rows: [row({ caseResults: [fail(1, 'x', 'y'.repeat(9000))] })],
    maxAnswer: 100,
  });
  assert.equal(d.failures[0].answer.length, 100);
});

test('a failure whose judge recorded no reason says so rather than reading as empty', () => {
  const d = failureDigest('some-agent', { rows: [row({ caseResults: [fail(1, '')] })] });
  assert.match(d.failures[0].reason, /no reason/);
});

test('describeFailures prints the evidence, and for other states just says why', () => {
  const d = failureDigest('some-agent', { rows: [row({ caseResults: [fail(3, 'missed the citation')] })] });
  const text = describeFailures(d);
  assert.match(text, /case 3/);
  assert.match(text, /judge said: missed the citation/);
  assert.match(text, /agent said:/);

  const clean = failureDigest('some-agent', { rows: [row({ caseResults: [pass(1)] })] });
  assert.equal(describeFailures(clean), clean.why, 'no evidence section when there is no evidence');
});
