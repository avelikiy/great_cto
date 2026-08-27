// One environment variable moved three different models.
//
// `GREAT_CTO_ROUTER_MODEL` is read by five consumers: the ask_kimi router,
// generate-summary, memory-filter, and the eval runner's ACTOR and JUDGE.
// Setting it to a cheap judge for independent-verify silently made the eval
// suite's actor a cheap model too — the suite's pass rate fell to 1/8 and its
// reported cost read $0.000, because the model is not in the price table and an
// unknown model is priced at zero. Neither symptom names the cause.
//
// The second attempt used `GREAT_CTO_JUDGE_MODEL`, which the eval runner ALSO
// already reads — the identical collision under a different name, from choosing
// a name rather than looking for a free one.
//
// So the lanes are asserted apart: setting any one must not move any other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelFor } from '../../tests/eval/runner.mjs';

const OR = { OPENROUTER_API_KEY: 'sk-or-v1-test0000000000000000000' };

test('the verifier lane does not move the eval actor', () => {
  const env = { ...OR, GREAT_CTO_VERIFY_MODEL: 'z-ai/glm-5.3-flash' };
  assert.equal(modelFor('actor', env), 'anthropic/claude-sonnet-4');
  assert.equal(modelFor('judge', env), 'anthropic/claude-sonnet-4');
});

test('the router lane still moves what it always did, and that is why it is not the verifier lane', () => {
  // Not a defect to fix here — documented so the next person does not "tidy" the
  // verifier back onto this variable.
  const env = { ...OR, GREAT_CTO_ROUTER_MODEL: 'z-ai/glm-5.3-flash' };
  assert.equal(modelFor('actor', env), 'z-ai/glm-5.3-flash',
    'one knob, five consumers — the blast radius is invisible from the name');
});

test('the eval judge has its own override, and the verifier must not share it', async () => {
  const env = { ...OR, GREAT_CTO_JUDGE_MODEL: 'some/eval-judge' };
  assert.equal(modelFor('judge', env), 'some/eval-judge');
  assert.equal(modelFor('actor', env), 'anthropic/claude-sonnet-4');

  const iv = await import('../../scripts/lib/independent-verify.mjs');
  assert.notEqual(iv.JUDGE_MODEL, 'some/eval-judge',
    'the verifier reads GREAT_CTO_VERIFY_MODEL — a name checked for being free before it was taken');
});

test('the second opinion is a different family from the first', async () => {
  const iv = await import('../../scripts/lib/independent-verify.mjs');
  const family = (m) => String(m).split('/')[0];
  assert.notEqual(family(iv.JUDGE_MODEL), family(iv.SECOND_OPINION_MODEL),
    'two models from one provider fail in correlated ways — that is not a second opinion');
});
