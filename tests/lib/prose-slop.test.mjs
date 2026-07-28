// The detector is only worth having if it stays quiet. Every rule here has a
// must-not-fire twin, because the failure mode of a style linter is not missing
// a tic — it is crying wolf on a code sample until someone deletes the hook.
//
// The masking tests are the load-bearing ones: `utilize` is slop in a sentence
// and an API name in a call, and the linter has to tell those apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSlop, maskCode, RULES } from '../../scripts/lib/prose-slop.mjs';

const rules = (text) => detectSlop(text).map((f) => f.rule);

// ── it fires on the real thing ──────────────────────────────────────────────

test('dead words are caught and given a plain replacement', () => {
  const f = detectSlop('We utilize a robust caching layer.');
  assert.deepEqual(f.map((x) => x.rule), ['SLOP-DEAD', 'SLOP-DEAD']);
  assert.equal(f[0].quote, 'utilize');
  assert.match(f[0].fix, /use/, 'a finding without a replacement is just nagging');
});

test('throat-clearing openers are caught', () => {
  assert.ok(rules("Here's the thing, the cache is cold.").includes('SLOP-OPENER'));
  assert.ok(rules("It's worth noting that the test fails.").includes('SLOP-OPENER'));
});

test('a claim with nobody behind it is caught', () => {
  assert.ok(rules('Studies show this pattern is faster.').includes('SLOP-WEASEL'));
});

test('the end-of-session achievement wall is caught', () => {
  const r = rules('Successfully implemented the parser. Perfect! All set!');
  assert.ok(r.filter((x) => x === 'SLOP-BRAG').length >= 3);
});

test('the passive that hides who did it is caught', () => {
  const f = detectSlop('Error handling has been implemented across all endpoints.');
  assert.ok(f.some((x) => x.rule === 'SLOP-PASSIVE-BRAG'));
  assert.match(f.find((x) => x.rule === 'SLOP-PASSIVE-BRAG').fix, /name who/);
});

test('decorative emoji in a heading is caught', () => {
  assert.ok(rules('## 🚀 Getting started\n').includes('SLOP-EMOJI-HEAD'));
});

test('empty adverbs are caught as whole words only', () => {
  assert.ok(rules('This is basically correct.').includes('SLOP-ADVERB'));
  assert.deepEqual(rules('The verystring parser handles it.'), [],
    'a substring inside a word is not the word');
});

// ── it stays quiet where it must ────────────────────────────────────────────

test('code inside a fence is never prose', () => {
  const text = '# Notes\n\n```js\nconst robust = utilize(delve);\n```\n';
  assert.deepEqual(detectSlop(text), []);
});

test('an inline code span is never prose', () => {
  assert.deepEqual(detectSlop('Call `utilize()` when the cache is cold.'), []);
});

test('a URL and a link target are never prose', () => {
  assert.deepEqual(detectSlop('See [the docs](https://x.dev/robust/utilize-guide).'), []);
});

test('a file path is never prose', () => {
  assert.deepEqual(detectSlop('Edit scripts/lib/robust-utilize.mjs and rerun.'), []);
});

test('a block quote is someone else\'s writing, not ours', () => {
  assert.deepEqual(detectSlop('> We utilize a robust, comprehensive approach.'), []);
});

test('an indented code block is never prose', () => {
  assert.deepEqual(detectSlop('Run it:\n\n    npm run utilize --robust\n'), []);
});

test('an html comment is not shipped prose', () => {
  assert.deepEqual(detectSlop('<!-- TODO: delve into this -->'), []);
});

test('a status emoji in a table or sentence survives — that is how we report', () => {
  assert.deepEqual(rules('| check | ✅ |\n'), [], 'table cells are not headings');
  assert.deepEqual(rules('The suite is green ✅ after the fix.'), []);
});

// ── the escape hatch ────────────────────────────────────────────────────────

test('an opt-out may carry its reason — an unexplained marker gets deleted later', () => {
  assert.deepEqual(detectSlop('Prefer numbers over "comprehensive". <!-- slop-ok: it is the example -->'), []);
});

test('a line can opt out, because sometimes the word IS the subject', () => {
  assert.deepEqual(detectSlop('The word utilize is banned. <!-- slop-ok -->'), []);
  assert.ok(detectSlop('The word utilize is banned.').length > 0,
    'and without the marker it still fires');
});

// ── reporting contract ──────────────────────────────────────────────────────

test('findings carry a line number that points at the real line', () => {
  const text = 'line one\nline two\nWe utilize it.\n';
  const [f] = detectSlop(text);
  assert.equal(f.line, 3, 'masking must preserve offsets or every report lies');
});

test('a fenced block does not shift the lines that follow it', () => {
  const text = '```\nutilize\nutilize\n```\nWe utilize it.\n';
  const f = detectSlop(text);
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 5);
});

test('findings come back in document order', () => {
  const f = detectSlop('We utilize it.\n\nStudies show it works.\n');
  assert.deepEqual(f.map((x) => x.line), [1, 3]);
});

test('rules can be narrowed to one id', () => {
  const text = 'Successfully implemented a robust parser.';
  assert.deepEqual([...new Set(detectSlop(text, { rules: ['SLOP-DEAD'] }).map((f) => f.rule))],
    ['SLOP-DEAD']);
});

test('every rule id that fires has a human description', () => {
  const text = "Here's the thing: studies show we utilize a robust, basically "
    + 'successful parser. Error handling has been implemented.\n## 🚀 Ship it\n';
  const fired = new Set(detectSlop(text).map((f) => f.rule));
  assert.ok(fired.size >= 5, 'the sample should trip most rules');
  for (const id of fired) assert.ok(RULES[id], `${id} has no description`);
});

test('empty and junk input do not throw', () => {
  for (const v of ['', null, undefined, 0]) assert.deepEqual(detectSlop(v), []);
});

test('maskCode keeps the line count identical', () => {
  const text = 'a\n```\nb\nc\n```\nd\n';
  assert.equal(maskCode(text).split('\n').length, text.split('\n').length);
});
