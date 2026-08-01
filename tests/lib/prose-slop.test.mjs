// The detector is only worth having if it stays quiet. Every rule here has a
// must-not-fire twin, because the failure mode of a style linter is not missing
// a tic — it is crying wolf on a code sample until someone deletes the hook.
//
// The masking tests are the load-bearing ones: `utilize` is slop in a sentence
// and an API name in a call, and the linter has to tell those apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSlop, maskCode, RULES, parseDenyList, loadDenyList } from '../../scripts/lib/prose-slop.mjs';

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

// ── one list ────────────────────────────────────────────────────────────────
//
// prose-deny.txt and this module were two lists of banned phrases that nobody
// diffed: the file was documented "reference-only" while qa-engineer ran a
// hand-copied subset. These pin the file as the source, so a phrase added there
// is checked without touching code — and pin the two ways that can go wrong:
// a section header that stops mapping, and a hedge rule that fires by default.

test('the deny file is the phrase source — its RULE sections pick the check', () => {
  const d = parseDenyList([
    '# junk before any section is ignored',
    'stray phrase',
    '# ── RULE-04: filler ──',
    'in order to',
    '# ── RULE-05: clichés ──',
    'state-of-the-art',
    '# ── RULE-H: hedges ──',
    'appears to',
  ].join('\n'));
  assert.deepEqual(d['SLOP-OPENER'], ['in order to']);
  assert.deepEqual(d['SLOP-DEAD'], ['state-of-the-art']);
  assert.deepEqual(d['SLOP-HEDGE'], ['appears to']);
  assert.ok(!Object.values(d).flat().includes('stray phrase'),
    'a phrase with no section has no rule to belong to');
});

test('a phrase only in the file is enforced without touching code', () => {
  const deny = { 'SLOP-OPENER': ['in order to'] };
  assert.deepEqual(detectSlop('We did it in order to ship.'), [],
    'not a built-in');
  assert.equal(detectSlop('We did it in order to ship.', { deny })[0].rule, 'SLOP-OPENER');
});

test('a built-in keeps its specific replacement when the file repeats the phrase', () => {
  const deny = { 'SLOP-DEAD': ['comprehensive'] };
  const [f] = detectSlop('A comprehensive rewrite.', { deny });
  assert.match(f.fix, /say the scope/, 'the flat file cannot carry a per-phrase fix');
  assert.equal(detectSlop('A comprehensive rewrite.', { deny }).length, 1,
    'and the phrase is not reported twice');
});

test('hedges do not fire by default — a prompt describing hedging is not hedging', () => {
  const deny = { 'SLOP-HEDGE': ['appears to'] };
  assert.deepEqual(detectSlop('The bug appears to be a race.', { deny }), []);
  assert.equal(detectSlop('The bug appears to be a race.',
    { deny, rules: ['SLOP-HEDGE'] })[0].rule, 'SLOP-HEDGE');
});

test('a missing deny file leaves the built-ins working', async () => {
  assert.deepEqual(await loadDenyList('/nonexistent/prose-deny.txt'), {});
  assert.ok(detectSlop('We utilize it.', { deny: {} }).length > 0);
});

test('the real deny file parses and every section maps to a known rule', async () => {
  const d = await loadDenyList();
  assert.ok(Object.keys(d).length >= 3, 'the shipped file has all three sections');
  for (const [id, phrases] of Object.entries(d)) {
    assert.ok(RULES[id], `${id} is not a rule`);
    assert.ok(phrases.length > 0, `${id} is empty`);
    assert.ok(phrases.every((p) => p === p.toLowerCase()), `${id} holds an uncased phrase`);
  }
});

// ─── masking: a nested bullet is prose, not a code block ───────────────────
//
// Markdown's indented-code-block rule is 4 spaces, and a nested list item is
// also indented 4 spaces. Blanking on indentation alone meant the linter
// checked top-level bullets and silently skipped everything one level in — the
// same phrase flagged in one place and invisible in another, which reads as the
// phrase being acceptable there.

test('slop inside a nested list item is found', () => {
  const md = '# D\n\n- top\n    - nested item that is basically filler\n';
  const hits = detectSlop(md).map(f => f.quote);
  assert.ok(hits.includes('basically'), `nested bullet was skipped; found ${JSON.stringify(hits)}`);
});

test('a numbered nested item is prose too', () => {
  const md = '# D\n\n1. top\n    2. nested step that is basically filler\n';
  assert.ok(detectSlop(md).some(f => f.quote === 'basically'));
});

test('an actual indented code block is still masked', () => {
  const md = '# D\n\nProse.\n\n    const x = "basically";\n';
  assert.deepEqual(detectSlop(md), [], 'indented code is code, whatever words it contains');
});

test('a fenced block is still masked', () => {
  assert.deepEqual(detectSlop('# D\n\n```\nbasically just\n```\n'), []);
});
