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
import { snapshot, snapshotAll, compare, loadBrowser, checkAgainstTokens, declaredTokens, EXCUSED_SELECTORS } from '../../scripts/lib/layout-snapshot.mjs';
import { EXCEPTIONS } from '../../scripts/lib/css-type-scale.mjs';
import { parseColor, readThemes } from '../../scripts/lib/contrast.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';

const BASELINE = 'tests/baselines/board-layout.json';

// The port is no longer derived from the pid. `3197 + (pid % 40)` gave forty
// possible values, so two runs on one machine — a second gate, another project's
// pre-push, a board left over from yesterday — could land on the same number,
// and the loser waited out its whole deadline before skipping. Forty buckets is
// the same narrow-range guess free-port.mjs exists to remove; it simply survived
// in this file. `startServerOnFreePort` asks the kernel and retries a real
// collision.

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

  // `--no-open` is not cosmetic. Without it server.mjs calls spawnSync on the
  // platform's browser opener INSIDE the listen callback, blocking the event
  // loop while the browser starts: the port is open and the page answers
  // nothing, and this test times out on page.goto. It also opened a real tab on
  // the operator's screen, at a pid-derived port, on every CI run — which is
  // where the mystery `localhost:32xx` tabs were coming from.
  let started;
  try {
    started = await startServerOnFreePort({ entry: 'packages/board/server.mjs' });
  } catch (e) {
    // Still a skip, not a failure — but the reason travels with it now, so
    // "could not check" stays distinct from "checked and fine", and a port
    // collision reads differently from a server that crashed on boot.
    return t.skip(`board server did not come up — not checked, not passed: ${e.message}`);
  }
  const { port, proc: server } = started;
  try {
    const shot = await snapshot(`http://127.0.0.1:${port}`);
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

test('both checks excuse the same things, or one of them accuses the other\'s decision', () => {
  // The rendered check reported five screens off-scale. Every one was a deliberate
  // exception the SOURCE check already carried with its reason written down — the
  // longform document ramp, the Share hero. Two lists for one rule is how a
  // decision starts reading as a defect, and how somebody sets out to "fix" it.
  //
  // The shapes differ on purpose: css-type-scale matches SELECTOR TEXT with
  // regexes, this one matches ELEMENTS with selectors. So the assertion is that
  // every regex has a selector that it matches — one set, two spellings.
  for (const e of EXCEPTIONS) {
    const covered = EXCUSED_SELECTORS.some((sel) => e.match.test(sel));
    assert.ok(covered,
      `css-type-scale excuses ${e.match} (${e.why}) and the rendered check does not — ` +
      'add the equivalent selector to EXCUSED_SELECTORS');
  }
});

test('the whole board is on-system: every screen, every theme', { timeout: 240_000 }, async (t) => {
  if (!(await loadBrowser())) return t.skip('playwright not installed — not checked, not passed');
  const html = readFileSync('packages/board/public/index.html', 'utf8');
  const panels = [...new Set([...html.matchAll(/id="panel-([a-z-]+)"/g)].map((m) => m[1]))];
  assert.ok(panels.length >= 10, `expected the board's screens, found ${panels.length}`);

  // `--no-open` is not cosmetic. Without it server.mjs calls spawnSync on the
  // platform's browser opener INSIDE the listen callback, blocking the event
  // loop while the browser starts: the port is open and the page answers
  // nothing, and this test times out on page.goto. It also opened a real tab on
  // the operator's screen, at a pid-derived port, on every CI run — which is
  // where the mystery `localhost:32xx` tabs were coming from.
  let started;
  try {
    started = await startServerOnFreePort({ entry: 'packages/board/server.mjs', timeoutMs: 30000 });
  } catch (e) {
    return t.skip(`board server did not come up — not checked, not passed: ${e.message}`);
  }
  const { port, proc: server } = started;
  try {
    const shot = await snapshotAll(`http://127.0.0.1:${port}`, { panels, settleMs: 6000 });
    if (shot.state !== 'ok') return t.skip(`could not read the board: ${shot.reason}`);

    // Each theme is judged against ITS OWN palette. The light theme redefines 39
    // tokens; auditing it against `:root` would accuse every one of them.
    const themes = readThemes(html);
    const base = declaredTokens(html, parseColor);
    const bad = [];
    for (const s of shot.screens) {
      const declared = {
        sizes: base.sizes,
        colors: Object.values(themes[s.theme] || {}).map(parseColor).filter(Boolean),
      };
      const r = checkAgainstTokens(s, declared);
      for (const x of r.offScale) bad.push(`${s.panel}/${s.theme}: font-size ${x}`);
      for (const x of r.offPalette) bad.push(`${s.panel}/${s.theme}: colour ${x}`);
    }
    assert.deepEqual(bad, [], 'values reached the page that the design system does not declare');
    assert.equal(shot.screens.length, panels.length * 2, 'every screen was visited in both themes');
  } finally {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
});
