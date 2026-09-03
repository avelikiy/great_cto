// The contrast check that reads PIXELS, not tokens.
//
// tests/lib/contrast.test.mjs audits every declared token pair in every theme,
// and it is a good check. It has a blind spot the shape of a button: an element
// whose background comes from a token and whose text colour comes from NOWHERE
// — inherited, or left to the browser. Six "Copy re-run" buttons on the inbox
// rendered white-on-white in the light theme, contrast 1.00:1, six empty
// rectangles where controls should be. The token audit passed, because no
// declared pair was wrong. The colour that was wrong was never declared.
//
// Cause, measured: `<meta name="color-scheme" content="dark">` is static, so
// switching `data-theme` to light swaps 39 tokens and leaves every form control
// on the dark scheme's UA defaults — `buttontext` is white. Not one button; the
// class of every control that never set its own `color`.
//
// So this opens the shipped page in a real browser, every panel, both themes,
// and for every element that carries text asks the only question that matters:
// can it be read against what is actually behind it. Effective background is
// found by walking up to the first painted ancestor and compositing; the WCAG
// arithmetic is the house library's, so the two checks cannot disagree on maths.
//
// Three states, as the layout snapshot has them. No browser / no server is
// SKIPPED, and says so — "not checked" must never print as "checked and fine".
// An element whose background is a gradient or image is UNMEASURABLE and is
// counted, not passed. Only measured pairs pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadBrowser } from '../../scripts/lib/layout-snapshot.mjs';
import { parseColor, composite, ratio, AA_TEXT, AA_LARGE } from '../../scripts/lib/contrast.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';

// The port comes from the kernel, not from the pid. `3239 + (pid % 40)` gave
// forty possible values, so a second run on the same machine could take the
// number and the loser waited out its full deadline before skipping — a check
// that silently stopped checking. See tests/helpers/board-start.mjs.
const THEMES = ['dark', 'light'];
// Every panel the page ships. Read from the DOM at test time as well, and the
// two lists must agree — a panel added to the page and not here would go unread.
const PANELS = ['inbox', 'kanban', 'dashboard', 'agents', 'budgets', 'docs', 'logs',
  'memory', 'notifications', 'sessions', 'share'];

/**
 * Runs in the page. For every element that owns visible text, report its
 * colour, its font, and the stack of painted backgrounds above it (outermost
 * first) so the node side can composite. Says `unmeasurable` when something in
 * that stack is not a flat colour.
 */
const COLLECT_TEXT = () => {
  const out = [];
  const isFlat = (cs) => cs.backgroundImage === 'none';
  const alphaOf = (c) => { const m = /rgba?\([^)]*?(?:,|\/)\s*([\d.]+)\s*\)$/.exec(c); return m ? +m[1] : (c === 'transparent' ? 0 : 1); };
  const pathOf = (el) => {
    const bits = [];
    for (let n = el; n && n !== document.body && bits.length < 4; n = n.parentElement) {
      bits.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') + (n.classList[0] ? `.${n.classList[0]}` : ''));
    }
    return bits.join(' > ');
  };
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TEMPLATE', 'SVG', 'PATH'].includes(el.tagName)) continue;
    // Only elements that OWN text — a wrapper's colour is not what anyone reads.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none' || +cs.opacity === 0) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.matches(':disabled') || el.closest(':disabled')) continue; // WCAG exempts inactive controls
    // Something above it hidden by opacity makes the reading meaningless.
    let hiddenAbove = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.display === 'none' || acs.visibility === 'hidden' || +acs.opacity === 0) { hiddenAbove = true; break; }
    }
    if (hiddenAbove) continue;
    // Background stack: self, then up, until one is opaque. Outermost first.
    const stack = [];
    let unmeasurable = false;
    for (let n = el; n; n = n.parentElement) {
      const ncs = getComputedStyle(n);
      if (!isFlat(ncs)) { unmeasurable = true; break; }
      const bg = ncs.backgroundColor;
      const a = alphaOf(bg);
      if (a > 0) stack.unshift(bg);
      if (a >= 1) break;
      if (n === document.documentElement) break;
    }
    out.push({
      path: pathOf(el),
      text: el.textContent.trim().slice(0, 40),
      color: cs.color,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      stack,
      unmeasurable,
    });
  }
  return out;
};

