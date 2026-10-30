// Three rules about the tests and fixes an implementer produces (great_cto-yttd):
// stop after two failed fixes on one assumption, refuse a test an empty function
// body would satisfy, pin untested code's current behaviour before changing it.
// Each must reach the agent that acts on it, the bundle the plugin registers, and
// carry an eval case — a rule with no case is a rule nobody measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvalFile } from '../eval/runner.mjs';

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

// great_cto-6fng: the check lived inside the RED bullet, so a scenario that said "RED is
// confirmed, proceed to GREEN" skipped it — the agent read RED as finished. It is its own
// step between RED and GREEN, and says why a confirmed RED does not discharge it.
test('the stub check is its own step between RED and GREEN, and a confirmed RED does not skip it', () => {
  for (const file of ['agents/senior-dev.md', 'agents-full/senior-dev.md']) {
    const t = read(file);
    const red = t.indexOf('**RED**');
    const green = t.indexOf('**GREEN**');
    const check = t.indexOf('**Stub check');
    assert.ok(red > 0 && check > red && check < green, `${file}: a bullet of its own between RED and GREEN`);
    const bullet = t.slice(check, green);
    assert.match(bullet, /even when RED is already confirmed/i, `${file}: applies after RED as well`);
    assert.match(bullet, /does not exist/i, `${file}: says why a missing-function RED proves nothing`);
    assert.match(bullet, /empty body/i, `${file}: names the stub`);
    assert.match(bullet, /does\s+not throw/i, `${file}: names the assertions that survive it`);
  }
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
  // It names where senior-dev runs the check; that moved from RED to its own step before GREEN (6fng).
  assert.match(step, /senior-dev runs it before GREEN/);
  assert.doesNotMatch(step, /runs it at RED/);
});

test('project-auditor marks untested hotspots as needing a characterization test', () => {
  assert.match(read('agents/project-auditor.md'), /characterize before change/i);
});

// The first drafts of these cases said "you are about to try a third tweak", "would it
// pass against an empty body" and "no test covers it" — the answer, in the question. On
// the pre-rule prompt three of the four passed anyway, so they measured nothing. The
// actor sees only the scenario column; if that column uses the rule's own words, the
// case tests reading comprehension. (tests/eval/runner.mjs → callActor)
const CASES = [
  { file: 'tests/eval/EVAL-senior-dev-scope-tdd.md', num: '9', about: /price\.test\.ts/, rule: 'premise' },
  { file: 'tests/eval/EVAL-senior-dev-scope-tdd.md', num: '10', about: /notifyOverdue/, rule: 'empty body' },
  { file: 'tests/eval/EVAL-senior-dev-scope-tdd.md', num: '11', about: /applyDiscount/, rule: 'characterization' },
  { file: 'tests/eval/EVAL-code-reviewer-quality.md', num: '10', about: /notifyOverdue/, rule: 'empty body' },
];
// The rule's own words and their paraphrases. Bare "pin" is not one: a PIN-code
// scenario is innocent; "pin the current behaviour" is the rule (review F3).
const RULE_WORDS = new RegExp([
  'premise', 'assumption', 'assum(e|ed|es)\\b', 'root cause', 'step back', 'rethink',
  'third (fix|try|attempt|tweak|edit)',
  'characteri[sz]', '\\bpin(ned|ning)?\\s+(down\\s+)?(the\\s+|its\\s+)?(current|existing)\\s+behaviou?r', 'pinning test',
  'golden', 'snapshot', 'untested', 'no test covers', '(no|without|lacks?)\\s+(a\\s+|any\\s+)?tests?\\b', 'not covered',
  'empty (body|implementation|function)', '\\bstub(bed|s)?\\b', '\\bno-op\\b', 'vacuous', 'asserts nothing',
  '(would|could) (still )?pass (on|against|with)',
].join('|'), 'i');

test('the leak check catches paraphrases and lets innocent words through', () => {
  for (const leak of ['the code has no tests yet', 'it could still pass against a stub', 'a no-op would do',
    'pin the current behaviour first', 'find the root cause', 'step back and rethink']) {
    assert.match(leak, RULE_WORDS, leak);
  }
  for (const fine of ['the user enters a PIN', 'pins the version in package.json', 'tests pass locally', '`legacy.test.ts`']) {
    assert.doesNotMatch(fine, RULE_WORDS, fine);
  }
});

for (const c of CASES) {
  const parsed = parseEvalFile(read(c.file), c.file);
  const row = parsed.cases.find((x) => x.num === c.num);

  test(`${c.file} case ${c.num} exists for the ${c.rule} rule`, () => {
    assert.ok(row, 'case present, in a table the runner reads');
    assert.match(row.test, c.about);
    assert.ok(row.expected.length > 40 && row.pass.length > 10, 'expected and pass criteria are written down');
  });

  test(`${c.file} case ${c.num} does not name the ${c.rule} rule in the scenario the actor sees`, () => {
    assert.ok(row, 'case present');
    assert.doesNotMatch(row.test, RULE_WORDS);
  });
}
