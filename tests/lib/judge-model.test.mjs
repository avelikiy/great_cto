// tests/lib/judge-model.test.mjs — the runtime judge-model router (ADR-004).
// Selects the judge model from a change's change_tier: cheap on T0/T1, frontier+human on T2.
//
// Run: node --test tests/lib/judge-model.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selectJudgeModel, DEFAULT_CHEAP_JUDGE, DEFAULT_FRONTIER_JUDGE } from '../../scripts/lib/judge-model.mjs';

test('T0 and T1 → cheap judge, no human', () => {
  for (const t of ['T0', 'T1']) {
    const r = selectJudgeModel(t, { cheapModel: 'cheap-x', frontierModel: 'frontier-y' });
    assert.equal(r.model, 'cheap-x');
    assert.equal(r.human, false);
    assert.equal(r.tier, t);
  }
});

test('T2 → frontier judge + human', () => {
  const r = selectJudgeModel('T2', { cheapModel: 'cheap-x', frontierModel: 'frontier-y' });
  assert.equal(r.model, 'frontier-y');
  assert.equal(r.human, true);
  assert.equal(r.tier, 'T2');
});

test('unknown / missing tier → T2 (fail-safe: frontier + human)', () => {
  for (const t of [undefined, null, 'bogus', '']) {
    const r = selectJudgeModel(t, { cheapModel: 'c', frontierModel: 'f' });
    assert.equal(r.tier, 'T2');
    assert.equal(r.model, 'f');
    assert.equal(r.human, true);
  }
});

test('cheapModel is pluggable (a fine-tuned open judge replaces the default)', () => {
  assert.equal(selectJudgeModel('T1', { cheapModel: 'qwen-3.5-35b-judge' }).model, 'qwen-3.5-35b-judge');
});

test('defaults: cheap is a haiku-class model, frontier is opus-class; they differ', () => {
  assert.match(DEFAULT_CHEAP_JUDGE, /haiku/);
  assert.match(DEFAULT_FRONTIER_JUDGE, /opus|fable/);
  assert.notEqual(DEFAULT_CHEAP_JUDGE, DEFAULT_FRONTIER_JUDGE);
  // With no opts/env, T1 uses the cheap default, T2 the frontier default.
  assert.equal(selectJudgeModel('T1').model, DEFAULT_CHEAP_JUDGE);
  assert.equal(selectJudgeModel('T2').model, DEFAULT_FRONTIER_JUDGE);
});

test('frontier is never the cheap model at T2 (no accidental downgrade on high-stakes)', () => {
  const r = selectJudgeModel('T2', { cheapModel: 'x', frontierModel: 'y' });
  assert.notEqual(r.model, 'x');
});

test('result carries a human-readable reason', () => {
  assert.ok(typeof selectJudgeModel('T1').reason === 'string');
  assert.ok(selectJudgeModel('T2').reason.length > 0);
});
