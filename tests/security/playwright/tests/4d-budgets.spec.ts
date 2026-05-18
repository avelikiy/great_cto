/**
 * §4.G — Budgets editor end-to-end.
 *
 * Acceptance:
 *   • Switching to Budgets sub-tab fetches /api/leash/budgets
 *   • Default label shows "default cap: $N · scope: ..."
 *   • Empty-state when no agents observed for tenant
 *   • "show global caps →" link switches scope to all
 *   • Add-cap form posts to /api/leash/budgets/<agent>
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-tab="leash"]').click();
  await page.locator('button.leash-subtab[data-subtab="budgets"]').click();
  await expect(page.locator('#leash-sub-budgets')).toBeVisible();
});

test('budgets sub-tab fetches /api/leash/budgets', async ({ page }) => {
  const reqPromise = page.waitForRequest((r) => r.url().includes('/api/leash/budgets'));
  // Re-toggle the tab to force a fresh fetch
  await page.locator('button.leash-subtab[data-subtab="agents"]').click();
  await page.locator('button.leash-subtab[data-subtab="budgets"]').click();
  await reqPromise;
});

test('default label renders default cap + scope', async ({ page }) => {
  const label = page.locator('#leash-budgets-default');
  // Wait up to 8 s for the async /api/leash/budgets fetch to populate the label
  await expect(label).toContainText(/default cap: \$\d/, { timeout: 8_000 });
  await expect(label).toContainText(/scope:/);
});

test('show global caps link is present when tenant-scoped', async ({ page }) => {
  const label = page.locator('#leash-budgets-default');
  // Wait for label to be populated (not just the initial dash)
  await expect(label).toContainText(/default cap: \$\d/, { timeout: 8_000 });
  const scope = await page.locator('#leash-scope').inputValue();
  if (scope !== 'all') {
    const html = await label.innerHTML();
    expect(html).toContain('show global caps');
  }
});

test('add-cap form posts to /api/leash/budgets/<agent>', async ({ page }) => {
  const agent = `playwright_test_${Date.now()}`;
  // Mock the POST so we don't pollute leash state
  let captured: { url: string; body: unknown } | null = null;
  await page.route('**/api/leash/budgets/' + agent + '**', async (route) => {
    captured = { url: route.request().url(), body: route.request().postDataJSON() };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.locator('#leash-budget-add-agent').fill(agent);
  await page.locator('#leash-budget-add-cap').fill('1.50');
  await page.locator('button:has-text("+ add cap")').click();
  await page.waitForTimeout(500);

  expect(captured, 'add-cap should POST').not.toBeNull();
  expect((captured!.body as any).cap_usd).toBe(1.5);
});

test('save+clear buttons exist when there are observed caps', async ({ page }) => {
  // Switch to all-projects so we see the global caps
  await page.locator('#leash-scope').selectOption('all');
  await page.waitForTimeout(800);
  const saves = await page.locator('#leash-sub-budgets button:has-text("save")').count();
  const clears = await page.locator('#leash-sub-budgets button:has-text("clear")').count();
  // Either both are 0 (no caps) or matched
  expect(saves).toBe(clears);
});
