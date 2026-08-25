// A token that does not resolve is not a token.
//
// The board's stylesheet used eight custom properties that were never declared
// — `--text1`, `--text-2`, `--text-3`, `--text-muted`, `--bg1`, `--bg2`, `--bg`,
// `--bg-hover` — across 26 declarations, plus `--accent-bg` and `--p1`. None of
// it was an error anywhere. CSS drops an unresolvable `var()` at computed-value
// time, so `.notif-row { background: var(--bg2) }` rendered
// `rgba(0, 0, 0, 0)` — a card with no card — and `.ri-tag.fail { color:
// var(--p1) }` left a failure tag uncoloured.
//
// The ones carrying a fallback were worse, not better. `var(--text-3, #9ca3af)`
// always paints that grey, and `var(--accent-bg, rgba(59,130,246,0.2))` painted
// BLUE inside an emerald design system — surviving the theme switch that was
// supposed to change it. The fallback is what stops anyone noticing.
//
// This is the same shape as css-cascade: a declaration that reads as correct and
// does nothing. That one asks "does this rule win?"; this one asks "does this
// name exist?".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTokenParity, declaredTokens, usedTokens } from '../../scripts/lib/css-tokens.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Reading declarations and uses ───────────────────────────────────────────

test('two declarations on one line are both seen', () => {
  // The palette declares priorities in pairs: `--p0-bg: ...; --p0-fg: ...;`.
  // A line-anchored scan sees only the first and reports the second as
  // undeclared — which is exactly the false alarm that sent the first pass of
  // this check chasing four tokens that were fine.
  const d = declaredTokens('  --p0-bg: rgba(1,2,3,.1);  --p0-fg: #fca5a5;');
  assert.deepEqual([...d].sort(), ['--p0-bg', '--p0-fg']);
});

test('a use with a fallback is still a use, and is marked as such', () => {
  const u = usedTokens('a { color: var(--x, #fff); background: var(--y); }');
  assert.deepEqual(u.get('--x'), { count: 1, withFallback: 1 });
  assert.deepEqual(u.get('--y'), { count: 1, withFallback: 0 });
});

test('a token named only inside a comment or a string is not declared', () => {
  // `content: "--fake: 1"` and `/* --also-fake: 2 */` both look like
  // declarations to a plain regex, and would silence a real finding.
  const css = '/* --also-fake: 2 */ a { content: "--fake: 1"; color: var(--fake); }';
  assert.deepEqual([...declaredTokens(css)], []);
  assert.deepEqual(checkTokenParity(css).undeclared, [{ token: '--fake', count: 1, withFallback: 0 }]);
});

test('a declared token used nowhere is reported separately, not as a defect', () => {
  // Dead but harmless — it renders nothing wrong. Mixing it into `undeclared`
  // would make the real finding hard to see.
  const r = checkTokenParity(':root { --used: 1; --spare: 2; } a { color: var(--used); }');
  assert.deepEqual(r.undeclared, []);
  assert.deepEqual(r.unused, ['--spare']);
});

test('the count is per use, so one bad name in twenty places reads as twenty', () => {
  const r = checkTokenParity('a{color:var(--x)}b{color:var(--x)}c{color:var(--x, red)}');
  assert.deepEqual(r.undeclared, [{ token: '--x', count: 3, withFallback: 1 }]);
});

// ── The stylesheet this was bought by ───────────────────────────────────────

test("every var() in the board's stylesheet resolves to a declared token", () => {
  // When this fails, the finding names the token and how many places use it.
  // The fix is to point the use at the token that exists — never to add the
  // missing name to `:root` without checking which of the two spellings the
  // rest of the file already uses.
  const html = readFileSync(join(REPO, 'packages', 'board', 'public', 'index.html'), 'utf8');
  assert.ok(html.length > 10000, 'located the board page');
  const { undeclared } = checkTokenParity(html);
  assert.deepEqual(undeclared, [],
    undeclared.map((u) => `${u.token} used ${u.count}× (${u.withFallback} with a fallback)`).join('; '));
});
