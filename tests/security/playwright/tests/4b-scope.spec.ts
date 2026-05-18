/**
 * §4.B — Scope dropdown (project / all) drives /api/security calls.
 *
 * Acceptance:
 *   • Default option shows "— <project> (this cwd) —"
 *   • Switching to "all projects" sends ?project=all to /api/security
 *   • Effective tenant label updates accordingly
 *   • Choice persists in localStorage:leash:scope
 *   • Period chip clicks update localStorage:leash:period and re-fetch
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-tab="leash"]').click();
  await expect(page.locator('#panel-leash')).toBeVisible();
});

test('default scope resolves to the project tenant', async ({ page }) => {
  const select = page.locator('#leash-scope');
  await expect(select).toBeVisible();
  const active = page.locator('#leash-scope-active');
  await expect(active).toContainText(/→ \S+/);
});

test('switching to all projects sends ?project=all', async ({ page }) => {
  const select = page.locator('#leash-scope');

  // Capture the next /api/security request after we change scope
  const reqPromise = page.waitForRequest((r) =>
    r.url().includes('/api/security') && r.url().includes('project=all'),
    { timeout: 10_000 },
  );

  await select.selectOption('all');
  const req = await reqPromise;
  expect(req.url()).toContain('project=all');
  await expect(page.locator('#leash-scope-active')).toContainText('all');
});

test('scope choice persists in localStorage', async ({ page }) => {
  await page.locator('#leash-scope').selectOption('all');
  const value = await page.evaluate(() => localStorage.getItem('leash:scope'));
  expect(value).toBe('all');
});

test('period chip click updates localStorage and re-fetches', async ({ page }) => {
  // The chip bar populates from JS on first poll
  await page.waitForSelector('#leash-period-chips .leash-chip[data-period="24h"]', { timeout: 10_000 });

  const reqPromise = page.waitForRequest(
    (r) => r.url().includes('/api/leash/audit') || r.url().includes('/api/security'),
    { timeout: 10_000 },
  );
  await page.locator('#leash-period-chips .leash-chip[data-period="24h"]').click();
  await reqPromise;

  const stored = await page.evaluate(() => localStorage.getItem('leash:period'));
  expect(stored).toBe('24h');
});
