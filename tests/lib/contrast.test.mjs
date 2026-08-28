// The check that would have caught the unreadable grid.
//
// A stylesheet used `--muted` in 61 places and defined it in none, so every one
// fell through to an inline fallback authored for a light theme. The densest
// block on the page rendered at 2.62:1 against a 4.5:1 floor, and it was a
// person noticing months later that found it. Three CSS checks already ran in
// CI; none of them asks whether the result can be read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseColor, composite, luminance, ratio, readTokens, auditContrast, hardcodedColors,
  AA_TEXT, AA_LARGE,
} from '../../scripts/lib/contrast.mjs';

test('the ratio matches the values WCAG publishes', () => {
  const white = parseColor('#ffffff');
  const black = parseColor('#000000');
  assert.equal(Math.round(ratio(white, black)), 21);
  assert.equal(Math.round(ratio(white, white)), 1);
  // #767676 on white is the canonical worked example of exactly-AA text.
  assert.ok(Math.abs(ratio(parseColor('#767676'), white) - 4.54) < 0.02);
});

test('the original defect is reproduced, not just described', () => {
  // The exact pair from the incident: the light-theme fallback grey the missing
  // token fell through to, on the chip surface it was rendered on. The comment
  // left in the stylesheet says 2.62:1. If this module disagreed with the
  // measurement that fixed the bug, the module would be the thing that is wrong.
  const fell_through_to = parseColor('#5f5e5a');
  const chip_surface = parseColor('#171d21');
  const r = ratio(fell_through_to, chip_surface);
  assert.ok(Math.abs(r - 2.62) < 0.02, `expected ~2.62:1, got ${r.toFixed(2)}`);
  assert.ok(r < AA_TEXT, 'and it is below the floor, which is the whole point');
});

test('a translucent colour is measured as the eye receives it', () => {
  const bg = parseColor('#0a0e0c');
  const glass = parseColor('rgba(255, 255, 255, 0.06)');
  const flat = composite(glass, bg);
  assert.ok(luminance(flat) > luminance(bg), 'compositing lightens it');
  assert.ok(luminance(flat) < luminance(parseColor('#ffffff')), 'but nowhere near opaque white');
  // Treating it as opaque white would claim a contrast the reader never gets.
  assert.ok(ratio(flat, bg) < 1.6);
});

test('a colour that cannot be parsed is unknown, never assumed', () => {
  // oklch and hsl are legitimate CSS this module does not read. Guessing would
  // produce a confident ratio for a colour nobody measured — the failure this
  // repository keeps closing, one level down.
  assert.equal(parseColor('oklch(0.7 0.15 160)'), null);
  assert.equal(parseColor('hsl(160 100% 43%)'), null);
  assert.equal(parseColor('rebeccapurple'), null);

  const { unknown, results } = auditContrast({
    tokens: { '--bg-page': '#0a0e0c', '--fg': 'oklch(0.7 0.15 160)' },
    surfaces: ['--bg-page'],
    text: [{ name: '--fg', floor: AA_TEXT }],
  });
  assert.deepEqual(unknown, ['--fg']);
  assert.equal(results.length, 0, 'an unmeasured token yields no verdict at all');
});

test('the worst surface is the one reported', () => {
  const { results } = auditContrast({
    tokens: {
      '--bg-page': '#000000',
      '--bg-card': '#333333',   // the harder bed for a mid grey
      '--fg': '#777777',
    },
    surfaces: ['--bg-page', '--bg-card'],
    text: [{ name: '--fg', floor: AA_TEXT }],
  });
  assert.equal(results[0].on, '--bg-card');
  assert.equal(results[0].ok, false);
});

test('the board reads at AA today, and says so from its own tokens', () => {
  // Not a fixture: the shipped stylesheet. If a future edit darkens a text token
  // or lightens a surface, this is where it stops.
  const tokens = readTokens(readFileSync('packages/board/public/index.html', 'utf8'));
  assert.ok(Object.keys(tokens).length > 20, 'the :root block was found');

  const { results, failures, unknown } = auditContrast({
    tokens,
    surfaces: ['--bg-page', '--bg-card', '--bg-muted', '--bg-strong', '--bg-elevated',
               '--surface-drawer', '--bg-panel'],
    text: [
      { name: '--text', floor: AA_TEXT }, { name: '--text2', floor: AA_TEXT },
      { name: '--text3', floor: AA_TEXT }, { name: '--accent-text', floor: AA_TEXT },
      { name: '--p0-fg', floor: AA_TEXT }, { name: '--p1-fg', floor: AA_TEXT },
      { name: '--p2-fg', floor: AA_TEXT }, { name: '--p3-fg', floor: AA_TEXT },
      // Status dots and the focus ring are UI boundaries, not prose: 3:1.
      { name: '--accent', floor: AA_LARGE }, { name: '--focus-ring', floor: AA_LARGE },
      { name: '--status-backlog', floor: AA_LARGE }, { name: '--status-todo', floor: AA_LARGE },
      { name: '--status-progress', floor: AA_LARGE }, { name: '--status-blocked', floor: AA_LARGE },
      { name: '--status-gate', floor: AA_LARGE },
    ],
  });

  assert.deepEqual(unknown, [], 'every token the board declares is measurable');
  assert.equal(results.length, 15);
  assert.deepEqual(
    failures.map((f) => `${f.token} ${f.ratio.toFixed(2)}:1 on ${f.on} (floor ${f.floor})`), []);
});

test('colours that bypass the token system are frozen, not forgiven', () => {
  // 29 declarations write a hex straight into a rule instead of using a token:
  // nine `#fff`, three `#0f1115`, and a scatter of status and badge colours.
  // They are real debt — the contrast audit above cannot see them, because it
  // reads `:root`, and they are not there.
  //
  // Frozen rather than fixed here: tokenising 29 declarations is its own change
  // with its own review. What this stops is the number GROWING. A ratchet says
  // out loud that the debt exists, which a silent allowance does not.
  const FROZEN = 29;
  const found = hardcodedColors(readFileSync('packages/board/public/index.html', 'utf8'));
  assert.ok(found.length <= FROZEN,
    `${found.length} hardcoded colour declarations, up from ${FROZEN} — ` +
    `new ones must use a token: ${found.slice(FROZEN).map((f) => `${f.prop}: ${f.value}`).join(', ')}`);
  if (found.length < FROZEN) {
    assert.fail(`down to ${found.length} — lower FROZEN to ${found.length} so the ratchet keeps holding`);
  }
});
