/**
 * layout-snapshot — visual regression for the board, without committing pixels.
 *
 * WHAT THIS CATCHES
 * -----------------
 * A CSS edit that renders wrong. The board is a 7,600-line single-page app whose
 * appearance has only ever been checked by a person looking at it — and in one
 * session 246 font sizes were changed by hand. Three CSS checks already run, and
 * all of them read the SOURCE: whether a declaration applies, whether a token
 * resolves, whether the scale is consistent. None opens the page.
 *
 * WHY NOT PIXEL DIFFS
 * -------------------
 * Committed PNG baselines would be flaky by construction: font rasterisation
 * differs between macOS and Linux, so the same correct page produces different
 * pixels on the two platforms this runs on. They also put megabytes of binary
 * churn into a public repository, and a failure reports "pixels differ" rather
 * than what differed.
 *
 * So the baseline is a JSON signature of the RENDERED result — read out of the
 * live page by a real browser, so it reflects the cascade, the media queries and
 * the JavaScript, none of which the source-level checks can see. A diff names
 * the font size that appeared or the anchor that vanished, and it reviews like
 * code.
 *
 * WHAT IS IN THE SIGNATURE, AND WHAT IS DELIBERATELY NOT
 * -----------------------------------------------------
 * Sets, not counts. The board renders whatever data the machine happens to hold,
 * so "279 elements at 15px" is a fact about this laptop's task list, not about
 * the design — a baseline built on it would fail for the wrong reason and teach
 * people to regenerate it without reading. What does not move with the data:
 *
 *   fontSizes   the type ramp as rendered — a raw size sneaking back in shows up
 *   colors      the palette as rendered — a value drifting off-token shows up
 *   anchors     the id'd structural elements, present or missing
 *   viewport    the document's own scroll size, which reveals a layout blow-out
 *
 * A run with no browser reports `unavailable`, never a pass. Same rule as
 * product-browser.mjs, and the same reason: a check that could not run must not
 * look like a check that passed.
 */

/** Lazily loaded, so the absence of the devDependency is a state and not a crash. */
export async function loadBrowser() {
  try {
    const { chromium } = await import('playwright');
    return chromium;
  } catch { return null; }
}

/** Read the signature out of an open page. */
/**
 * Selectors the type-scale check already excuses, so this one excuses them too.
 *
 * Kept as literal selectors rather than as the regexes `css-type-scale` matches
 * against, because that check reads SOURCE and this one reads ELEMENTS. Same
 * decisions, two shapes — and a test asserts the two lists describe the same set,
 * so adding an exception in one place cannot silently leave the other behind.
 */
export const EXCUSED_SELECTORS = [
  '.ac-mark', '.emoji', '.star', '.ap-x',
  '.memory-doc h1', '.memory-doc h2',
  '.side-desc.md h1',
  '.share-card h2',
];

export const COLLECT = (excused) => {
  const fontSizes = new Set();
  const colors = new Set();
  const skip = (el) => (excused || []).some((sel) => { try { return el.matches(sel); } catch { return false; } });
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;      // invisible elements have no design
    if (skip(el)) continue;                          // decided on purpose, recorded elsewhere
    const cs = getComputedStyle(el);
    fontSizes.add(cs.fontSize);
    if (el.textContent && el.textContent.trim()) colors.add(cs.color);
  }
  return {
    fontSizes: [...fontSizes].sort((a, b) => parseFloat(a) - parseFloat(b)),
    colors: [...colors].sort(),
    anchors: [...document.querySelectorAll('[id]')].map((e) => e.id).filter(Boolean).sort(),
    viewport: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientWidth: document.documentElement.clientWidth,
    },
  };
};

/**
 * @returns {{state:'ok'|'unavailable', signature?:object, reason?:string}}
 */
/**
 * Every screen, in every theme.
 *
 * `snapshot` opens one URL and reads what is on it — which meant ONE of eleven
 * panels, in whatever theme the browser happened to default to. It reported the
 * board on-system while ten screens and an entire second theme had never been
 * looked at. The contrast audit had the same blind spot in the same week, and
 * both looked like checks that passed.
 *
 * @returns {{state:'ok'|'unavailable', screens?:object[], reason?:string}}
 */
