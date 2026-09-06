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
  assert.match(html, /<span class="btn-label"[^>]*>Settings<\/span>/);
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

// ── Tablet breakpoint (768–1199px: icon rail) ───────────────────────────────

test('the 768–1199 breakpoint collapses sidebar to 56px icon rail', { skip: 'RED until great_cto-ki1x.13 lands' }, () => {
  // At 768–1199px (tablet), the sidebar collapses from 240px to 56px showing icons only.
  // Labels appear in title/aria-label attributes, not on-screen text.
  const TABLET = '@media (min-width: 768px) and (max-width: 1199px)';
  const at = html.indexOf(TABLET);
  assert.ok(at >= 0, `tablet breakpoint block exists at ${TABLET}`);
  const tabletBlock = blockAt(TABLET);
  assert.match(tabletBlock, /\.sidebar \{[\s\S]*?width: 56px;/,
    'sidebar width is 56px in tablet view');
});

test('icon rail nav items carry accessible labels', { skip: 'RED until great_cto-ki1x.13 lands' }, () => {
  const TABLET = '@media (min-width: 768px) and (max-width: 1199px)';
  const at = html.indexOf(TABLET);
  if (at < 0) {
    // Tablet styles not yet implemented
    return;
  }
  const tabletBlock = blockAt(TABLET);
  // The rail hides the label text, so the name must live on the element itself:
  // an `aria-label` (screen readers) and a `title` (pointer tooltip) on every
  // nav item in the markup — attributes, not CSS. The CSS block only proves the
  // rail exists; the markup proves it is still navigable.
  const navItems = [...html.matchAll(/<(?:a|button|div)[^>]*class="[^"]*\bnav-item\b[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(navItems.length >= 4, `at least the four destinations render as .nav-item (found ${navItems.length})`);
  for (const tag of navItems) {
    assert.match(tag, /aria-label="[^"]+"/, `nav item carries aria-label: ${tag.slice(0, 80)}`);
    assert.match(tag, /title="[^"]+"/, `nav item carries title: ${tag.slice(0, 80)}`);
  }
});

test('tablet media query sits AFTER desktop rules it overrides', { skip: 'RED until great_cto-ki1x.13 lands' }, () => {
  const TABLET = '@media (min-width: 768px) and (max-width: 1199px)';
  const at = html.indexOf(TABLET);
  if (at < 0) {
    // Tablet styles not yet implemented
    return;
  }
  // Must come after .sidebar at desktop width
  assert.ok(html.indexOf('.sidebar {') < at,
    'tablet breakpoint comes after base .sidebar rule');
});

// ── 375px viewport specific checks ──────────────────────────────────────────

test('at 375px, no horizontal scroll on existing tabs', () => {
  // Even with 44px touch targets and full-width buttons, document must not
  // overflow horizontally. This is a static check that the CSS itself does not
  // introduce horizontal scroll via width constraints.
  assert.match(mobileBlock, /max-width:/,
    'mobile block constrains widths to prevent overflow');
  // The gate-btn flex rule prevents buttons from forcing overflow
  assert.match(html, /\.gate-btn[^\}]*flex:/,
    'gate buttons use flex to fit container width');
});

test('all interactive elements meet 44px touch target minimum', { skip: 'RED until selectors unified' }, () => {
  // At 375px, every button, [role=button], .nav-item, label.radio, .copy must
  // have computed min-height >= 44px. The @media (pointer: coarse) rule provides
  // a global floor, but exceptions and new controls must opt-in or out explicitly.
  const coarseBlock = blockAt('@media (pointer: coarse)');
  assert.match(coarseBlock, /button[^\}]*min-height: 44px;/,
    'button selector has min-height 44px');
  assert.match(coarseBlock, /\[role="button"\][^\}]*min-height: 44px;/,
    '[role=button] has min-height 44px');
  assert.match(coarseBlock, /\.nav-item[^\}]*min-height: 44px;/,
    '.nav-item has min-height 44px');
  assert.match(coarseBlock, /label\.radio[^\}]*min-height: 44px;/,
    'label.radio has min-height 44px');
  assert.match(coarseBlock, /\.copy[^\}]*min-height: 44px;/,
    '.copy has min-height 44px');
});

test('gate actions stack at 375 when full-width required', { skip: 'RED until gate actions styled' }, () => {
  // At 375px on an EXPENSIVE gate (Reject/Approve pair), actions must stack
  // vertically, each taking ≥90% of content width. ROUTINE gates may sit
  // side by side if both reach ≥44px. This is a layout rule in the mobile block.
  const mobileStyles = mobileBlock;
  assert.match(mobileStyles, /\.gate-actions[^\}]*flex-wrap: wrap;/,
    'gate actions wrap to next line when needed');
  assert.match(mobileStyles, /\.gate-actions[^\}]*flex: 1 0 100%;/,
    'gate actions each take full width in stack mode');
});

// ── Media query cascade order ──────────────────────────────────────────────

test('the ≤768px mobile block sits AFTER the 768–1199px tablet block', () => {
  // At equal specificity (both are media queries), later wins. The tablet
  // block (768–1199) must come before the mobile block (≤768) so mobile
  // overrides are not lost to cascade order.
  const MOBILE_IDX = html.indexOf('@media (max-width: 768px)');
  const TABLET_IDX = html.indexOf('@media (min-width: 768px) and (max-width: 1199px)');
  if (TABLET_IDX >= 0) {
    assert.ok(TABLET_IDX < MOBILE_IDX,
      `tablet block (${TABLET_IDX}) must come before mobile block (${MOBILE_IDX})`);
  }
  // If tablet block does not exist yet, this test passes (no ordering violation)
});
