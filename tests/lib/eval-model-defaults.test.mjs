// The eval must measure the models the product actually routes to.
//
// Until 2026-09-12 the OpenRouter path defaulted to `anthropic/claude-sonnet-4`
// for BOTH actor and judge, while the Anthropic-direct path used claude-sonnet-5
// and claude-opus-5. This machine only has an OpenRouter key, so every number in
// results-history.jsonl — every figure used to compare agents — was measured on
// a model the router had stopped calling.
//
// Measured the day it was found, same cases, same prompt: 3/8 on sonnet-4 and
// 6/7 on sonnet-5 with an opus-5 judge. The model moved the result further than
// any prompt edit in this repository has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = readFileSync(join(ROOT, 'tests/eval/runner.mjs'), 'utf8');
const constant = (name) => {
  const m = RUNNER.match(new RegExp(`const ${name} = '([^']+)'`));
  assert.ok(m, `${name} is gone from the runner`);
  return m[1];
};
const bare = (id) => id.replace(/^[a-z-]+\//, '');

test('both providers default to the same actor model', () => {
  assert.equal(bare(constant('DEFAULT_ACTOR_MODEL_OPENROUTER')), constant('DEFAULT_ACTOR_MODEL_ANTHROPIC'),
    'the provider decides where the call goes, never which model is measured');
});

test('both providers default to the same judge model', () => {
  assert.equal(bare(constant('DEFAULT_JUDGE_MODEL_OPENROUTER')), constant('DEFAULT_JUDGE_MODEL_ANTHROPIC'),
    'a cheaper judge on one provider makes two runs incomparable');
});

test('the judge is not the actor', () => {
  // They were the same model on OpenRouter, which is a model grading its own answer.
  assert.notEqual(constant('DEFAULT_JUDGE_MODEL_OPENROUTER'), constant('DEFAULT_ACTOR_MODEL_OPENROUTER'));
});

test('the defaults name models the price table carries', () => {
  const meter = readFileSync(join(ROOT, 'scripts/lib/cost-meter.mjs'), 'utf8');
  for (const c of ['DEFAULT_ACTOR_MODEL_ANTHROPIC', 'DEFAULT_JUDGE_MODEL_ANTHROPIC']) {
    assert.match(meter, new RegExp(`'${constant(c)}'`),
      `${constant(c)} is not in cost-meter.mjs, so a run with it is priced by a family guess`);
  }
});
