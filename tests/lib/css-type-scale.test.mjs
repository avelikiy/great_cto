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
import { fontSizes, offScaleSizes } from '../../scripts/lib/css-type-scale.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The steps declared as --fs-* on :root, in px.
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
  const off = offScaleSizes(html, { scale: SCALE, exceptions: EXCEPTIONS });
  assert.deepEqual(off, [],
    off.map((f) => `${f.px}px at line ${f.line} in "${f.selector}"`).join('; '));
});
