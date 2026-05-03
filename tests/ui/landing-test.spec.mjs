// Landing-page smoke tests + capture preview screenshots after rebuild.
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

test.describe('Landing page', () => {
  test('01 hero loads with stats widget', async ({ page }) => {
    await page.goto(SITE);
    await expect(page.locator('h1')).toContainText('Stop being');
    await expect(page.locator('.stats-widget')).toBeVisible();
  });

  test('02 board section has real screenshots', async ({ page }) => {
    await page.goto(SITE);
    const screenshots = page.locator('section#board .screenshot img');
    const count = await screenshots.count();
    expect(count).toBeGreaterThanOrEqual(5); // kanban, metrics, agents, inbox, projects, memory
  });

  test('03 archetypes section has 17 cards', async ({ page }) => {
    await page.goto(SITE);
    const cards = page.locator('#archetypes .arch-card');
    const count = await cards.count();
    expect(count).toBe(17);
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

  test('06 capture full landing screenshot for review', async ({ page }) => {
    await page.goto(SITE);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(PREVIEWS, 'landing-full.png'), fullPage: true });
  });

  test('07 mobile viewport renders without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(395); // hero + 5px slack
    await page.screenshot({ path: join(PREVIEWS, 'landing-mobile.png'), fullPage: true });
  });

  test('08 archetypes section visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    await page.locator('#archetypes').scrollIntoViewIfNeeded();
    await expect(page.locator('#archetypes .archetypes-grid')).toBeVisible();
  });

  test('09 vs comparison table scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE);
    await page.locator('#vs').scrollIntoViewIfNeeded();
    await expect(page.locator('.vs-grid')).toBeVisible();
  });
});

test.describe('Archetype landing pages', () => {
  test('10 /for/agent-product.html loads with correct title', async ({ page }) => {
    await page.goto(SITE + '/for/agent-product.html');
    await expect(page.locator('h1')).toContainText('agent product');
    await expect(page.locator('.hero-eyebrow')).toContainText('agent-product');
  });

  test('11 /for/fintech.html loads with correct title', async ({ page }) => {
    await page.goto(SITE + '/for/fintech.html');
    await expect(page.locator('h1')).toContainText('banking');
    await expect(page.locator('.hero-eyebrow')).toContainText('fintech');
  });

  test('12 /for/healthcare.html loads with correct title', async ({ page }) => {
    await page.goto(SITE + '/for/healthcare.html');
    await expect(page.locator('h1')).toContainText('healthcare');
    await expect(page.locator('.hero-eyebrow')).toContainText('healthcare');
  });

  test('13 archetype cards have learn-more links', async ({ page }) => {
    await page.goto(SITE);
    const links = page.locator('.archetypes-grid a.arch-link');
    expect(await links.count()).toBe(3); // agent-product, fintech, healthcare
  });
});
