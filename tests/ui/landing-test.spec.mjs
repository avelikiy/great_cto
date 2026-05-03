// Comprehensive landing-page Playwright tests.
//
// Run: cd tests/ui && npx playwright test landing-test.spec.mjs --config=sync.config.mjs

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEWS = join(__dirname, '..', '..', 'site', '.previews');
mkdirSync(PREVIEWS, { recursive: true });

const SITE = 'http://localhost:8767';

test.use({ viewport: { width: 1440, height: 900 } });

// ── Smoke + structure ────────────────────────────────────────────────────
test.describe('Landing page · structure', () => {
  test('01 hero loads with stats widget', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('h1')).toContainText('Stop being');
    await expect(page.locator('.stats-widget')).toBeVisible();
  });

  test('02 board section has at least 5 real screenshots', async ({ page }) => {
    await page.goto(SITE);
    const screenshots = page.locator('section#board .screenshot img');
    expect(await screenshots.count()).toBeGreaterThanOrEqual(5);
  });

  test('03 archetypes section has exactly 17 cards', async ({ page }) => {
    await page.goto(SITE);
    expect(await page.locator('#archetypes .arch-card').count()).toBe(17);
  });

  test('04 comparison table renders with us-column highlighted', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('#vs .vs-grid')).toBeVisible();
    await expect(page.locator('#vs .vs-grid th.vs-us')).toContainText('great_cto');
  });

  test('05 nav has updated links (Archetypes, vs Cursor)', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('.nav a[href="#archetypes"]')).toBeVisible();
    await expect(page.locator('.nav a[href="#vs"]')).toBeVisible();
  });

  test('06 capture full-page preview screenshot', async ({ page }) => {
    await page.goto(SITE);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(PREVIEWS, 'landing-full.png'), fullPage: true });
  });

  test('07 hero CTA buttons present', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('.cta-row .btn-primary')).toContainText('npx great-cto init');
    await expect(page.locator('.cta-row .btn-ghost')).toContainText('GitHub');
  });

  test('08 final CTA section + copy command button', async ({ page }) => {
    await page.goto(SITE);
    await page.locator('.final-cta').scrollIntoViewIfNeeded();
    await expect(page.locator('.final-cta h2')).toContainText('bottleneck');
    await expect(page.locator('.copy-btn')).toBeVisible();
  });

  test('09 footer present with key links', async ({ page }) => {
    await page.goto(SITE);
    await page.locator('footer.footer').scrollIntoViewIfNeeded();
    const links = await page.locator('footer.footer a').allTextContents();
    expect(links.join(' ')).toContain('GitHub');
    expect(links.join(' ')).toContain('npm');
  });
});

// ── Asset integrity ──────────────────────────────────────────────────────
test.describe('Landing · assets load', () => {
  test('10 all <img> tags load (no 404)', async ({ page }) => {
    const failed = [];
    page.on('response', (r) => {
      const url = r.url();
      if (/\.(png|jpe?g|svg|gif|webp)/.test(url) && r.status() >= 400) {
        failed.push({ url, status: r.status() });
      }
    });
    await page.goto(SITE, { waitUntil: 'networkidle' });
    expect(failed, `${failed.length} image(s) failed`).toEqual([]);
  });

  test('11 all internal anchor links resolve to existing sections', async ({ page }) => {
    await page.goto(SITE);
    const hrefs = await page.locator('a[href^="#"]').evaluateAll((els) =>
      Array.from(new Set(els.map((a) => a.getAttribute('href')).filter((h) => h && h !== '#')))
    );
    const missing = [];
    for (const h of hrefs) {
      const id = h.slice(1);
      const exists = await page.locator(`#${id}`).count();
      if (!exists) missing.push(h);
    }
    expect(missing, `missing anchors: ${missing.join(', ')}`).toEqual([]);
  });

  test('12 stylesheet loads (CSS rules > 200)', async ({ page }) => {
    await page.goto(SITE);
    const ruleCount = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      return sheets.reduce((n, s) => {
        try { return n + (s.cssRules?.length || 0); } catch { return n; }
      }, 0);
    });
    expect(ruleCount).toBeGreaterThan(200);
  });

  test('13 OG meta tags use real screenshot, not placeholder', async ({ page }) => {
    await page.goto(SITE);
    const ogImg = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImg).toContain('og-board.png');
    const twImg = await page.locator('meta[name="twitter:image"]').getAttribute('content');
    expect(twImg).toContain('og-board.png');
  });
});

// ── Console errors ───────────────────────────────────────────────────────
test.describe('Landing · runtime', () => {
  test('14 no console errors on load', async ({ page }) => {
    const errs = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errs.push(msg.text()); });
    page.on('pageerror', (err) => errs.push(String(err)));
    await page.goto(SITE, { waitUntil: 'networkidle' });
    // Filter out known-OK noise (e.g. 3rd-party network failures from CF)
    const real = errs.filter((e) => !/api\/stats\/widget/.test(e));
    expect(real, `errors: ${real.join('\n')}`).toEqual([]);
  });

  test('15 stats widget either populates or gracefully shows fallback', async ({ page }) => {
    await page.goto(SITE);
    await page.waitForTimeout(2500);
    // Either real numbers, or '—' (fallback) — both OK; just must not throw
    const week = await page.locator('#stat-week').textContent();
    const total = await page.locator('#stat-total').textContent();
    expect(week).toBeTruthy();
    expect(total).toBeTruthy();
  });

  test('16 nav scroll-to anchor works', async ({ page }) => {
    await page.goto(SITE);
    await page.locator('.nav a[href="#archetypes"]').click();
    await page.waitForTimeout(500);
    const inView = await page.locator('#archetypes').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    expect(inView).toBe(true);
  });

  test('17 copy-cmd button copies text', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(SITE);
    await page.locator('.copy-btn').first().scrollIntoViewIfNeeded();
    await page.locator('.copy-btn').first().click();
    await page.waitForTimeout(300);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe('npx great-cto init');
  });
});

