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

test('the actor is given room to answer, not only to introduce itself', () => {
  const m = RUNNER.match(/let ACTOR_MAX_TOKENS = (\d+);/);
  assert.ok(m, 'the actor budget is gone from the runner');
  const budget = Number(m[1]);
  // The largest agent prompt is over 20k tokens of system text before the first
  // question. At 2500 the judge read "the response is empty" for three of seven
  // devops cases, with dropout at zero — the answers arrived and were cut.
  assert.ok(budget >= 6000,
    `actor budget ${budget} — below this, a long-prompt agent is scored on a truncated answer`);
});

test('the DAG judge has room for a one-word answer', () => {
  const m = RUNNER.match(/const DAG_JUDGE_MAX_TOKENS = (\d+);/);
  assert.ok(m, 'the DAG judge budget is gone from the runner');
  // At 8, two of five opus-5 answers came back empty with stop_reason "length".
  assert.ok(Number(m[1]) >= 64, `DAG judge budget ${m[1]} — below this the answer is cut before the word arrives`);
  assert.doesNotMatch(RUNNER, /maxTokens: 8\b/, 'a hard-coded 8-token judge call is back');
});

test('judges are asked not to reason, and the actor is not', () => {
  // The actor is the agent under test; its reasoning is part of what is measured.
  const calls = [...RUNNER.matchAll(/callLlm\(\{[^}]*\}\)/g)].map((m) => m[0]);
  const judge = calls.filter((c) => /modelFor\('judge'\)/.test(c));
  const actor = calls.filter((c) => /actorModel/.test(c));
  assert.ok(judge.length >= 2, `expected the rubric and DAG judge calls, found ${judge.length}`);
  assert.ok(actor.length >= 1, 'no actor call found — the check below would pass on nothing');
  for (const c of judge) assert.match(c, /reasoning: JUDGE_REASONING/, `a judge call reasons before answering: ${c}`);
  for (const c of actor) assert.doesNotMatch(c, /reasoning:/, `the actor was told not to reason: ${c}`);
  assert.match(RUNNER, /const JUDGE_REASONING = \{ enabled: false \};/,
    'reasoning.max_tokens=0 did not work on OpenRouter — only enabled:false stopped it');
});
