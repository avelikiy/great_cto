// Quick production smoke test against greatcto.systems.
// Run: cd tests/ui && npx playwright test prod-test.spec.mjs --config=sync.config.mjs

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEWS = join(__dirname, '..', '..', 'site', '.previews');
mkdirSync(PREVIEWS, { recursive: true });

const PROD = 'https://greatcto.systems';

test.use({ viewport: { width: 1440, height: 900 } });

test('prod 01 archetypes grid is grid layout (not stacked)', async ({ page }) => {
  await page.goto(PROD);
  await page.locator('#archetypes').scrollIntoViewIfNeeded();
  const cols = await page.locator('#archetypes .archetypes-grid').evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
  );
  expect(cols).toBeGreaterThanOrEqual(3);
});

test('prod 02 stats widget is horizontal flex (not stacked)', async ({ page }) => {
  await page.goto(PROD);
  const display = await page.locator('.stats-widget').evaluate((el) =>
    getComputedStyle(el).display
  );
  expect(display).toMatch(/flex/);
});

test('prod 03 multi-project showcase block is gone (table row may remain)', async ({ page }) => {
  await page.goto(PROD);
  const showcaseNums = await page.locator('.showcase-num').allTextContents();
  expect(showcaseNums).not.toContain('04 · MULTI-PROJECT');
});

test('prod 04 vs-table has group rows', async ({ page }) => {
  await page.goto(PROD);
  const groups = await page.locator('#vs tr.vs-group').count();
  expect(groups).toBe(3);
});

test('prod 05 capture full prod screenshot', async ({ page }) => {
  await page.goto(PROD);
  await page.waitForTimeout(1500); // stats widget load
  await page.screenshot({ path: join(PREVIEWS, 'prod-full.png'), fullPage: true });
});

test('prod 06 capture archetypes section', async ({ page }) => {
  await page.goto(PROD);
  await page.locator('#archetypes').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.locator('#archetypes').screenshot({ path: join(PREVIEWS, 'prod-archetypes.png') });
});

test('prod 07 capture comparison table', async ({ page }) => {
  await page.goto(PROD);
  await page.locator('#vs').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.locator('#vs').screenshot({ path: join(PREVIEWS, 'prod-vs-table.png') });
});

test('prod 08 capture stats widget', async ({ page }) => {
  await page.goto(PROD);
  await page.waitForTimeout(2500);
  await page.locator('.stats-widget').screenshot({ path: join(PREVIEWS, 'prod-stats.png') });
});

test('prod 09 archetype pages reachable', async ({ page }) => {
  for (const slug of ['agent-product', 'fintech', 'healthcare']) {
    const res = await page.goto(`${PROD}/for/${slug}`);
    expect(res.status()).toBe(200);
  }
});
