/**
 * §4.A — Runtime governance toggle drives proxy lifecycle.
 *
 * Acceptance:
 *   • The Security sidebar entry shows a status badge (on / off / setup)
 *   • Toggle widget reflects current state
 *   • Clicking it POSTs /api/leash/toggle with the inverse `enabled`
 *
 * NB: this test does NOT actually flip the proxy on/off in CI — that would
 * race with other tests. We assert only on the network round-trip.
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-tab="leash"]').click();
  await expect(page.locator('#panel-leash')).toBeVisible();
});

test('sidebar shows a badge for Security tab', async ({ page }) => {
  const badge = page.locator('#nav-leash-badge');
  await expect(badge).toBeVisible();
  const txt = (await badge.innerText()).toLowerCase();
  expect(['on', 'off', 'setup', 'down', 'partial']).toContain(txt.trim());
});

test('toggle widget is present', async ({ page }) => {
  await expect(page.locator('#leash-toggle')).toBeAttached();
  await expect(page.locator('#leash-toggle-visual')).toBeVisible();
});

test('clicking toggle sends POST /api/leash/toggle', async ({ page }) => {
  // Mock the POST so we don't actually toggle the proxy
  await page.route('**/api/leash/toggle**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, enabled: true, proxy: { running: true, pid: 99999 } }),
    });
  });

  // Wait for the request rather than wall-clock — Playwright pattern
  const reqPromise = page.waitForRequest(
    (r) => r.url().includes('/api/leash/toggle') && r.method() === 'POST',
    { timeout: 5000 },
  );
  await page.locator('#leash-toggle-visual').click();
  const req = await reqPromise;
  expect(req.method()).toBe('POST');
  const body = req.postDataJSON();
  expect(body).toHaveProperty('enabled');
});
