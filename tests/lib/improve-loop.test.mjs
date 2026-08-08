// One devops instruction was rewritten four times on 2026-08-06. The holdout went
// 5/20 → 11 → 12 → 11 → 10. About $41 of a $43 campaign was spent before the
// measurement told the truth, and $1.50 after — four of the six repairs were to
// the harness, not the agent.
//
// Every one of those looked like an agent that needed a better prompt. So the
// ORDER of questions is the tool: each has an answer that stops the loop, and
// "edit the prompt" is the last one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, planFromRuns, explainPlan, writesOffLimits, OFF_LIMITS } from '../../scripts/lib/improve-loop.mjs';

const fail = (reason) => ({ num: String(Math.random()).slice(2, 6), verdict: 'FAIL', reason, answer: 'a competent plan' });
const base = {
  eval: 'EVAL-x', passed: 3, judged: 20,
  power: { status: 'failed', why: 'even the high end is below the bar' },
  caseResults: [fail('named the wrong retention period'), fail('did not raise the migration overlap'), fail('accepted the health check')],
};

// ── the order, and each answer that stops the loop ────────────────────────

test('a truncated run is not measured, and no prompt is proposed', () => {
  // A rate over the cases that ran is not a rate. 402s once read as a score.
  const d = diagnose({ ...base, dropout: { severe: true, why: 'the last 40 cases never reached the provider' } });
  assert.equal(d.action, 'not-measured');
  assert.equal(d.stop, true);
  assert.match(d.next, /same truncation twice/);
});

test('an inconclusive run is not a prompt problem', () => {
  // A prompt edit judged against an interval that spans the bar is a coin flip
  // with a commit message.
  const d = diagnose({ ...base, power: { status: 'inconclusive', why: 'the interval spans the bar' } });
  assert.equal(d.action, 'underpowered');
  assert.equal(d.stop, true);
  assert.match(d.next, /Raise --samples/);
});

test('a passing run asks for nothing', () => {
  const d = diagnose({ ...base, power: { status: 'passed' } });
  assert.equal(d.action, 'none');
  assert.equal(d.stop, true);
});

test('a fixture problem stops the loop before it touches a prompt', () => {
  // Three times a low score was read as an agent gap and was the harness.
  const d = diagnose({
    ...base,
    caseResults: ['H1', 'H2', 'H3', 'H4'].map(() => fail('refused without an approved gate')),
  });
  assert.equal(d.action, 'harness');
  assert.equal(d.stop, true);
  assert.match(d.next, /Do NOT touch the prompt/);
});

test('an instruction that does not reach the answer asks for structure, not words', () => {
  const answers = (n, text, verdict = 'FAIL') => Array.from({ length: n }, () => ({ num: 'x', verdict, reason: 'wrong', answer: text }));
  const d = diagnose({
    ...base,
    caseResults: [...answers(2, 'CLAIMS BEFORE cutover', 'PASS'), ...answers(18, 'a competent deploy plan')],
    adherence: undefined,
  }, { marker: /CLAIMS BEFORE/i });
  assert.equal(d.action, 'structural');
  assert.equal(d.stop, false);
  assert.match(d.next, /Do not reword it/);
  assert.match(d.next, /no phrasing changes what is absent/);
});

test('an instruction that fires and is wrong is finally a wording question', () => {
  const rows = Array.from({ length: 10 }, () => ({ num: 'x', verdict: 'FAIL', reason: 'named the wrong period', answer: 'CLAIMS BEFORE cutover — wrong claims' }));
  const d = diagnose({ ...base, caseResults: rows }, { marker: /CLAIMS BEFORE/i });
  assert.equal(d.action, 'content');
  assert.equal(d.stop, false);
  assert.match(d.next, /TUNING split only/);
});

test('a run that stored no answers cannot say whether the instruction fired', () => {
  // Reporting zero emission for a run that recorded nothing would send someone
  // to rewrite an instruction that may have fired every time.
  const d = diagnose({ ...base, caseResults: [{ num: '1', verdict: 'FAIL', reason: 'x' }] }, { marker: /CLAIMS/i });
  assert.equal(d.action, 'not-measured');
  assert.equal(d.stop, true);
});

// ── what the loop may never write ────────────────────────────────────────

test('the ruler is off limits', () => {
  // An optimiser with write access to its own ruler optimises the ruler, and the
  // natural response to a failing eval is to soften the criterion until it passes.
  const bad = writesOffLimits([
    'agents/devops.md',
    'tests/eval/EVAL-devops-deploy-safety.md',
    'scripts/lib/eval-power.mjs',
    'tests/eval/dags/devops.dag.json',
  ]);
  assert.deepEqual(bad.sort(), [
    'scripts/lib/eval-power.mjs',
    'tests/eval/EVAL-devops-deploy-safety.md',
    'tests/eval/dags/devops.dag.json',
  ].sort());
  assert.ok(!bad.includes('agents/devops.md'), 'the prompt is the one thing it may change');
});

test('every off-limits entry names something that decides a score', () => {
  for (const o of OFF_LIMITS) {
    assert.ok(/EVAL-|dags|run-shape|eval-power|adherence|judge/.test(o), o);
  }
});

// ── the plan ─────────────────────────────────────────────────────────────

test('blocked diagnoses are reported and never become candidates', () => {
  // A loop that proposes a prompt edit for a truncated run repeats this repo's
  // own most expensive mistake.
  const plan = planFromRuns([
    { ...base, dropout: { severe: true, why: 'truncated' } },
    { ...base, caseResults: Array.from({ length: 4 }, () => fail('refused without an approved gate')) },
  ]);
  assert.equal(plan.actionable.length, 0);
  assert.equal(plan.blocked.length, 2);
  const out = explainPlan(plan);
  assert.match(out, /will NOT act on/);
  assert.match(out, /holdout returns a number and never a reason/);
});

test('nothing conclusive says so rather than inventing work', () => {
  assert.match(explainPlan(planFromRuns([])), /nothing conclusive/);
});

test('a run with no power verdict is not a failing run', () => {
  // The first execution of this tool proposed content edits for 74 evals,
  // because rows written before power was persisted carry no status and fell
  // through to the last question. Several of them had passed.
  for (const power of [undefined, null, {}, { status: 'unknown' }]) {
    const d = diagnose({ ...base, power });
    assert.equal(d.action, 'not-measured', JSON.stringify(power));
    assert.equal(d.stop, true);
    assert.match(d.why, /never established/);
  }
});
