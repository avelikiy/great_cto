// Accessibility of every board destination: axe-core (WCAG 2.0–2.2 A/AA rules),
// at desktop and phone width, in the light and the dark theme.
//
// axe-core is already a devDependency (scripts/lib/product-browser.mjs injects it
// the same way): no network, no new package. Only `serious` and `critical`
// violations gate; `moderate`/`minor` are printed, not counted.
//
// Fixing a violation usually changes how the board looks (contrast, sizes,
// labels), which is a design change and needs the owner's approval first. So
// the violations that exist today are a named baseline (a11y-baseline.json):
// a NEW serious/critical violation fails the build, a baselined one that is gone
// must be struck from the file, and the list only shrinks.
//
// Refresh after deliberately accepting the current state:
//   A11Y_BASELINE_WRITE=1 node --test tests/e2e/a11y.e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBoard } from '../helpers/board-page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AXE = path.resolve(HERE, '../../node_modules/axe-core/axe.min.js');
const BASELINE = path.join(HERE, 'a11y-baseline.json');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const GATING = new Set(['serious', 'critical']);

test('no new serious or critical accessibility violation on any destination, width or theme', { timeout: 400000 }, async (t) => {
  if (!fs.existsSync(AXE)) return t.skip('axe-core is not installed — not checked, not passed');
  const b = await openBoard({ prefix: 'gcto-a11y-' });
  if (b.skip) return t.skip(b.skip);
  const { page, destinations, go } = b;
  try {
    await page.addScriptTag({ path: AXE });
    // rule id + selector, the same for every run of the same violation
    const found = new Map();
    let minor = 0;
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const dest of destinations) {
          await go(dest);
          const { violations } = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
          for (const v of violations) {
            if (!GATING.has(v.impact)) { minor += v.nodes.length; continue; }
            for (const n of v.nodes) {
              const key = `${v.id} ${n.target.join(' ')}`;
              if (!found.has(key)) found.set(key, { impact: v.impact, help: v.help, where: `${dest}/${theme}/${width}` });
            }
          }
        }
      }
    }
    const keys = [...found.keys()].sort();
    console.log(`a11y: ${keys.length} serious/critical violation(s) across ${destinations.length} destinations × 2 widths × 2 themes; ${minor} moderate/minor node(s) not gated`);

    if (process.env.A11Y_BASELINE_WRITE === '1') {
      fs.writeFileSync(BASELINE, JSON.stringify({
        note: 'Serious/critical axe violations accepted on the date below, pending a fix (bd label a11y); a fix that changes how the board looks needs the owner.s design approval first. Shrink only. See docs/testing/BOARD-TEST-STRATEGY.md §3.3.',
        measured: new Date().toISOString().slice(0, 10),
        violations: Object.fromEntries(keys.map((k) => [k, `${found.get(k).impact}: ${found.get(k).help} (first seen ${found.get(k).where})`])),
      }, null, 2) + '\n');
    }
    const baseline = fs.existsSync(BASELINE) ? Object.keys(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).violations) : [];
    const fresh = keys.filter((k) => !baseline.includes(k)).map((k) => `${k} — ${found.get(k).impact}: ${found.get(k).help} (${found.get(k).where})`);
    assert.deepEqual(fresh, [], `new accessibility violations:\n  ${fresh.join('\n  ')}`);
    const gone = baseline.filter((k) => !found.has(k));
    assert.deepEqual(gone, [], `fixed — strike from ${path.basename(BASELINE)}:\n  ${gone.join('\n  ')}`);
  } finally {
    await b.close();
  }
});
