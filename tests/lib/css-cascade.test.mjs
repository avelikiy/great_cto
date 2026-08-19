// A declaration that loses is not a declaration.
//
// Twice in two days a conditional block in the board's stylesheet was written
// ABOVE the rules it overrides. At equal specificity the later rule wins, so
// half of each block was ignored while reading as correct in the diff: the
// phone's two-column stat grid lost to the four-column rule 1100 lines below,
// and `.inbox-row .actions { gap: 12px }` under `pointer: coarse` lost to that
// rule's own 4px — leaving Approve and Reject 4px apart on a touch screen,
// beneath a block that said 12.
//
// Both were caught by looking at the rendered page. Noticing does not scale, and
// the noticing is what failed. This reads the CSS instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { declarations, specificity, losingDeclarations } from '../../scripts/lib/css-cascade.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Reading a stylesheet ────────────────────────────────────────────────────

test('a grouped selector is split — each selector carries the declaration', () => {
  // The real bug hid in a group: `.gate-actions, .side-gate-actions,
  // .inbox-row .actions { gap: 12px }`. A checker that treats the group as one
  // opaque string never matches the `.inbox-row .actions` rule that beat it.
  const d = declarations('@media (pointer: coarse) { .a, .b .c { gap: 1px; } }');
  assert.deepEqual(d.map((x) => x.sel), ['.a', '.b .c']);
  assert.ok(d.every((x) => x.prop === 'gap' && x.cond === '@media (pointer: coarse)'));
});

test('comments cannot shift the reported line numbers', () => {
  // Offsets are preserved by blanking comments rather than deleting them; a
  // finding that names the wrong line sends the reader to the wrong place.
  const css = '.a { color: red; }\n/* a\n comment\n spanning lines */\n@media (x) { .a { color: blue; } }';
  const d = declarations(css).find((x) => x.cond);
  assert.equal(d.line, 5);
});

test('keyframes and font-face are not cascade questions', () => {
  const css = '@keyframes k { 0% { opacity: 0; } }\n@font-face { font-family: X; }\n.a { color: red; }';
  assert.deepEqual(declarations(css).map((x) => x.sel), ['.a']);
});

// ── Specificity, only precise enough to decide a tie ─────────────────────────

test('specificity counts ids, classes and types', () => {
  assert.deepEqual(specificity('#x'), [1, 0, 0]);
  assert.deepEqual(specificity('.a .b'), [0, 2, 0]);
  assert.deepEqual(specificity('div span'), [0, 0, 2]);
  assert.deepEqual(specificity('.topbar .crumbs > span'), [0, 2, 1]);
});

// ── What counts as losing ───────────────────────────────────────────────────

test('a conditional declaration beaten by a LATER equal rule is reported', () => {
  const f = losingDeclarations('@media (max-width: 768px) { .a { gap: 12px; } }\n.a { gap: 4px; }');
  assert.equal(f.length, 1);
  assert.equal(f[0].property, 'gap');
  assert.match(f[0].why, /the later rule wins/);
});

test('a rule the block comes AFTER is not a finding — that is the working order', () => {
  assert.deepEqual(losingDeclarations('.a { gap: 4px; }\n@media (max-width: 768px) { .a { gap: 12px; } }'), []);
});

test('a lower-specificity later rule loses to the block, so it is not a finding', () => {
  // Order only decides ties. `.wrap .a` beats a later bare `.a` wherever it sits.
  assert.deepEqual(losingDeclarations('@media (x) { .wrap .a { gap: 12px; } }\n.a { gap: 4px; }'), []);
});

test('a different property in the same later rule is not a finding', () => {
  assert.deepEqual(losingDeclarations('@media (x) { .a { gap: 12px; } }\n.a { color: red; }'), []);
});

test('two conditional blocks are a deliberate choice, not a silent loss', () => {
  // Both may match; which wins is the author's business and not a defect shape.
  assert.deepEqual(losingDeclarations(
    '@media (pointer: coarse) { .a { gap: 12px; } }\n@media (max-width: 768px) { .a { gap: 8px; } }'), []);
});

// ── The stylesheet this was bought by ───────────────────────────────────────

test("the board's stylesheet has no declaration that never applies", () => {
  // When this fails, read the finding — it names the losing declaration, the
  // rule that beats it, and both line numbers. The fix is almost always to move
  // the conditional block below the rules it overrides, not to raise its
  // specificity.
  const html = readFileSync(join(REPO, 'packages', 'board', 'public', 'index.html'), 'utf8');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  assert.ok(css.length > 10000, 'located the inline stylesheet');
  const f = losingDeclarations(css);
  assert.deepEqual(f, [], f.map((x) => `${x.selector}{${x.property}} line ${x.losingLine} < ${x.winningLine}`).join('; '));
});
