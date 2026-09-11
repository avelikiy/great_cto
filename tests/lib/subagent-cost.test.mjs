// A subagent's cost belongs to the subagent, and so does the question of which
// model it ran on.
//
// Claude Code hands SubagentStop both `transcript_path` (the SESSION) and
// `agent_transcript_path` (this agent). Reading the first measured the whole
// session on every stop — ~10k turns — so every figure was set aside as
// unattributed and no agent was ever measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stopTranscript, stopAgent, requestedModel, sameModel, modelCheck, costLine,
} from '../../scripts/lib/subagent-cost.mjs';

test('the agent transcript wins over the session transcript', () => {
  assert.deepEqual(
    stopTranscript({ transcript_path: '/s.jsonl', agent_transcript_path: '/a.jsonl' }),
    { path: '/a.jsonl', source: 'agent' });
});

test('an older host that sends only transcript_path is read as the session, and says so', () => {
  assert.deepEqual(stopTranscript({ transcript_path: '/s.jsonl' }), { path: '/s.jsonl', source: 'session' });
});

test('no path at all is no path, not a guess', () => {
  assert.deepEqual(stopTranscript({}), { path: null, source: null });
  assert.deepEqual(stopTranscript(null), { path: null, source: null });
  assert.deepEqual(stopTranscript({ agent_transcript_path: '' }), { path: null, source: null });
});

test('the agent name drops the plugin prefix, and an absent type is null', () => {
  assert.equal(stopAgent({ agent_type: 'great-cto:senior-dev' }), 'senior-dev');
  assert.equal(stopAgent({ agent_type: 'general-purpose' }), 'general-purpose');
  assert.equal(stopAgent({}), null);
});

test('the requested model and advisor come from the agent frontmatter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-'));
  writeFileSync(join(dir, 'senior-dev.md'), '---\nname: senior-dev\nmodel: sonnet\nadvisor-model: claude-opus-5\n---\nbody model: haiku\n');
  writeFileSync(join(dir, 'bare.md'), '---\nname: bare\n---\n');
  assert.deepEqual(requestedModel(dir, 'senior-dev'), { model: 'sonnet', advisor: 'claude-opus-5' });
  assert.deepEqual(requestedModel(dir, 'bare'), { model: null, advisor: null });
  assert.deepEqual(requestedModel(dir, 'general-purpose'), { model: null, advisor: null });
});

test('a name that is not a plain agent name is never read as a path', () => {
  const root = mkdtempSync(join(tmpdir(), 'agents-'));
  const dir = join(root, 'agents');
  mkdirSync(dir);
  writeFileSync(join(root, 'secret.md'), '---\nmodel: opus\n---\n');
  assert.deepEqual(requestedModel(dir, '../secret'), { model: null, advisor: null });
});

test('a vendor prefix and a dated suffix name the same model', () => {
  assert.equal(sameModel('claude-haiku-4-5', 'claude-haiku-4-5-20251001'), true);
  assert.equal(sameModel('claude-opus-5', 'anthropic/claude-opus-5'), true);
  assert.equal(sameModel('claude-sonnet-4.6', 'claude-sonnet-4-6'), true);
});

test('another number or a tier word is another model', () => {
  assert.equal(sameModel('claude-fable-5', 'claude-fable-5-1'), false);
  assert.equal(sameModel('gemini-2.5-flash', 'gemini-2.5-flash-lite'), false);
  assert.equal(sameModel('claude-opus-5', 'claude-opus-4-8'), false);
  assert.equal(sameModel('', 'claude-opus-5'), false);
});

test('an alias matches any model of its family', () => {
  const r = modelCheck({ model: 'sonnet', advisor: null }, ['claude-sonnet-5']);
  assert.equal(r.state, 'match');
  assert.deepEqual(r.served, ['claude-sonnet-5']);
});

test('an alias served by another family is a substitution, and names what served it', () => {
  const r = modelCheck({ model: 'sonnet', advisor: null }, ['claude-sonnet-5', 'claude-opus-5']);
  assert.equal(r.state, 'substituted');
  assert.match(r.why, /asked sonnet, served claude-opus-5/);
});

test('an exact id matches its dated alias and nothing else', () => {
  assert.equal(modelCheck({ model: 'claude-haiku-4-5', advisor: null }, ['claude-haiku-4-5-20251001']).state, 'match');
  assert.equal(modelCheck({ model: 'claude-haiku-4-5', advisor: null }, ['claude-sonnet-5']).state, 'substituted');
});

test('the declared advisor model is allowed, not a substitution', () => {
  assert.equal(modelCheck({ model: 'sonnet', advisor: 'claude-opus-5' }, ['claude-sonnet-5', 'claude-opus-5']).state, 'match');
});

test('no request, inherit, or nothing served is unverifiable — not a match', () => {
  assert.equal(modelCheck({ model: null, advisor: null }, ['claude-opus-5']).state, 'unverifiable');
  assert.equal(modelCheck({ model: 'inherit', advisor: null }, ['claude-opus-5']).state, 'unverifiable');
  assert.equal(modelCheck({ model: 'sonnet', advisor: null }, []).state, 'unverifiable');
  assert.equal(modelCheck({ model: 'sonnet', advisor: null }, ['<synthetic>', 'unknown']).state, 'unverifiable');
});

test('synthetic turns are not a served model', () => {
  const r = modelCheck({ model: 'sonnet', advisor: null }, ['claude-sonnet-5', '<synthetic>']);
  assert.equal(r.state, 'match');
  assert.deepEqual(r.served, ['claude-sonnet-5']);
});

test('the cost line keeps the prefix every reader parses, and adds the check at the end', () => {
  const measured = { usd: 0.0123, turns: 3, input_tokens: 10, output_tokens: 20,
    cache_read_input_tokens: 30, cache_creation_input_tokens: 40 };
  const check = { state: 'substituted', requested: 'sonnet', served: ['claude-opus-5'], why: '' };
  const line = costLine({ ts: '2026-09-11T10:00:00Z', agent: 'senior-dev', measured, check });
  assert.equal(line,
    '2026-09-11T10:00:00Z senior-dev 0.0123 turns=3 in=10 out=20 cache_r=30 cache_w=40'
    + ' model=substituted asked=sonnet served=claude-opus-5\n');
  // The board's reader, verbatim from packages/board/lib/verdicts.mjs.
  assert.match(line, /^(\d{4}-\d{2}-\d{2}T\S+)\s+(\S+)\s+(\d+\.?\d*)(?:\s+turns=(\d+))?(?:\s|$)/);
});

test('an unverifiable check is written as such, without inventing a request', () => {
  const measured = { usd: 1, turns: 1 };
  const line = costLine({ ts: '2026-09-11T10:00:00Z', agent: 'general-purpose', measured,
    check: { state: 'unverifiable', requested: null, served: ['claude-opus-5'], why: '' } });
  assert.match(line, / model=unverifiable served=claude-opus-5\n$/);
  assert.doesNotMatch(line, /asked=/);
});
