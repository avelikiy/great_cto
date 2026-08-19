// The board on a phone.
//
// A design audit measured it: the sidebar was a fixed 240px at every width and
// no media query touched it, so a 375px screen got 135px of workspace — narrower
// than one kanban column (264px). Everything else on the page was fine; the
// board was simply unusable on the device it gets checked from most.
//
// Collapsing it exposed what it had been hiding. The topbar actions ran to 546px
// inside a container with `overflow: hidden`, so "New issue" was not awkward, it
// was past the edge and unclickable, and the four-column stat grids lost their
// fourth cell the same way. A drawer alone would have been a fix nobody could
// use.
//
// index.html is one inline bundle with no module boundary, so these are static
// assertions on the source — the same idiom as degraded-ui.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'index.html'), 'utf8');

const MOBILE = '@media (max-width: 768px) {';

// The whole block, not a fixed-length slice — a slice that stops short reports a
// missing rule as a missing rule, which is exactly the false alarm these
// assertions exist to avoid.
function blockAt(marker) {
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `could not find ${marker}`);
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`unterminated block at ${marker}`);
}
const mobileBlock = blockAt(MOBILE);

// ── Cascade order ───────────────────────────────────────────────────────────

test('the mobile block sits AFTER every rule it overrides', () => {
  // Bought by writing it in the wrong place. At equal specificity the later rule
  // wins, so a block placed above `.topbar` and `.inbox-summary` silently lost
  // half its declarations while looking entirely correct in the diff — the
  // grids stayed at four columns and the topbar kept its 20px padding.
  const at = html.indexOf(MOBILE);
  assert.ok(at > 0, 'the mobile block exists');
  for (const base of ['.topbar {', '.inbox-summary {', '.mp-hero {', '.mp-secondary {', '.sidebar {']) {
    assert.ok(html.indexOf(base) < at, `${base} must be declared before the block that overrides it`);
  }
});

// ── The drawer ──────────────────────────────────────────────────────────────

