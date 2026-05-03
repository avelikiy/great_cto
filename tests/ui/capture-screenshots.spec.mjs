// Auto-capture 8+ landing-page screenshots from the live admin board.
// Re-run after UI changes:
//   cd tests/ui && npx playwright test capture-screenshots.spec.mjs --config=sync.config.mjs
//
// Outputs go to site/assets/screenshots/

import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'site', 'assets', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BOARD = 'http://localhost:3141';
const PRJ = 'gcto-pipeline-test';

async function gotoProject(page) {
  await page.goto(`${BOARD}?project=${PRJ}`);
  await page.waitForFunction(
    (s) => document.getElementById('project-name')?.textContent?.includes(s),
    PRJ,
    { timeout: 10000, polling: 200 },
  );
  await page.waitForTimeout(800); // SSE settle
}

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

test.describe('Capture landing screenshots', () => {
  test('01 inbox — full view with Resume card + pending gates', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="inbox"]').click();
    await page.waitForSelector('#panel-inbox.active', { timeout: 5000 });
    await page.waitForTimeout(800); // resume card load
    await page.screenshot({ path: join(OUT, '01-inbox.png'), fullPage: false });
  });

  test('02 kanban — 5 columns with real tasks', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForSelector('#kanban-board .column', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, '02-kanban.png'), fullPage: false });
  });

  test('03 project switcher menu open', async ({ page }) => {
    await gotoProject(page);
    await page.locator('#proj-switch').click();
    await page.waitForSelector('#proj-menu', { state: 'visible', timeout: 3000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, '03-projects.png'), fullPage: false });
  });

  test('04 new issue modal', async ({ page }) => {
    await gotoProject(page);
    await page.locator('button.btn-new').click();
    await page.waitForSelector('#new-issue-modal', { timeout: 3000 });
    await page.locator('#ni-input-title').fill('Add OAuth provider');
    await page.locator('#ni-input-desc').fill('Add Google + GitHub OAuth flows. Reuse existing JWT middleware.');
    await page.locator('#ni-input-priority').selectOption('1');
    await page.locator('#ni-input-agent').selectOption('senior-dev');
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, '04-new-issue-modal.png'), fullPage: false });
    // Close modal without submitting
    await page.keyboard.press('Escape');
  });

  test('05 kanban with filter bar active', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForSelector('#kanban-board .column', { timeout: 5000 });
    // Click a priority filter chip if it exists
    const p1Chip = page.locator('.fchip:has-text("P1"), .fchip:has-text("p1"), .fchip-priority').first();
    if (await p1Chip.count() > 0) {
      await p1Chip.click().catch(() => {});
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, '05-filter-bar.png'), fullPage: false });
  });

  test('06 side panel with task description', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForSelector('#kanban-board .column .card', { timeout: 5000 });
    // Click a card with description
    const cards = page.locator('#kanban-board .card');
    const count = await cards.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text && text.length > 30) {
        await cards.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await cards.first().click();
    await page.waitForSelector('#side-panel.open', { timeout: 3000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, '06-side-panel.png'), fullPage: false });
  });

  test('07 metrics — hero + cost panel', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    await page.waitForSelector('#panel-dashboard.active', { timeout: 5000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, '07-metrics.png'), fullPage: false });
  });

  test('08 agents tab — cost breakdown + activity', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="agents"]').click();
    await page.waitForSelector('#panel-agents.active', { timeout: 5000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, '08-agents.png'), fullPage: false });
  });

  test('09 memory tab — 4 layers', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="memory"]').click();
    await page.waitForSelector('#panel-memory.active', { timeout: 5000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, '09-memory.png'), fullPage: false });
  });

  test('10 hotkeys cheatsheet modal', async ({ page }) => {
    await gotoProject(page);
    await page.keyboard.press('Shift+/'); // ? key
    await page.waitForTimeout(400);
    const modal = page.locator('#hotkey-modal');
    if (await modal.count() > 0) {
      await page.screenshot({ path: join(OUT, '10-hotkeys.png'), fullPage: false });
    }
  });
});
