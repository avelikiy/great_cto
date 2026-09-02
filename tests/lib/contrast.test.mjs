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
  parseColor, composite, luminance, ratio, readTokens, readThemes, auditContrast, hardcodedColors,
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
  assert.deepEqual(unknown, [{ token: '--fg', state: 'unparseable', value: 'oklch(0.7 0.15 160)' }]);
  assert.equal(results.length, 0, 'an unmeasured token yields no verdict at all');
});

test('unmeasurable says which kind: never declared, or declared as something that is not a colour', () => {
  // Both fail closed. The difference is only in what the reader is told, and it
  // decides where they look: at the declarations, or at the value in front of them.
  const { unknown } = auditContrast({
    tokens: { '--bg-page': '#0a0e0c', '--fg': 'prose that is not a colour' },
    surfaces: ['--bg-page'],
    text: [{ name: '--fg', floor: AA_TEXT }, { name: '--never-written', floor: AA_TEXT }],
  });
  assert.deepEqual(unknown, [
    { token: '--fg', state: 'unparseable', value: 'prose that is not a colour' },
    { token: '--never-written', state: 'undeclared' },
  ]);
});

test('a comment that names tokens and quotes ratios is not read as a declaration', () => {
  // The real shape, from this board's own stylesheet: a note about FIND-3 that
  // mentions --bg-strong and quotes "4.53:1", sitting AFTER the declaration.
  // `--token : anything ;` matched the sentence, so --bg-strong became "the
  // darkest surface" and the audit called it unmeasurable — naming a token when
  // the fault was the prose about it. Shortening the comment made it pass, which
  // is why this is a test and not a shorter comment.
  const css = `
:root {
  --bg-strong: #1e272c;
  /* FIND-3. --text3 sits at 4.53:1 on --bg-strong: the darkest surface;
     --bg-strong: prose that is not a colour; */
  --text3: #848f88;
}
[data-theme="light"] {
  --bg-strong: #e2e8e4;
  --text3: #55625b;
  /* the light ground carries three ink steps, unlike --bg-strong: the dark one;
     --text3: not this sentence; */
}`;
  // readTokens is tested on the raw CSS too, not only through readThemes.
  // readThemes strips first and hands readTokens clean text, so going through it
  // alone would leave readTokens' own guard unable to fail — and every other
  // caller reads raw CSS.
  const direct = readTokens(css);
  assert.equal(direct['--bg-strong'], '#1e272c', 'readTokens on raw CSS: the declaration wins');
  assert.equal(direct['--text3'], '#848f88');

  const themes = readThemes(css);
  assert.equal(themes.dark['--bg-strong'], '#1e272c', 'dark: the declaration wins, not the sentence');
  assert.equal(themes.light['--bg-strong'], '#e2e8e4', 'light: same');
  assert.equal(themes.light['--text3'], '#55625b');
  for (const [name, t] of Object.entries(themes)) {
    for (const tok of ['--bg-strong', '--text3']) {
      assert.ok(parseColor(t[tok]), `${name} ${tok} must still be a colour, got ${JSON.stringify(t[tok])}`);
    }
  }
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

test('EVERY theme the board ships reads at AA, not just the one in :root', () => {
  // This test used to read `:root` and stop. The board ships two themes, and the
  // light one — 39 token overrides, half the surface a user ever sees — went
  // unchecked for months. Measured the first time anybody looked:
  //
  //   --accent      1.51:1 against a 3:1 floor for UI boundaries. Half of it.
  //   --accent-text 4.17, --p1-fg 4.04, --p2-fg 4.09 against a 4.5 floor.
  //
  // `--accent` was the dark theme's green, which is designed to sit on #0a0e0c.
  // Nothing was wrong with the check's arithmetic; it was pointed at half the
  // subject, which looks exactly like a check that passed.
  const themes = readThemes(readFileSync('packages/board/public/index.html', 'utf8'));
  const names = Object.keys(themes);
  assert.ok(names.includes('dark') && names.includes('light'),
    `expected both themes, got ${names.join(', ')} — a new theme must be audited too`);

  const surfaces = ['--bg-page', '--bg-card', '--bg-muted', '--bg-strong', '--bg-elevated',
                    '--surface-drawer', '--bg-panel'];
  const text = [
    { name: '--text', floor: AA_TEXT }, { name: '--text2', floor: AA_TEXT },
    { name: '--text3', floor: AA_TEXT }, { name: '--accent-text', floor: AA_TEXT },
    { name: '--p0-fg', floor: AA_TEXT }, { name: '--p1-fg', floor: AA_TEXT },
    { name: '--p2-fg', floor: AA_TEXT }, { name: '--p3-fg', floor: AA_TEXT },
    // Status dots, the accent and the focus ring are UI boundaries, not prose.
    { name: '--accent', floor: AA_LARGE }, { name: '--focus-ring', floor: AA_LARGE },
    { name: '--status-backlog', floor: AA_LARGE }, { name: '--status-todo', floor: AA_LARGE },
    { name: '--status-progress', floor: AA_LARGE }, { name: '--status-blocked', floor: AA_LARGE },
    { name: '--status-gate', floor: AA_LARGE },
  ];

  for (const [theme, tokens] of Object.entries(themes)) {
    const { results, failures, unknown } = auditContrast({ tokens, surfaces, text });
    assert.deepEqual(unknown, [], `${theme}: every token the board declares must be measurable`);
    assert.equal(results.length, text.length, `${theme}: every text token was measured`);
    assert.deepEqual(
      failures.map((f) => `${f.token} ${f.ratio.toFixed(2)}:1 on ${f.on} (floor ${f.floor})`), [],
      `${theme} theme fails WCAG AA`);
  }
});

test('nothing bypasses the token system', () => {
  // Was 29 declarations writing a hex straight into a rule: nine `#fff`, three
  // `#0f1115`, and a scatter of toast, chip and status colours. The contrast
  // audit could not see any of them, because it reads `:root` and they were not
  // there — which is how `#04140d` reached the page unmeasured.
  //
  // Frozen at 29 by a ratchet first, then tokenised. Every value was carried
  // across unchanged, so this was a rename and not a redesign; the
  // rendered-layout check proved it by comparing the colours the page actually
  // paints before and after, and finding them identical.
  //
  // The floor is now zero. A ratchet that never reaches zero is a debt register;
  // one that does is a rule.
  const found = hardcodedColors(readFileSync('packages/board/public/index.html', 'utf8'));
  assert.deepEqual(found.map((f) => `${f.prop}: ${f.value}`), [],
    'use a token — a colour written into a rule is invisible to the contrast audit');
});
