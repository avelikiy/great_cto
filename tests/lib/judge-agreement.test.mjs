// Every number this repo reports about an agent comes from one model grading
// another, and that grader had never been checked against a human. In one
// session it produced twenty verdicts of the same shape: it stated the response
// was correct and marked it FAIL because the wording did not match the
// criterion's wording.
//
// The reason that matters more than the error rate: the natural repair for a
// failing eval is to soften the criterion until it passes, and a gold set edited
// after reading the outputs measures memory of those outputs. It happened three
// times before it was named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kappa, summarise, explain } from '../../scripts/lib/judge-agreement.mjs';

const row = (judge, human) => ({ eval: 'E', case: '1', judge_verdict: judge, human_verdict: human });

test('unlabelled disputed cases measure nothing, and say so', () => {
  const s = summarise([{ judge_verdict: 'FAIL' }, { judge_verdict: 'FAIL' }]);
  assert.equal(s.labelled, 0);
  assert.equal(s.agreement, null, 'an unlabelled set has no agreement, not 100%');
  assert.match(explain(s), /nothing measured/);
});

test('a judge that fails what a human passes is counted separately', () => {
  // This is the direction that corrupts the loop — the repair is to weaken the
  // criterion, which makes the eval measure less.
  const s = summarise([row('FAIL', 'PASS'), row('FAIL', 'PASS'), row('FAIL', 'FAIL')]);
  assert.equal(s.falseFail, 2);
  assert.equal(s.falsePass, 0);
  assert.match(explain(s), /weaken the criterion/);
});

test('the other direction is counted too', () => {
  assert.equal(summarise([row('PASS', 'FAIL')]).falsePass, 1);
});

test('agreement is a fraction of the labelled cases, not of all of them', () => {
  const s = summarise([row('FAIL', 'FAIL'), row('FAIL', 'PASS'), { judge_verdict: 'FAIL' }]);
  assert.equal(s.n, 3);
  assert.equal(s.labelled, 2);
  assert.equal(s.agreement, 0.5, 'counting an unlabelled case as agreement would invent one');
});

test('kappa discounts the agreement that chance alone would produce', () => {
  const allFail = [row('FAIL', 'FAIL'), row('FAIL', 'FAIL'), row('FAIL', 'FAIL')];
  assert.equal(kappa(allFail.map((r) => ({ judge: r.judge_verdict, human: r.human_verdict }))), null,
    'perfect agreement with no variance is not evidence — kappa is undefined, not 1');
});

test('kappa is 1 when both raters vary and always agree', () => {
  const pairs = [
    { judge: 'PASS', human: 'PASS' }, { judge: 'FAIL', human: 'FAIL' },
    { judge: 'PASS', human: 'PASS' }, { judge: 'FAIL', human: 'FAIL' },
  ];
  assert.equal(kappa(pairs), 1);
});

test('kappa is 0 when agreement is what chance would give', () => {
  const pairs = [
    { judge: 'PASS', human: 'PASS' }, { judge: 'PASS', human: 'FAIL' },
    { judge: 'FAIL', human: 'PASS' }, { judge: 'FAIL', human: 'FAIL' },
  ];
  assert.equal(kappa(pairs), 0);
});

test('an empty set is null, never a score', () => {
  assert.equal(kappa([]), null);
  assert.equal(summarise([]).agreement, null);
});
