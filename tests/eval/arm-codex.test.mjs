/**
 * The Codex arm of the eval runner.
 *
 * The runner has always called an API — Anthropic or OpenRouter — which measures
 * a MODEL. The question this arm exists for is different: how does the same task
 * go in a different HARNESS. Claude Code and Codex budget context, batch tool
 * calls and count tokens differently, so routing both through one API shim
 * measures the shim.
 *
 * Method borrowed from phuryn/experiments' five-models-three-harnesses (no code
 * — that repository ships no licence): each model in its own native CLI, one
 * task battery, deterministic grading wherever a task admits it.
 *
 * The parser is separated from the call so the wire format can be tested without
 * spending a turn. Its shape is taken from a real run:
 *
 *   {"type":"thread.started","thread_id":"…"}
 *   {"type":"item.completed","item":{"type":"agent_message","text":"pong"}}
 *   {"type":"item.completed","item":{"type":"error","message":"…"}}
 *   {"type":"turn.completed","usage":{"input_tokens":…,"output_tokens":…}}
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexStream } from './arm-codex.mjs';

const line = (o) => JSON.stringify(o);

test('the agent message is what the arm returns', () => {
  const r = parseCodexStream([
    line({ type: 'thread.started', thread_id: 'x' }),
    line({ type: 'item.completed', item: { type: 'agent_message', text: 'pong' } }),
    line({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } }),
  ].join('\n'));
  assert.equal(r.state, 'ok');
  assert.equal(r.text, 'pong');
  assert.equal(r.usage.output_tokens, 2);
});

test('several agent messages join in order', () => {
  const r = parseCodexStream([
    line({ type: 'item.completed', item: { type: 'agent_message', text: 'one' } }),
    line({ type: 'item.completed', item: { type: 'agent_message', text: 'two' } }),
  ].join('\n'));
  assert.equal(r.text, 'one\ntwo');
});

test('errors are collected, not swallowed — and do not fake an answer', () => {
  // Codex reports non-fatal problems as error items mid-stream: a rejected
  // plugin config, a truncated skill budget. They must reach the caller, because
  // an eval scored against a degraded run is a number about the wrong thing.
  const r = parseCodexStream([
    line({ type: 'item.completed', item: { type: 'error', message: 'failed to parse plugin hooks config' } }),
    line({ type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }),
  ].join('\n'));
  assert.equal(r.state, 'ok');
  assert.equal(r.text, 'answer');
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /hooks/);
});

test('a stream with no agent message is EMPTY, never an empty-string answer', () => {
  // Three states. An empty answer graded as an answer is a silent fail that
  // scores like a real one — the failure this repository keeps deleting.
  const r = parseCodexStream([
    line({ type: 'thread.started', thread_id: 'x' }),
    line({ type: 'item.completed', item: { type: 'error', message: 'boom' } }),
  ].join('\n'));
  assert.equal(r.state, 'empty');
  assert.equal(r.text, null, 'null, not ""');
});

test('unparseable output is UNREADABLE, distinct from empty', () => {
  const r = parseCodexStream('not json at all\nnor this');
  assert.equal(r.state, 'unreadable');
  assert.equal(r.text, null);
});

test('non-JSON noise around valid lines does not lose the answer', () => {
  // The CLI prints human-readable lines to the same stream in some modes.
  const r = parseCodexStream([
    'Reading additional input…',
    line({ type: 'item.completed', item: { type: 'agent_message', text: 'still here' } }),
    'tokens used 10,214',
  ].join('\n'));
  assert.equal(r.state, 'ok');
  assert.equal(r.text, 'still here');
});

test('usage is absent, not zero, when the turn did not report it', () => {
  // A cost comparison that reads a missing measurement as 0 makes the cheaper
  // harness look free.
  const r = parseCodexStream(line({ type: 'item.completed', item: { type: 'agent_message', text: 'x' } }));
  assert.equal(r.usage, null);
});
