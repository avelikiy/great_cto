/**
 * §4.A — Sub-tab switching inside the Security panel.
 *
 * Acceptance:
 *   • Clicking Security in the sidebar opens panel-leash
 *   • Each of the 6 sub-tabs renders content when clicked
 *   • Active tab has the leash-subtab.active class
 *   • Sub-tab choice survives a page reload (localStorage:leash:sub)
 */

import { test, expect } from '@playwright/test';

const SUBTABS = ['review', 'sessions', 'threats', 'agents', 'budgets', 'export'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Open Security from sidebar
  await page.locator('[data-tab="leash"]').click();
  await expect(page.locator('#panel-leash')).toBeVisible();
});

test('all six sub-tabs render content when clicked', async ({ page }) => {
  for (const name of SUBTABS) {
    await page.locator(`button.leash-subtab[data-subtab="${name}"]`).click();
    const panel = page.locator(`#leash-sub-${name}`);
    await expect(panel, `sub-${name} should be visible`).toBeVisible();
    const activeBtn = page.locator(`button.leash-subtab[data-subtab="${name}"].active`);
    await expect(activeBtn, `${name} button should be active`).toHaveCount(1);
  }
});

test('only one sub-tab is active at a time', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="threats"]').click();
  const active = await page.locator('button.leash-subtab.active').count();
  expect(active).toBe(1);
});

test('selected sub-tab persists across reload', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="agents"]').click();
  await expect(page.locator('#leash-sub-agents')).toBeVisible();

  await page.reload();
  // Re-open Security tab (sidebar tab persists separately)
  await page.locator('[data-tab="leash"]').click();
  await expect(page.locator('#leash-sub-agents')).toBeVisible();
  await expect(page.locator('button.leash-subtab[data-subtab="agents"].active')).toHaveCount(1);
});