/**
 * Weights the vendored font does not have.
 *
 * great_cto-bcmi: hierarchy by SIZE, not weight — because Geist Mono is
 * vendored with a 400-500 weight axis (fonts.css, and the CDN file it came
 * from). Ask a mono element for 600 and the browser does not pick a heavier
 * cut, it STROKES the glyph. Measured on this page, ink pixels at 32px:
 *
 *   Geist Mono   400 → 1473   500 → 1598   600 → 1926   700 → 1926
 *   Geist (sans) 400 → 1357   500 → 1538   600 → 1689   700 → 1846
 *
 * 600 and 700 identical is the tell: a real axis moves, a synthetic stroke
 * saturates. So this is not a style preference — it is a declaration the font
 * cannot honour, and the page renders a fake.
 *
 * Read from fonts.css rather than hard-coded, so revendoring a wider axis
 * relaxes the check by itself instead of leaving a stale number here.
 */
const COLLECT_FAUX_BOLD = () => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (!/mono/i.test(cs.fontFamily)) continue;
    const w = parseInt(cs.fontWeight, 10) || 400;
    if (w <= 500) continue;
    const key = `${el.className}|${w}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cls: String(el.className || el.tagName).slice(0, 40), weight: w, size: cs.fontSize, text: el.textContent.trim().slice(0, 24) });
  }
  return out;
};

/**
 * Known and named, not excused.
 *
 * The first run of this file after the white-on-white fix reported 562 more
 * elements below AA, and 550 of them were one thing: the brand accent
 * `#009657` on the light theme's tinted chip, 3.17:1, on every project chip
 * in the notifications drawer, on every panel. That is great_cto-o6j8 —
 * "decide the accent on light ground; this is where identity is made" — and a
 * test may not make that decision by picking a darker green in a fixture.
 *
 * So it is frozen, the way the frontmatter budget freezes its over-cap legacy:
 * each entry is a (theme, text colour, painted surface) triple with the task
 * that owns it. A failure not on this list fails the run.
 *
 * An entry that no longer occurs does NOT fail the run — see the note at the
 * comparison below. This file reads data, not files: the accent chips exist
 * only when the machine has notifications, so "must still occur" would fail on
 * every clean CI box. The diagnostic names the unseen entries instead, and the
 * shrinking is done by hand. (This paragraph used to claim the opposite, which
 * was never implemented — a comment describing a guard that does not exist is
 * the same defect this file was written to catch, one level up.)
 */
// Empty, and it stays that way by shrinking only. All three entries this list
// was created with are gone — great_cto-o6j8 closed them by splitting the
// colours that were doing two jobs:
//
//   --accent / --accent-text          bed and ink were one token; 23 rules asked
//                                     the bed to be readable text
//   --status-review / …-text          same split, same reason: a badge bed and
//                                     an approve button's ink
//   --on-solid / --on-accent /        one name for three beds — the near-black
//   --on-status                       button, the green accent, the status
//                                     colours. #fff is right for exactly one
//
// An entry here is a debt with an owner, not a permission. Adding one needs a
// task id; removing one needs the ratio to have moved.
const KNOWN_BELOW_AA = [];
const knownKey = (f) => `${f.theme}|${f.color}|${f.stack?.[f.stack.length - 1] ?? f.on}`;
const KNOWN = new Map(KNOWN_BELOW_AA.map((k) => [`${k.theme}|${k.color}|${k.on}`, k]));

function effectiveBackground(stack) {
  // Composite outermost → innermost over the page's own base. If the outermost
  // is not opaque the page never painted a base under it, so it is composited
  // over black the way the browser would — and that reads as a defect if the
  // result is unreadable, which is right.
  let bg = { r: 0, g: 0, b: 0, a: 1 };
  for (const raw of stack) {
    const c = parseColor(raw);
    if (!c) return null;
    bg = composite(c, bg);
  }
  return bg;
}

