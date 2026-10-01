// agent-speed reads the timing out of subagent transcripts — and counts parallel
// tool calls per message, not per line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureRun } from '../../scripts/lib/agent-speed.mjs';

const T = (s) => `2026-09-23T10:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000Z`;
const use = (msgId, id, t) => JSON.stringify({ type: 'assistant', timestamp: T(t), message: { id: msgId, content: [{ type: 'tool_use', id, name: 'Read', input: {} }] } });
const res = (id, t) => JSON.stringify({ type: 'user', timestamp: T(t), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });

test('two tool calls written as two lines of one message are one batched message', () => {
  const run = measureRun([use('m1', 'a', 0), use('m1', 'b', 0), res('a', 2), res('b', 3), use('m2', 'c', 30), res('c', 31)].join('\n'));
  assert.equal(run.toolCalls, 3);
  assert.equal(run.messages, 2);
  assert.equal(run.batchedMessages, 1, 'm1 carried two calls although the transcript wrote them on two lines');
});

test('model time is result → next message; tool time is call → result', () => {
  const run = measureRun([use('m1', 'a', 0), res('a', 10), use('m2', 'b', 70), res('b', 75)].join('\n'));
  assert.equal(run.toolMs, 15000);
  assert.equal(run.modelMs, 60000);
  assert.equal(run.minutes, 75 / 60);
});

test('a transcript without two timestamps is not a run', () => {
  assert.equal(measureRun(''), null);
});
