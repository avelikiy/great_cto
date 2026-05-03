// Mobile-viewport smoke tests against production greatcto.systems.
// Captures preview images for manual review.

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEWS = join(__dirname, '..', '..', 'site', '.previews');
mkdirSync(PREVIEWS, { recursive: true });

const PROD = 'https://greatcto.systems';

// Common phone viewports
const viewports = [
  { name: 'iphone-15',     w: 393, h: 852 },
  { name: 'iphone-se',     w: 375, h: 667 },
  { name: 'iphone-mini',   w: 320, h: 568 },
  { name: 'pixel-7',       w: 412, h: 915 },
  { name: 'tablet-mini',   w: 768, h: 1024 },
];

for (const v of viewports) {
  test.describe(`mobile · ${v.name} (${v.w}×${v.h})`, () => {
    test(`hero has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD);
      await page.waitForTimeout(800);
      const docW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(docW, `viewport=${v.w} but doc=${docW}`).toBeLessThanOrEqual(v.w + 4);
    });

    test(`stats widget readable (4 cells visible)`, async ({ page }) => {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD);
      await page.waitForTimeout(2000);
      const cells = await page.locator('.stats-widget .stat-cell').count();
      expect(cells).toBeGreaterThanOrEqual(4);
    });

    test(`archetypes grid renders cards in multi-col`, async ({ page }) => {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD);
      await page.locator('#archetypes').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const cols = await page.locator('#archetypes .archetypes-grid').evaluate((el) =>
        getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
      );
      // Expect at least 2 columns even on 320px wide (cards ~130px min)
      expect(cols).toBeGreaterThanOrEqual(2);
    });

    test(`vs-table is horizontally scrollable on small width`, async ({ page }) => {
      if (v.w >= 768) test.skip(); // tablet renders without scroll
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD);
      await page.locator('#vs').scrollIntoViewIfNeeded();
      const overflow = await page.locator('.vs-table').evaluate((el) =>
        getComputedStyle(el).overflowX
      );
      expect(['auto', 'scroll']).toContain(overflow);
    });

    test(`nav CTA visible (Install button)`, async ({ page }) => {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD);
      await expect(page.locator('.nav-right .cta')).toBeVisible();
    });

    test(`board section screenshots render (no broken images)`, async ({ page }) => {
      const failed = [];
      page.on('response', (r) => {
        if (/\.(png|svg)/.test(r.url()) && r.status() >= 400) failed.push(r.url());
      });
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD, { waitUntil: 'networkidle' });
      // Scroll through to trigger lazy loads
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
      expect(failed, `broken: ${failed.join(', ')}`).toEqual([]);
    });

    test(`capture preview screenshot`, async ({ page }) => {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.goto(PROD);
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: join(PREVIEWS, `mobile-${v.name}.png`),
        fullPage: true,
      });
    });
  });
}

// Specific feature checks at 390px (common iPhone)
test.describe('mobile · interactions @ 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('archetype card tap navigates to /for/<slug>', async ({ page }) => {
    await page.goto(PROD);
    await page.locator('#archetypes').scrollIntoViewIfNeeded();
    await page.locator('a.arch-card').first().click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/for\//);
  });

  test('archetype landing page renders mobile-fit', async ({ page }) => {
    await page.goto(PROD + '/for/fintech');
    await page.waitForTimeout(500);
    const docW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docW).toBeLessThanOrEqual(395);
  });

  test('install CTA copy button works on touch', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(PROD);
    await page.locator('.copy-btn').first().scrollIntoViewIfNeeded();
    await page.locator('.copy-btn').first().click();
    await page.waitForTimeout(300);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe('npx great-cto init');
  });
});
