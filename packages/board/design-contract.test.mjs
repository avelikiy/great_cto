// The rest of what a design audit found, and the rules it bought.
//
// Four of these are one-line fixes whose absence was invisible: a focus outline
// drawn in the brand green (1.87:1 on white — the one affordance a keyboard user
// cannot route around, effectively invisible in the light theme), a public
// report published by an unconfirmed toggle, a disabled button explaining itself
// through a tooltip nobody who needs it can open, and live figures set in a
// proportional face so they changed width as they ticked.
//
// The fifth is not a one-liner: a single em dash was carrying five different
// meanings on a screen full of money.
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

// ── Absence has a vocabulary ────────────────────────────────────────────────

test('the three kinds of absence are distinguishable, not one glyph', () => {
  const dict = html.match(/const ABSENCE = \{[\s\S]*?\};/)?.[0];
  assert.ok(dict, 'located the absence vocabulary');
  for (const kind of ['none', 'uncomputable', 'unloaded']) {
    assert.match(dict, new RegExp(`${kind}:`), `${kind} is one of the states that occurs here`);
  }
  const glyphs = [...dict.matchAll(/'([^']+)',/g)].map((m) => m[1]);
  assert.equal(new Set(glyphs).size, glyphs.length, 'two kinds sharing a glyph is the bug this replaces');
});

test('every absence carries the specific reason, never a generic one', () => {
  // A tooltip that only restates the category adds a hover and no information.
  const fn = html.match(/function absent\(kind, why\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located absent()');
  assert.match(fn, /title="\$\{esc\(why\)\}"/, 'reason is on hover');
  assert.match(fn, /aria-label="\$\{esc\(why\)\}"/, 'and in the accessible name — a glyph alone reads as nothing');
  assert.match(fn, /esc\(why\)/, 'escaped, like every other string written into this DOM');

  const calls = [...html.matchAll(/absent\('(\w+)'(,\s*)?([^)]*)\)/g)];
  assert.ok(calls.length >= 6, `expected the metric tiles to use it, found ${calls.length}`);
  for (const c of calls) {
    assert.ok(c[3] && c[3].trim().length > 10, `absent('${c[1]}') was called with no reason`);
  }
});

test('the dashboard tells apart "we looked and there is none" from "we could not look"', () => {
  // The distinction that costs money to get wrong: a zero you can act on versus
  // a gap you cannot.
  assert.match(html, /absent\('unloaded', 'the metrics payload carried no tasks section'\)/);
  assert.match(html, /absent\('uncomputable', 'a measured multiplier needs verdict cost data/);
  assert.match(html, /absent\('none', 'nothing was accepted in this window'\)/);
});

// ── Focus is not decoration ─────────────────────────────────────────────────

test('selection and focus use the focus token, never the brand colour', () => {
  // --accent is #00d97e in both themes; on the light theme's white that is
  // 1.87:1, below the 3:1 floor for a non-text indicator. --focus-ring is
  // already #047857 there (5.48:1) and was used correctly everywhere else.
  assert.match(html, /\.card-selected \{ outline: 2px solid var\(--focus-ring\)/);
  assert.match(html, /\.search-box:focus-within \{ border-color: var\(--focus-ring\)/);
  assert.ok(!/outline: 2px solid var\(--accent/.test(html), 'no focus outline drawn in the brand colour');
});

test('the light theme still defines a distinct focus token', () => {
  // The fix is worthless if both tokens resolve to the same colour.
  const light = html.match(/--focus-ring: #047857;[\s\S]{0,80}--accent: (#[0-9a-f]{6})/i);
  assert.ok(light, 'light theme declares both tokens');
  assert.notEqual(light[1].toLowerCase(), '#047857', 'they must not collapse to one value');
});

// ── Publishing is not a toggle ──────────────────────────────────────────────

test('turning sharing ON confirms; turning it OFF does not', () => {
  const fn = html.match(/async function toggleShare\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located toggleShare');
  assert.match(fn, /if \(enabled && !confirm\(/,
    'asking on the safe direction too would train people to click through the one that matters');
  assert.match(fn, /Anyone holding the link/, 'the dialog says who can read it');
  assert.match(fn, /does not unpublish what has/, 'and that revoking is not undoing');
  assert.ok(fn.indexOf('confirm(') < fn.indexOf("api('/api/share"),
    'the confirm must precede the request');
});

// ── Say nothing rather than say it unreachably ──────────────────────────────

test('no disabled control explains itself through a tooltip', () => {
  // Disabled controls are skipped by screen readers and dropped from the tab
  // order, so the explanation is unreachable by exactly the people who need it.
  const bad = [...html.matchAll(/<button[^>]*\bdisabled\b[^>]*\btitle=/g)];
  assert.deepEqual(bad.map((m) => m[0]), [], 'either keep it operable and explain on use, or do not advertise it');
});

// ── Live figures must not change width as they change value ─────────────────

test('the large live figures use tabular numerals', () => {
  for (const rule of ['.metric-num {', '.cost-cell .v {']) {
    const block = html.slice(html.indexOf(rule), html.indexOf(rule) + 400);
    assert.match(block, /font-variant-numeric: tabular-nums;/,
      `${rule} is a serif face on a page that updates over SSE — a 1 is narrower than an 8`);
  }
});
