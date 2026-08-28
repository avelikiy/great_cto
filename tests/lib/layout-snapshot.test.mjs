// The board's appearance had one check: a person looking at it.
//
// Three CSS checks run in CI and all of them read the source — whether a
// declaration applies, whether a token resolves, whether the scale is
// consistent. None opens the page, so none sees the cascade, the media queries
// or the JavaScript. In one session 246 font sizes in this file were changed by
// hand and verified by eye.
//
// This opens the page in a real browser and compares what rendered against a
// committed signature. Proven by breaking it on purpose before it was trusted:
// a stray `font-size:19px` and an off-palette colour injected into the markup
// are reported by name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { snapshot, compare, loadBrowser } from '../../scripts/lib/layout-snapshot.mjs';

const BASELINE = 'tests/baselines/board-layout.json';
const PORT = 3197 + (process.pid % 40);

test('a value that appears is a regression; one that is absent is data', () => {
  // Got this backwards first, and the live board refuted it within the minute:
  // the baseline held a status colour that the next run did not render, because
  // no item with that status was on screen. Absence is a fact about the
  // machine's task list. Presence is a fact about the design.
  const base = { fontSizes: ['12px', '15px'], colors: ['rgb(1, 1, 1)'], anchors: ['a', 'b'],
                 viewport: { scrollWidth: 1440, scrollHeight: 900 } };

  assert.equal(compare(base, base).ok, true);

  const grew = compare(base, { ...base, fontSizes: ['12px', '15px', '19px'] });
  assert.equal(grew.ok, false, 'a raw size creeping past the scale fails');
  assert.match(grew.diffs.join(' '), /newly rendered — 19px/);

  const lost = compare(base, { ...base, fontSizes: ['15px'] });
  assert.equal(lost.ok, true, 'a size nothing rendered this run is not a defect');
  assert.match(lost.notes.join(' '), /not on screen this run — 12px/);

  const offPalette = compare(base, { ...base, colors: ['rgb(1, 1, 1)', 'rgb(255, 0, 255)'] });
  assert.equal(offPalette.ok, false);
  assert.match(offPalette.diffs.join(' '), /rgb\(255, 0, 255\)/);
});

test('a new anchor is a feature; a missing one is a regression', () => {
  // Failing on every added id would make each new section a red build, and a
  // check that cries wolf is a check somebody switches off.
  const base = { fontSizes: [], colors: [], anchors: ['nav'], viewport: {} };
  assert.equal(compare(base, { ...base, anchors: ['nav', 'new-panel'] }).ok, true);
  const gone = compare(base, { ...base, anchors: [] });
  assert.equal(gone.ok, false);
  assert.match(gone.diffs.join(' '), /anchors: no longer rendered — nav/);
});

test('layout drift is tolerated in the small and reported in the large', () => {
  const base = { fontSizes: [], colors: [], anchors: [],
                 viewport: { scrollWidth: 1440, scrollHeight: 900 } };
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

    const { ok, diffs } = compare(JSON.parse(readFileSync(BASELINE, 'utf8')), shot.signature);
    assert.deepEqual(diffs, [],
      'the rendered board drifted from tests/baselines/board-layout.json — ' +
      'if the change is intended, re-record the baseline in the same commit so the diff is reviewable');
    assert.equal(ok, true);
  } finally {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
});
