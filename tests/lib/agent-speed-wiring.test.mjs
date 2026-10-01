// The speed changes reach the agents and the pipeline (PLAN-2026-09-23-agent-speed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';

const WORKERS = ['senior-dev', 'qa-engineer', 'code-reviewer', 'security-officer', 'pm', 'architect', 'design-advisor',
  'devops', 'coordinator', 'product-owner', 'e2e-test-engineer', 'mobile-app-builder', 'l3-support', 'project-auditor'];

test('every working agent carries work-fast, inlined in the bundle the plugin registers', () => {
  for (const a of WORKERS) {
    assert.match(readFileSync(resolve(`agents/${a}.md`), 'utf8'), /agents\/_shared\/work-fast\.md/, a);
    assert.match(readFileSync(resolve(`agents-full/${a}.md`), 'utf8'), /BEGIN agents\/_shared\/work-fast\.md/, `${a} (bundle)`);
  }
  const f = readFileSync(resolve('agents/_shared/work-fast.md'), 'utf8');
  for (const rule of [/one message/, /Never poll/, /affected-tests\.mjs/, /Read a file once/]) assert.match(f, rule);
});

test('the review stage fans out: code-reviewer, QA and security start together and wait for each other', () => {
  const t = parsePipelineToml(readFileSync(resolve('shared/pipeline.toml'), 'utf8'));
  const get = (name) => (Array.isArray(t) ? t.find((x) => x.from === name || x.agent === name || x.name === name) : t[name] || t.transitions?.[name]);
  const src = readFileSync(resolve('shared/pipeline.toml'), 'utf8');
  assert.match(src, /\[transitions\.senior-dev\][\s\S]*?next = \["code-reviewer", "qa-engineer", "security-officer"\]/);
  assert.match(src, /\[transitions\.code-reviewer\][\s\S]*?join = \["qa-engineer", "security-officer"\]/);
  assert.match(src, /\[transitions\.qa-engineer\][\s\S]*?join = \["security-officer", "code-reviewer"\]/);
  assert.match(src, /\[transitions\.security-officer\][\s\S]*?join = \["qa-engineer", "code-reviewer"\]/);
  assert.ok(t && get, 'the map still parses');
});

test('coordinator dispatches disjoint packets in one message; pm plans in waves', () => {
  assert.match(readFileSync(resolve('agents/coordinator.md'), 'utf8'), /Dispatch in one message/);
  assert.match(readFileSync(resolve('agents/pm.md'), 'utf8'), /\*\*waves\*\*/);
});
