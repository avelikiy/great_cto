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
export const COLLECT = () => {
  const fontSizes = new Set();
  const colors = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;      // invisible elements have no design
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
    const signature = await page.evaluate(COLLECT);
    return { state: 'ok', signature };
  } catch (e) {
    return { state: 'unavailable', reason: String(e.message).split('\n')[0] };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Compare a signature against a baseline.
 *
 * EACH FIELD IS CHECKED IN ONE DIRECTION, AND THE DIRECTION IS THE POINT.
 *
 * This was got wrong on the first attempt and the test caught it: the baseline
 * held `rgb(124, 58, 237)`, a status colour, and the next run did not — not
 * because anything regressed, but because no item with that status happened to
 * be on screen. Colours and type sizes appear only when something that uses them
 * renders, so their ABSENCE is a fact about the machine's data and their
 * PRESENCE is a fact about the design.
 *
 *   fontSizes   a NEW size fails — raw sizes creeping back past the scale
 *   colors      a NEW colour fails — a value rendered off the palette
 *   anchors     a MISSING id fails — a structural element stopped rendering;
 *               a new one is a feature being built, and failing on it would
 *               make every addition a red build
 *   viewport    drift beyond tolerance fails, either way — a blow-out
 *
 * What is only informational still comes back, under `notes`, so a reviewer can
 * see it without the build going red over the shape of somebody's task list.
 *
 * @returns {{ok:boolean, diffs:string[], notes:string[]}}
 */
export function compare(baseline, current, { scrollTolerance = 0.05 } = {}) {
  const diffs = [];
  const notes = [];
  const added = (was, now) => now.filter((x) => !was.includes(x));
  const gone = (was, now) => was.filter((x) => !now.includes(x));

  for (const field of ['fontSizes', 'colors']) {
    const was = baseline[field] || [];
    const now = current[field] || [];
    const plus = added(was, now);
    const minus = gone(was, now);
    if (plus.length) diffs.push(`${field}: newly rendered — ${plus.join(', ')}`);
    if (minus.length) notes.push(`${field}: not on screen this run — ${minus.join(', ')}`);
  }

  const anchorsGone = gone(baseline.anchors || [], current.anchors || []);
  if (anchorsGone.length) diffs.push(`anchors: no longer rendered — ${anchorsGone.join(', ')}`);

  const b = baseline.viewport || {};
  const c = current.viewport || {};
  for (const k of ['scrollWidth', 'scrollHeight']) {
    if (b[k] == null || c[k] == null) continue;
    const drift = Math.abs(c[k] - b[k]) / Math.max(b[k], 1);
    if (drift > scrollTolerance) diffs.push(`${k}: ${b[k]} → ${c[k]} (${Math.round(drift * 100)}% drift)`);
  }
  return { ok: diffs.length === 0, diffs, notes };
}