function floorFor({ fontSize, fontWeight }) {
  // WCAG "large" text: ≥ 24px, or ≥ 18.66px (14pt) when bold.
  if (fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)) return AA_LARGE;
  return AA_TEXT;
}

export function auditRendered(items) {
  const failures = [];
  let measured = 0;
  let unmeasurable = 0;
  for (const it of items) {
    if (it.unmeasurable) { unmeasurable += 1; continue; }
    const fg = parseColor(it.color);
    const bg = effectiveBackground(it.stack);
    if (!fg || !bg) { unmeasurable += 1; continue; }
    measured += 1;
    const r = ratio(composite(fg, bg), bg);
    const floor = floorFor(it);
    if (r < floor) failures.push({ ...it, ratio: +r.toFixed(2), floor });
  }
  failures.sort((a, b) => a.ratio - b.ratio);
  return { measured, unmeasurable, failures };
}

test('the arithmetic agrees with the token audit on a known pair', () => {
  // #767676 on white is the canonical exactly-AA example; a white-on-white
  // control is the defect this file exists for.
  const ok = auditRendered([{ color: 'rgb(118, 118, 118)', stack: ['rgb(255, 255, 255)'], fontSize: 14, fontWeight: 400, path: 'p', text: 'x' }]);
  assert.equal(ok.failures.length, 0);
  const bad = auditRendered([{ color: 'rgb(255, 255, 255)', stack: ['rgb(255, 255, 255)'], fontSize: 12, fontWeight: 500, path: 'button.gate-btn', text: 'Copy re-run' }]);
  assert.equal(bad.failures.length, 1);
  assert.equal(bad.failures[0].ratio, 1);
  // A gradient behind the text is not a pass. It is a reading nobody took.
  const grad = auditRendered([{ color: 'rgb(0,0,0)', stack: [], unmeasurable: true, fontSize: 14, fontWeight: 400, path: 'p', text: 'x' }]);
  assert.equal(grad.measured, 0);
  assert.equal(grad.unmeasurable, 1);
});