test('the collapsed sidebar leaves the tab order, not just the screen', () => {
  // A panel merely translated off-screen is still focusable, so a keyboard user
  // tabs through an invisible menu.
  assert.match(mobileBlock, /\.sidebar \{[\s\S]*?visibility: hidden;/,
    'transform alone does not remove it from the tab order');
  assert.match(mobileBlock, /\.sidebar\.open \{[\s\S]*?visibility: visible;/);
});

test('visibility is switched, never eased', () => {
  // Easing it over the same 200ms as the transform flips it at the halfway
  // mark: the drawer is invisible for the first half of its own slide-in and —
  // worse — still unfocusable at the instant openMenu() moves focus into it,
  // which left focus on the button and the menu unreachable by keyboard.
  assert.match(mobileBlock, /transition: transform 200ms ease-out, visibility 0s linear 200ms;/,
    'on the way out it waits for the slide to finish');
  assert.match(mobileBlock, /\.sidebar\.open \{[\s\S]*?transition: transform 200ms ease-out, visibility 0s;/,
    'on the way in it flips immediately');
});

test('the drawer honours reduced motion', () => {
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{\s*\.sidebar, \.sidebar-scrim \{ transition: none; \}/);
});

test('opening announces itself and locks the page behind it', () => {
  const fn = html.match(/function openMenu\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located openMenu');
  assert.match(fn, /setAttribute\('aria-expanded', 'true'\)/);
  assert.match(fn, /document\.body\.style\.overflow = 'hidden'/, 'the page must not scroll under the drawer');
  assert.match(fn, /\.nav-item\.active'\) \|\| sb\.querySelector\('\.nav-item'\)\)\?\.focus\(\)/,
    'focus moves into the drawer, landing on where you already are');
});

test('closing restores what opening took', () => {
  const fn = html.match(/function closeMenu\([\s\S]*?\n\}/)?.[0];
  assert.match(fn, /setAttribute\('aria-expanded', 'false'\)/);
  assert.match(fn, /document\.body\.style\.overflow = ''/, 'a page that will not scroll and no visible reason why');
  assert.match(fn, /if \(restoreFocus\) btn\?\.focus\(\)/);
});

test('Escape closes it', () => {
  assert.match(html, /if \(e\.key === 'Escape' && menuIsOpen\(\)\) closeMenu\(\);/);
});

test('choosing a tab closes the drawer without yanking focus back', () => {
  // The user is now looking at the panel they picked; pulling focus to the
  // hamburger would undo the thing they came for.
  assert.match(html, /closeMenu\(false\);\s+\/\/ choosing a destination is the end of using the menu/);
});

test('growing past the breakpoint releases the scroll lock', () => {
  // Rotating a phone un-applies the media query. The drawer stops being a
  // drawer while `overflow: hidden` is still on the body.
  assert.match(html, /matchMedia\('\(min-width: 769px\)'\)\.addEventListener\('change'[\s\S]{0,90}closeMenu\(false\)/);
});

// ── What the drawer exposed ─────────────────────────────────────────────────

test('the topbar fits, and the buttons it shrinks keep their names', () => {
  assert.match(mobileBlock, /\.topbar \.crumbs \{ min-width: 0;/,
    'crumbs that cannot shrink push the actions past the edge of an overflow:hidden container');
  assert.match(mobileBlock, /\.btn-label \{ display: none; \}/);
  // Hiding a label is only acceptable if the name survives somewhere a screen
  // reader reaches.
  assert.match(html, /<button class="btn-new"[^>]*aria-label="New issue"/);
  assert.match(html, /<span class="btn-label"[^>]*>Share<\/span>/);
});

test('the stat grids wrap instead of being clipped', () => {
  for (const [sel, cols] of [
    ['.inbox-summary', 'repeat(2, 1fr)'],
    ['.mp-secondary', 'repeat(2, 1fr)'],
    ['.mp-hero', '1fr'],
    ['.mp-row', '1fr'],
  ]) {
    assert.ok(mobileBlock.includes(`${sel} { grid-template-columns: ${cols}; }`),
      `${sel} still overflows its container at 375px`);
  }
});

// ── The row itself ──────────────────────────────────────────────────────────

test('the inbox row stops being three columns on a phone', () => {
  // Measured, not eyeballed: the page gives 64px to its side padding and the row
  // another 30px to border and padding, leaving 281px for the tracks. The fixed
  // ones — id 110, two 14px gaps, and a 44px Approve/Reject pair at about 156 —
  // come to 294. The 1fr title column resolves to ZERO and the row overflows its
  // own border box. Raising the buttons to a real touch target is what finished
  // it: at 24px they fit, at 44px they do not.
  assert.match(mobileBlock, /\.inbox-row \{\s*display: flex; flex-wrap: wrap;/,
    'three rows on a phone, not three columns');
  assert.match(mobileBlock, /\.inbox-row \.ttl \{ order: 1; flex: 1 1 100%;/,
    'the title takes the full width it was being denied');
  assert.match(mobileBlock, /-webkit-line-clamp: 2; white-space: normal;/,
    'and two wrapped lines, since a phone has the vertical room it lacks sideways');
});

test('the id and the status share a line, and a gate keeps its own', () => {
  assert.match(mobileBlock, /\.inbox-row \.actions \{ order: 3; margin-left: auto; \}/,
    'stacked, each took a full row and a four-line card said three things');
  assert.match(mobileBlock, /\.inbox-row \.actions:has\(\.gate-btn\) \{ flex: 1 0 100%;/,
    'except a gate, where the line is a 44px pair and the target size is the point');
});

test('the phone keeps where you are, not the whole path', () => {
  // Raising every control to 44px gave the actions 223px of a 375px bar and
  // crushed the breadcrumb to "g… / B." — present, unreadable, worse than absent.
  assert.match(mobileBlock, /#crumb-project \{ display: none; \}/);
  assert.match(mobileBlock, /\.topbar \.crumbs \.here \{ color: var\(--text\)/);
});
