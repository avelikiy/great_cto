// A scale nobody enforces is a list of sizes that happened.
//
// The board accumulated 22 distinct font sizes before anyone counted: 9px on a
// tag, 11.5 / 12.5 / 13.5 in four places each, and 17 / 20 / 21 / 26 as
// one-offs. Every one was a reasonable local choice. Nothing was ever wrong
// enough to notice, which is the whole problem — the same reason the eight dead
// custom properties survived (see css-tokens.test.mjs) and the same reason a
// conditional block could sit above the rules it overrode (css-cascade).
//
// The exceptions are deliberate and have to be named. Icon glyphs are sized to
// their box, not to the text ramp, and longform document typography is content
// rather than chrome. Both pass by matching a selector, so adding one means
// writing down which selector and why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontSizes, offScaleSizes, declaredScale, danglingRefs } from '../../scripts/lib/css-type-scale.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A fixture ladder, for the unit tests below that need a fixed one. The BOARD's
// ladder is read from the board — see the last two tests. A literal array here
// once claimed to be "the steps declared as --fs-* on :root" and was not: it
// carried 10 and 18, which no token declares, and lacked 16 and 19, which two
// do. Nothing could notice, because the array and the tokens were never
// compared to each other.
const SCALE = [10, 11, 12, 13, 14, 15, 18, 22, 24, 30, 36, 52];

const EXCEPTIONS = [
  { match: /\.star|\.ap-x|\.emoji|\.ac-mark/, why: 'glyph sized to its box, not to the text ramp' },
  { match: /\.memory-doc |\.side-desc\.md /, why: 'longform document typography — content, not chrome' },
  { match: /\.share-card h2/, why: 'the one showcase hero, deliberately off-ramp' },
];

test('a size inside a comment or a string is not an authored size', () => {
  const css = '/* font-size: 99px */ a { content: "font-size: 98px"; font-size: 13px; }';
  assert.deepEqual(fontSizes(css).map((f) => f.px), [13]);
});

test('the reported line survives a multi-line comment above it', () => {
  const css = '/* a\n b\n c */\n.x { font-size: 13px; }';
  assert.equal(fontSizes(css)[0].line, 4);
});

test('an off-scale size is a finding, and its selector is named', () => {
  const f = offScaleSizes('.tag { font-size: 9px; }', { scale: SCALE });
  assert.equal(f.length, 1);
  assert.equal(f[0].px, 9);
  assert.match(f[0].selector, /\.tag/);
});

test('an excused selector may sit off the scale', () => {
  assert.deepEqual(
    offScaleSizes('.notif-row .emoji { font-size: 16px; }', { scale: SCALE, exceptions: EXCEPTIONS }), []);
});

test('the excuse is per selector, not per size — 16px elsewhere still fails', () => {
  const f = offScaleSizes('.some-label { font-size: 16px; }', { scale: SCALE, exceptions: EXCEPTIONS });
  assert.equal(f.length, 1, 'a size is not excused just because another selector uses it');
});

test("every font-size in the board's stylesheet is a step on the scale", () => {
  // When this fails: use a --fs-* token. Add an exception only for a glyph or
  // for longform document content, and say which in EXCEPTIONS above.
  const html = readFileSync(join(REPO, 'packages', 'board', 'public', 'index.html'), 'utf8');
  const scale = declaredScale(html);
  assert.equal(scale.state, 'ok', 'the board declares no --fs-* tokens — this check cannot speak');
  const off = offScaleSizes(html, { scale: scale.steps, exceptions: EXCEPTIONS });
  assert.deepEqual(off, [],
    off.map((f) => `${f.px}px at line ${f.line} in "${f.selector}"`).join('; '));
});

test('the ladder is read from the board, not from a number typed here', () => {
  // The bug this replaces: a literal array in this file that had drifted two
  // steps from the tokens and could never be caught, because the guard read the
  // array and the page read the tokens.
  const html = readFileSync(join(REPO, 'packages', 'board', 'public', 'index.html'), 'utf8');
  const { state, steps, tokens } = declaredScale(html);
  assert.equal(state, 'ok');
  assert.equal(steps.length, new Set(steps).size, 'two tokens declaring the same px is a step that is not a step');
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'steps come back ordered');
  assert.equal(steps.filter((n) => !Number.isInteger(n)).length, 0,
    `half-pixel steps are what a scale looks like when it is invented one declaration at a time: ${steps.filter((n) => !Number.isInteger(n)).join(', ')}`);
  assert.ok(Object.keys(tokens).length >= 8, `only ${Object.keys(tokens).length} --fs-* tokens found — the parser probably missed the block`);
});

test('every var(--fs-…) names a token that exists', () => {
  // 298 of the board's 306 font-size declarations go through var(), and the
  // literal-only sweep saw none of them. For those the question is not whether
  // the size is on the ladder — it is by construction — but whether the token
  // is real: a typo falls back to the inherited size and renders at the wrong
  // step, silently.
  const html = readFileSync(join(REPO, 'packages', 'board', 'public', 'index.html'), 'utf8');
  const dangling = danglingRefs(html);
  assert.deepEqual(dangling, [],
    dangling.map((r) => `${r.token} at line ${r.line} is referenced but never declared`).join('; '));
});
