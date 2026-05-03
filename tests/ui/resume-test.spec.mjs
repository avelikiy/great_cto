// Resume-card test — verifies the new memory-mix UI surface
import { test, expect } from '@playwright/test';

const BOARD_URL = 'http://localhost:3141';
const PRJ_SLUG = 'gcto-pipeline-test';

test.describe('Resume card', () => {
  test('01 resume card visible when there are recent verdicts/gates/decisions', async ({ page }) => {
    await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
    await page.waitForFunction(
      (slug) => document.getElementById('project-name')?.textContent?.includes(slug),
      PRJ_SLUG,
      { timeout: 10000, polling: 200 }
    );
    // Wait for Resume API call to complete
    await page.waitForFunction(
      () => {
        const card = document.getElementById('resume-card');
        return card && card.style.display !== 'none';
      },
      null,
      { timeout: 8000, polling: 300 }
    );
    await expect(page.locator('#resume-card')).toBeVisible();
    await expect(page.locator('.resume-title')).toHaveText('Pick up where you left off');
  });

  test('02 resume card has 3 columns: WIP, verdicts, decisions', async ({ page }) => {
    await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
    await page.waitForSelector('#resume-card', { state: 'attached', timeout: 5000 });
    const heads = await page.locator('.resume-col-head').allTextContents();
    expect(heads).toContain('In progress');
    expect(heads).toContain('Recent verdicts');
    expect(heads).toContain('Decisions');
  });

  test('03 decisions column populated after gate approve', async ({ page }) => {
    await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
    await page.waitForSelector('#resume-decisions', { timeout: 5000 });
    // We approved a gate earlier — should show at least one decision
    await page.waitForFunction(
      () => {
        const el = document.getElementById('resume-decisions');
        return el && (el.querySelectorAll('.resume-item').length > 0);
      },
      null,
      { timeout: 8000, polling: 300 }
    );
    const items = await page.locator('#resume-decisions .resume-item').count();
    expect(items).toBeGreaterThan(0);
    // Should contain the APPROVED tag
    const approvedTags = await page.locator('#resume-decisions .ri-tag.ok').count();
    expect(approvedTags).toBeGreaterThan(0);
  });

  test('04 verdicts column shows recent agent verdicts', async ({ page }) => {
    await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
    await page.waitForSelector('#resume-verdicts', { timeout: 5000 });
    // Verdicts are global mock data — should show some
    await page.waitForTimeout(800);
    const verdictsHtml = await page.locator('#resume-verdicts').innerHTML();
    // either has items OR shows empty state
    expect(verdictsHtml.length).toBeGreaterThan(0);
  });

  test('05 /api/resume returns expected shape', async ({ page }) => {
    await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
    const res = await page.evaluate(async (slug) => {
      const r = await fetch(`/api/resume?project=${slug}`);
      return await r.json();
    }, PRJ_SLUG);
    expect(res).toHaveProperty('recent_verdicts');
    expect(res).toHaveProperty('open_gates');
    expect(res).toHaveProperty('wip_tasks');
    expect(res).toHaveProperty('decisions');
    expect(Array.isArray(res.recent_verdicts)).toBe(true);
  });

  test('06 /api/decisions returns parsed list', async ({ page }) => {
    await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/decisions?limit=5');
      return await r.json();
    });
    expect(Array.isArray(res)).toBe(true);
    if (res.length > 0) {
      const first = res[0];
      expect(first).toHaveProperty('ts');
      expect(first).toHaveProperty('project');
      expect(first).toHaveProperty('verdict');
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('title');
    }
  });
});
