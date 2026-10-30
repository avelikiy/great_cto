// Three rules about the tests and fixes an implementer produces (great_cto-yttd):
// stop after two failed fixes on one assumption, refuse a test an empty function
// body would satisfy, pin untested code's current behaviour before changing it.
// Each must reach the agent that acts on it, the bundle the plugin registers, and
// carry an eval case — a rule with no case is a rule nobody measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(p), 'utf8');

test('senior-dev carries all three rules, in the source and in the plugin bundle', () => {
  for (const file of ['agents/senior-dev.md', 'agents-full/senior-dev.md']) {
    const t = read(file);
    assert.match(t, /Two fixes, one premise/, `${file}: premise rule`);
    assert.match(t, /no third edit/i, `${file}: the premise rule forbids the third edit`);
    assert.match(t, /empty body/i, `${file}: empty-implementation check`);
    assert.match(t, /Characterize first/, `${file}: characterization rule`);
    assert.match(t, /pass on the unchanged code/i, `${file}: the pin must be seen passing before the change`);
  }
});

test('the premise rule sits where fixes are retried, not in the shared brief every agent reads', () => {
  // task-brief.md is inlined into five agents; the rule is about editing code.
  assert.doesNotMatch(read('shared/agent-fragments/task-brief.md'), /one premise/i);
  const t = read('agents/senior-dev.md');
  assert.ok(t.indexOf('**Two fixes, one premise') > t.indexOf('**REFACTOR**'),
    'it follows the RED/GREEN/REFACTOR steps it bounds');
});

test('the empty-body check is part of the RED step, after "a test that passes first is wrong"', () => {
  const t = read('agents/senior-dev.md');
  const red = t.indexOf('**RED**');
  const green = t.indexOf('**GREEN**');
  const empty = t.search(/empty body/i);
  assert.ok(red > 0 && empty > red && empty < green, 'inside the RED bullet');
});

test('the characterization pin comes before RED', () => {
  const t = read('agents/senior-dev.md');
  const pin = t.indexOf('Characterize first');
  assert.ok(pin > 0, 'the rule exists');
  assert.ok(pin < t.indexOf('**RED**'));
});

test('code-reviewer flags a test an empty implementation would satisfy', () => {
  for (const file of ['agents/code-reviewer.md', 'agents-full/code-reviewer.md']) {
    const t = read(file);
    const item4 = t.slice(t.indexOf('4. **Readability'), t.indexOf('## Calibration'));
    assert.match(item4, /empty (body|implementation)/i, `${file}: rubric item 4`);
  }
});

test('qa-engineer points small tasks at the cheap check without changing the mutation rule', () => {
  const t = read('agents/qa-engineer.md');
  const step = t.slice(t.indexOf('### Step 3b-3'), t.indexOf('### Step 3c'));
  assert.match(step, /\[SKIP for small\]/, 'the mutation step is still skipped for small');
  assert.match(step, /empty-implementation\s+check/i);
});

test('project-auditor marks untested hotspots as needing a characterization test', () => {
  assert.match(read('agents/project-auditor.md'), /characterize before change/i);
});

test('each rule has an eval case', () => {
  const sd = read('tests/eval/EVAL-senior-dev-scope-tdd.md');
  assert.match(sd, /\| 9 \|[^\n]*\bthird\b/i, 'senior-dev: premise case');
  assert.match(sd, /\| 10 \|[^\n]*empty/i, 'senior-dev: empty-implementation case');
  assert.match(sd, /\| 11 \|[^\n]*no test covers/i, 'senior-dev: characterization case');
  assert.match(read('tests/eval/EVAL-code-reviewer-quality.md'), /\| 10 \|[^\n]*empty/i, 'code-reviewer: empty-implementation case');
});