export async function snapshotAll(url, { panels, themes = ['dark', 'light'],
                                         width = 1440, height = 900, settleMs = 2500 } = {}) {
  const chromium = await loadBrowser();
  if (!chromium) return { state: 'unavailable', reason: 'playwright is not installed' };
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { return { state: 'unavailable', reason: `no usable browser: ${String(e.message).split('\n')[0]}` }; }

  const screens = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(settleMs);
    for (const theme of themes) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      for (const panel of panels) {
        // Switching by hash rather than by clicking: a nav item that has moved
        // would silently measure the wrong panel, and this must not depend on chrome.
        await page.evaluate((n) => {
          document.querySelectorAll('.panel').forEach((el) => el.classList.remove('active'));
          document.getElementById(`panel-${n}`)?.classList.add('active');
        }, panel);
        await page.waitForTimeout(350);
        screens.push({ panel, theme, ...(await page.evaluate(COLLECT, EXCUSED_SELECTORS)) });
      }
    }
    return { state: 'ok', screens };
  } catch (e) {
    return { state: 'unavailable', reason: String(e.message).split('\n')[0] };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function snapshot(url, { width = 1440, height = 900, settleMs = 2500 } = {}) {
  const chromium = await loadBrowser();
  if (!chromium) return { state: 'unavailable', reason: 'playwright is not installed' };

  let browser;
  try {
    // The system Chrome, so nothing has to download a browser. If it is absent
    // that is `unavailable` too — a machine without a browser cannot answer the
    // question, and pretending otherwise is the failure this file guards.
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    return { state: 'unavailable', reason: `no usable browser: ${String(e.message).split('\n')[0]}` };
  }

  try {
    const page = await browser.newPage({ viewport: { width, height } });
    // NOT networkidle: the board polls, so it is never idle and the wait times
    // out after 30s of a green-looking hang. Load, then let it settle.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(settleMs);
    const signature = await page.evaluate(COLLECT, EXCUSED_SELECTORS);
    return { state: 'ok', signature };
  } catch (e) {
    return { state: 'unavailable', reason: String(e.message).split('\n')[0] };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Which rendered values are not on the design system's own lists.
 *
 * THIS REPLACED A SNAPSHOT, AND THE REASON IS THE POINT.
 *
 * The first version recorded the sizes and colours that HAPPENED to render and
 * failed when the next run differed. It went red within the hour on
 * `fontSizes: newly rendered — 36px` — and 36px is `--fs-num-l`, a declared step
 * of the twelve-step ramp. It renders only when a metric tile with a large
 * numeral is on screen, which depends on the machine's data.
 *
 * So the test failed on correct behaviour: a false accusation, which is the
 * thing that teaches people to switch a check off. The mistake underneath was
 * making the baseline a fact about one machine's data rather than about the
 * design.
 *
 * A rendered value belongs if the stylesheet DECLARES it. That is
 * data-independent, needs no baseline, and still catches the defect this exists
 * for — a raw size or an off-palette colour reaching the page, which is exactly
 * what 246 hand-edited font sizes could have left behind.
 *
 * @param {object} signature   from snapshot()
 * @param {{sizes:string[], colors:Array<{r,g,b}>}} declared
 * @returns {{ok:boolean, offScale:string[], offPalette:string[]}}
 */
export function checkAgainstTokens(signature, declared) {
  const sizes = new Set(declared.sizes || []);
  const offScale = (signature.fontSizes || []).filter((s) => !sizes.has(s));

  const key = (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
  const palette = new Set((declared.colors || []).map(key));
  const offPalette = (signature.colors || []).filter((raw) => {
    const m = String(raw).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m) return false;                       // unparseable is unknown, not guilty
    return !palette.has(key({ r: +m[1], g: +m[2], b: +m[3] }));
  });

  return { ok: offScale.length === 0 && offPalette.length === 0, offScale, offPalette };
}

/**
 * Compare the STRUCTURAL half of a signature against a baseline.
 *
 * Only what does not move with the data lives here. Anchors are checked for
 * what DISAPPEARED — a structural element stopped rendering — and never for what
 * appeared, because a new id is a section being built and failing on it would
 * make every addition a red build.
 *
 * @returns {{ok:boolean, diffs:string[]}}
 */
export function compare(baseline, current, { scrollTolerance = 0.05 } = {}) {
  const diffs = [];
  const gone = (baseline.anchors || []).filter((a) => !(current.anchors || []).includes(a));
  if (gone.length) diffs.push(`anchors: no longer rendered — ${gone.join(', ')}`);

  const b = baseline.viewport || {};
  const c = current.viewport || {};
  for (const k of ['scrollWidth', 'scrollHeight']) {
    if (b[k] == null || c[k] == null) continue;
    const drift = Math.abs(c[k] - b[k]) / Math.max(b[k], 1);
    if (drift > scrollTolerance) diffs.push(`${k}: ${b[k]} → ${c[k]} (${Math.round(drift * 100)}% drift)`);
  }
  return { ok: diffs.length === 0, diffs };
}

/** The type ramp and colour palette a stylesheet DECLARES, for checkAgainstTokens. */
export function declaredTokens(css, parseColor) {
  const sizes = [...new Set([...String(css).matchAll(/--fs-[a-z0-9-]+:\s*([0-9.]+px)/gi)].map((m) => m[1]))];
  const colors = [];
  for (const [, value] of String(css).matchAll(/--[a-z0-9-]+:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)) {
    const c = parseColor(value);
    if (c) colors.push(c);
  }
  return { sizes, colors };
}
