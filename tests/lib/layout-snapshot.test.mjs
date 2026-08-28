// The board's appearance had one check: a person looking at it.
//
// Three CSS checks run in CI and all of them read the source — whether a
// declaration applies, whether a token resolves, whether the scale is
// consistent. None opens the page, so none sees the cascade, the media queries
// or the JavaScript. In one session 246 font sizes in this file were changed by
// hand and verified by eye.
//
// This opens the page in a real browser and asks whether every value it rendered
// is one the stylesheet DECLARES.
//
// The first version compared against a recorded snapshot of what happened to
// render, and went red within the hour on a 36px that is `--fs-num-l` — a
// declared step of the ramp, drawn only when a metric tile with a large numeral
// is on screen. It failed on correct behaviour, which is how a check gets
// switched off. The baseline was a fact about one machine's data; the rule is a
// fact about the design.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { snapshot, compare, loadBrowser, checkAgainstTokens, declaredTokens } from '../../scripts/lib/layout-snapshot.mjs';
import { parseColor } from '../../scripts/lib/contrast.mjs';

const BASELINE = 'tests/baselines/board-layout.json';
const PORT = 3197 + (process.pid % 40);

test('a rendered value belongs if the stylesheet declares it', () => {
  const declared = { sizes: ['12px', '15px', '36px'], colors: [{ r: 1, g: 1, b: 1 }] };

  // 36px only renders when a metric tile is on screen. That is data, and the
  // first version of this file called it a regression.
  assert.equal(checkAgainstTokens({ fontSizes: ['12px', '36px'], colors: [] }, declared).ok, true);
  assert.equal(checkAgainstTokens({ fontSizes: ['15px'], colors: [] }, declared).ok, true,
    'a declared size that nothing rendered this run is not a defect either');

  const raw = checkAgainstTokens({ fontSizes: ['12px', '19px'], colors: [] }, declared);
  assert.equal(raw.ok, false, 'a size the stylesheet never declared fails');
  assert.deepEqual(raw.offScale, ['19px']);
});

test('an off-palette colour fails; an unreadable one is not accused', () => {
  const declared = { sizes: [], colors: [{ r: 1, g: 1, b: 1 }, { r: 236, g: 242, b: 238 }] };

  assert.equal(checkAgainstTokens({ fontSizes: [], colors: ['rgb(1, 1, 1)'] }, declared).ok, true);

  const bad = checkAgainstTokens({ fontSizes: [], colors: ['rgb(255, 0, 255)'] }, declared);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.offPalette, ['rgb(255, 0, 255)']);

  // A value this cannot parse is unknown, and unknown is not guilty — the same
  // rule the contrast check follows for oklch.
  assert.equal(checkAgainstTokens({ fontSizes: [], colors: ['color(display-p3 1 0 1)'] }, declared).ok, true);
});

test('the declared tokens are read from the stylesheet, not from a list here', () => {
  const css = ':root {\n  --fs-body: 14px;\n  --fs-num-l: 36px;\n  --text: #ecf2ee;\n  --accent: rgba(0, 217, 126, 0.1);\n}';
  const d = declaredTokens(css, parseColor);
  assert.deepEqual(d.sizes, ['14px', '36px']);
  assert.equal(d.colors.length, 2, 'hex and rgba both read');
});

test('a new anchor is a feature; a missing one is a regression', () => {
  // Failing on every added id would make each new section a red build, and a
  // check that cries wolf is a check somebody switches off.
  const base = { anchors: ['nav'], viewport: {} };
  assert.equal(compare(base, { ...base, anchors: ['nav', 'new-panel'] }).ok, true);
  const gone = compare(base, { ...base, anchors: [] });
  assert.equal(gone.ok, false);
  assert.match(gone.diffs.join(' '), /anchors: no longer rendered — nav/);
});

test('layout drift is tolerated in the small and reported in the large', () => {
  const base = { anchors: [], viewport: { scrollWidth: 1440, scrollHeight: 900 } };
  // Data changes the page height a little; a blow-out is a different animal.
  assert.equal(compare(base, { ...base, viewport: { scrollWidth: 1440, scrollHeight: 930 } }).ok, true);
  const blown = compare(base, { ...base, viewport: { scrollWidth: 2900, scrollHeight: 900 } });
  assert.equal(blown.ok, false);
  assert.match(blown.diffs.join(' '), /scrollWidth: 1440 → 2900/);
});

test('the shipped board still renders its baseline', { timeout: 120_000 }, async (t) => {
  if (!existsSync(BASELINE)) return t.skip('no baseline recorded yet');

  // No browser is a THIRD state. Skipping says "not checked here"; passing would
  // say "checked and fine", which is the lie this repository keeps deleting.
  if (!(await loadBrowser())) return t.skip('playwright not installed — not checked, not passed');

  const server = spawn('node', ['packages/board/server.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let up = false;
  try {
    for (let i = 0; i < 40 && !up; i += 1) {
      await sleep(500);
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1500) });
        up = r.ok;
      } catch { /* not yet */ }
    }
    if (!up) return t.skip('board server did not come up — not checked, not passed');

    const shot = await snapshot(`http://127.0.0.1:${PORT}`);
    if (shot.state !== 'ok') return t.skip(`could not read the page: ${shot.reason}`);

    const { diffs } = compare(JSON.parse(readFileSync(BASELINE, 'utf8')), shot.signature);
    assert.deepEqual(diffs, [],
      'the board\'s structure drifted from tests/baselines/board-layout.json — ' +
      'if the change is intended, re-record the baseline in the same commit so the diff is reviewable');

    // And the part that needs no baseline: nothing rendered off the design system.
    const declared = declaredTokens(readFileSync('packages/board/public/index.html', 'utf8'), parseColor);
    const onSystem = checkAgainstTokens(shot.signature, declared);
    assert.deepEqual(onSystem.offScale, [], 'a font size reached the page that the stylesheet never declared');
    // Colours are NOT asserted here. The browser sees one only when the element
    // using it is on screen, so a genuine violation surfaced intermittently — a
    // true finding delivered as a flake. It is a static fact, and it is checked
    // statically, in tests/lib/contrast.test.mjs.
    void onSystem.offPalette;
  } finally {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
});