test('every panel, both themes: text can be read against what is behind it', { timeout: 180_000 }, async (t) => {
  const chromium = await loadBrowser();
  if (!chromium) return t.skip('playwright not installed — not checked, not passed');

  let started;
  try {
    started = await startServerOnFreePort({ entry: 'packages/board/server.mjs' });
  } catch (e) {
    // Still a skip — but the reason travels with it, so a port collision no
    // longer reads the same as a server that crashed on boot.
    return t.skip(`board server did not come up — not checked, not passed: ${e.message}`);
  }
  const { port: PORT, proc: server } = started;
  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (e) {
      return t.skip(`no usable browser: ${String(e.message).split('\n')[0]} — not checked, not passed`);
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);

    // The page's own panel list must be the one this file walks.
    const shipped = await page.evaluate(() => [...document.querySelectorAll('[id^="panel-"]')].map((e) => e.id.slice(6)).sort());
    assert.deepEqual(shipped, [...PANELS].sort(), 'a panel the page ships is not in PANELS — it would go unread');

    const report = [];
    const fauxBold = [];
    for (const theme of THEMES) {
      await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
      let measuredInTheme = 0;
      for (const panel of PANELS) {
        await page.evaluate((n) => {
          document.querySelectorAll('.panel').forEach((el) => el.classList.remove('active'));
          document.getElementById(`panel-${n}`)?.classList.add('active');
        }, panel);
        await page.waitForTimeout(350);
        const items = await page.evaluate(COLLECT_TEXT);
        const { measured, unmeasurable, failures } = auditRendered(items);
        measuredInTheme += measured;
        for (const f of failures) report.push({ theme, panel, ...f });
        if (unmeasurable) t.diagnostic(`${theme}/${panel}: ${unmeasurable} element(s) over a gradient or image — not measured, not passed`);
        for (const f of await page.evaluate(COLLECT_FAUX_BOLD)) fauxBold.push({ theme, panel, ...f });
      }
      // A theme in which nothing was measured is not a theme that passed.
      assert.ok(measuredInTheme > 50, `${theme}: only ${measuredInTheme} text elements measured — the page did not render, or the walker is broken`);
    }

    // The assertion prints the worst dozen; the whole list goes to a file when
    // asked, so a long tail can be read without re-running a browser.
    if (process.env.RENDERED_CONTRAST_REPORT) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.RENDERED_CONTRAST_REPORT, JSON.stringify(report, null, 1));
    }
    // The mono axis stops at 500 (fonts.css). Anything above it on a mono
    // element is a synthetic stroke, not a heavier cut — so this is a
    // declaration the page cannot honour, and the fix is size, not weight.
    const MONO_MAX = (() => {
      const css = readFileSync(new URL('../../packages/board/public/assets/fonts/fonts.css', import.meta.url), 'utf8');
      const m = css.match(/font-family:\s*'Geist Mono'[\s\S]*?font-weight:\s*(\d+)\s+(\d+)/);
      return m ? Number(m[2]) : 500;
    })();
    const over = fauxBold.filter((f) => f.weight > MONO_MAX);
    assert.equal(over.length, 0,
      `${over.length} mono element(s) asking for a weight the vendored font does not have (axis ends at ${MONO_MAX}); the browser renders a synthetic bold:\n`
      + over.slice(0, 8).map((f) => `  ${f.theme}/${f.panel}  .${f.cls}  weight ${f.weight} @ ${f.size}  "${f.text}"`).join('\n'));

    // Split what was found into the named legacy and everything else. Only
    // "everything else" is a failure; the legacy is a count that may only fall.
    const seenKnown = new Set();
    const unknown = [];
    for (const f of report) {
      const k = knownKey(f);
      if (KNOWN.has(k)) seenKnown.add(k); else unknown.push(f);
    }
    // Allowed, not required. The frontmatter budget can insist its legacy list
    // shrinks because agent files are in the repository; what this file reads
    // is DATA — the accent chips exist only when the machine has notifications,
    // and two of three entries vanished between two runs of identical CSS on
    // this machine as the drawer loaded late. A "must still occur" rule would
    // fail on every clean CI box. So: an entry here permits, and the shrinking
    // is done by hand when great_cto-o6j8 lands and the diagnostic reads zero.
    const legacy = report.length - unknown.length;
    const unseen = [...KNOWN.keys()].filter((k) => !seenKnown.has(k));
    if (legacy) t.diagnostic(`${legacy} element(s) below AA are known and owned (KNOWN_BELOW_AA) — counted, not passed`);
    // Name them. "1 entry did not occur" tells you a ratchet may be ready to
    // tighten and then makes you find out which by hand — so the tightening
    // does not happen. The owner string is the whole point of the entry.
    if (unseen.length) {
      t.diagnostic(`${unseen.length} KNOWN_BELOW_AA entr${unseen.length > 1 ? 'ies' : 'y'} did not occur in this run (data-dependent; not evidence they are fixed):`);
      for (const k of unseen) t.diagnostic(`  ${KNOWN.get(k).owner}  [${KNOWN.get(k).color} on ${KNOWN.get(k).on}]`);
    }

    const worst = unknown.slice(0, 12).map((f) =>
      `  ${f.theme}/${f.panel}  ${f.ratio}:1 (floor ${f.floor})  ${f.path}  "${f.text.slice(0, 20)}"  ${f.color} on [${f.stack.join(' → ')}]`);
    assert.equal(unknown.length, 0,
      `${unknown.length} rendered text element(s) below AA that no task owns — the token audit cannot see these, this can:\n${worst.join('\n')}`);
  } finally {
    try { await browser?.close(); } catch { /* already gone */ }
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
    try { server.kill('SIGKILL'); } catch { /* already gone */ }
  }
});