// ── Mobile responsive ────────────────────────────────────────────────────
test.describe('Landing · mobile', () => {
  test('18 mobile viewport (390px) renders without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(395);
    await page.screenshot({ path: join(PREVIEWS, 'landing-mobile.png'), fullPage: true });
  });

  test('19 mobile viewport (320px iPhone SE) — content still readable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(SITE);
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(330);
  });

  test('20 archetype grid wraps on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    await page.locator('#archetypes').scrollIntoViewIfNeeded();
    await expect(page.locator('#archetypes .archetypes-grid')).toBeVisible();
    // First archetype card should be visible
    await expect(page.locator('.arch-card').first()).toBeVisible();
  });

  test('21 vs comparison table horizontally scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    await page.locator('#vs').scrollIntoViewIfNeeded();
    const overflowable = await page.locator('.vs-table').evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    });
    expect(overflowable).toBe(true);
  });

  test('22 nav collapses links on mobile (only CTA visible)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    const visibleLinks = await page.locator('.nav-right .nav-link:visible').count();
    expect(visibleLinks).toBe(0); // nav-link hidden on mobile per CSS
    await expect(page.locator('.nav-right .cta')).toBeVisible();
  });
});

// ── Archetype landing pages ──────────────────────────────────────────────
test.describe('Archetype landing pages', () => {
  test('23 /for/agent-product.html loads with correct title + content', async ({ page }) => {
    await page.goto(SITE + '/for/agent-product.html');
    await expect(page).toHaveTitle(/Agent Products/);
    await expect(page.locator('h1')).toContainText('agent product');
    await expect(page.locator('.hero-eyebrow')).toContainText('agent-product');
    await expect(page.locator('.split-col.after')).toContainText(/agent-eval/i);
  });

  test('24 /for/fintech.html loads + Plaid mentioned', async ({ page }) => {
    await page.goto(SITE + '/for/fintech.html');
    await expect(page).toHaveTitle(/Fintech/);
    await expect(page.locator('h1')).toContainText('banking');
    await expect(page.locator('body')).toContainText('Plaid');
  });

  test('25 /for/healthcare.html loads + HIPAA mentioned', async ({ page }) => {
    await page.goto(SITE + '/for/healthcare.html');
    await expect(page).toHaveTitle(/Healthcare/);
    await expect(page.locator('h1')).toContainText('healthcare');
    await expect(page.locator('body')).toContainText('HIPAA');
  });

  test('26 archetype cards on home link to correct /for/ pages', async ({ page }) => {
    await page.goto(SITE);
    const links = page.locator('.archetypes-grid a.arch-link');
    expect(await links.count()).toBe(3);
    const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    // CF Pages strips .html — both forms acceptable
    const norm = (h) => h.replace(/\.html$/, '');
    expect(hrefs.map(norm)).toContain('/for/agent-product');
    expect(hrefs.map(norm)).toContain('/for/fintech');
    expect(hrefs.map(norm)).toContain('/for/healthcare');
  });

  test('27 archetype pages all link back to home', async ({ page }) => {
    for (const slug of ['agent-product', 'fintech', 'healthcare']) {
      await page.goto(`${SITE}/for/${slug}.html`);
      const homeLink = page.locator('a.nav-logo');
      await expect(homeLink).toHaveAttribute('href', '/');
    }
  });

  test('28 archetype pages each have install CTA', async ({ page }) => {
    for (const slug of ['agent-product', 'fintech', 'healthcare']) {
      await page.goto(`${SITE}/for/${slug}.html`);
      await expect(page.locator('section#install')).toBeVisible();
      await expect(page.locator('section#install .cmd')).toContainText('npx great-cto init');
    }
  });

  test('29 archetype pages: all images present (no broken)', async ({ page }) => {
    for (const slug of ['agent-product', 'fintech', 'healthcare']) {
      const failed = [];
      page.on('response', (r) => {
        if (/\.(png|svg)/.test(r.url()) && r.status() >= 400) failed.push(r.url());
      });
      await page.goto(`${SITE}/for/${slug}.html`, { waitUntil: 'networkidle' });
      expect(failed, `broken on ${slug}: ${failed.join(', ')}`).toEqual([]);
    }
  });
});

// ── Performance ──────────────────────────────────────────────────────────
test.describe('Landing · performance', () => {
  test('30 page weight (HTML + CSS) under 200KB', async ({ page }) => {
    let bytes = 0;
    page.on('response', async (r) => {
      const ct = r.headers()['content-type'] || '';
      if (/text\/html|text\/css|application\/javascript/.test(ct)) {
        try { const body = await r.body(); bytes += body.length; } catch {}
      }
    });
    await page.goto(SITE, { waitUntil: 'networkidle' });
    expect(bytes, `HTML+CSS+JS = ${(bytes/1024).toFixed(1)}KB`).toBeLessThan(200_000);
  });

  test('31 DOMContentLoaded under 1500ms', async ({ page }) => {
    await page.goto(SITE);
    const dcl = await page.evaluate(() => {
      const t = performance.timing;
      return t.domContentLoadedEventEnd - t.navigationStart;
    });
    expect(dcl).toBeLessThan(1500);
  });

  test('32 screenshots use loading=lazy', async ({ page }) => {
    await page.goto(SITE);
    const lazyImgs = await page.locator('img[loading="lazy"]').count();
    expect(lazyImgs).toBeGreaterThanOrEqual(5);
  });
});
