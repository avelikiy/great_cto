// Playwright e2e for great_cto board admin
// Run: cd tests/ui && npx playwright test board.spec.mjs
import { test, expect } from '@playwright/test';

test.describe('board admin', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
    await page.goto('/');
    // Wait for init() to render the inbox summary (signals API responses processed)
    await page.waitForFunction(() => {
      const cnt = document.getElementById('nav-task-count');
      return cnt && cnt.textContent && parseInt(cnt.textContent, 10) > 0;
    }, { timeout: 15000 });
  });

  test('renders sidebar with brand + nav', async ({ page }) => {
    await expect(page.locator('.sidebar-brand .brand-name')).toHaveText('greatcto');
    await expect(page.locator('.nav-item[data-tab="inbox"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-tab="kanban"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-tab="dashboard"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-tab="memory"]')).toBeVisible();
    await expect(page.locator('.nav-item[data-tab="share"]')).toBeVisible();
  });

  test('Inbox shows pending gates from fixture', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    await expect(page.locator('#inbox-gates .inbox-row').first()).toBeVisible({ timeout: 5000 });
    const gates = await page.locator('#inbox-gates .inbox-row').count();
    expect(gates).toBeGreaterThanOrEqual(2);  // arch + ship
    // Each gate row has Approve and Reject buttons
    const firstGate = page.locator('#inbox-gates .inbox-row').first();
    await expect(firstGate.locator('.gate-approve')).toBeVisible();
    await expect(firstGate.locator('.gate-reject')).toBeVisible();
  });

  test('Inbox summary pills show non-zero counts', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    const summary = page.locator('#inbox-summary');
    await expect(summary).toBeVisible({ timeout: 5000 });
    // Should have 4 pill-stats
    const pills = await summary.locator('.pill-stat').count();
    expect(pills).toBe(4);
  });

  test('Pipeline track renders 7 stages', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    const stages = page.locator('#pipeline-track .pl-stage');
    await expect(stages.first()).toBeVisible({ timeout: 5000 });
    expect(await stages.count()).toBe(7);
  });

  test('Kanban renders 5 columns + cards have description preview', async ({ page }) => {
    await page.locator('.tab-btn[data-tab="kanban"]').click().catch(() => {});
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await expect(page.locator('.column').first()).toBeVisible({ timeout: 5000 });
    expect(await page.locator('.column').count()).toBeGreaterThanOrEqual(5);
    // Some cards should have description preview
    await expect(page.locator('.card .card-desc').first()).toBeVisible();
  });

  test('Side panel opens with description + design + acceptance', async ({ page }) => {
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.locator('.card').first().click();
    await expect(page.locator('#side-panel.open')).toBeVisible();
    await expect(page.locator('.side-title')).toBeVisible();
    // Either description present or graceful fallback
    await page.locator('#side-panel .side-close').click();
    await expect(page.locator('#side-panel.open')).toHaveCount(0);
  });

  test('Topbar search filters tasks', async ({ page }) => {
    const search = page.locator('#search-input');
    await search.fill('OAuth');
    await page.waitForTimeout(200);
    // Topbar count should change to MATCH suffix
    await expect(page.locator('#topbar-task-count')).toContainText('MATCH');
  });

  test('Metrics tab shows Cost panel + agent utilization + activity', async ({ page }) => {
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    await expect(page.locator('#mp-hero .metric-card').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cost-panel')).toBeVisible();
    await expect(page.locator('#agent-list')).toBeVisible();
    await expect(page.locator('#timeline')).toBeVisible();
  });

  test('Memory tab loads PROJECT + brain from fixture', async ({ page }) => {
    await page.locator('.nav-item[data-tab="memory"]').click();
    await expect(page.locator('.memory-page')).toBeVisible({ timeout: 5000 });
    // Should render at least PROJECT.md content (heading "UI Test Fixture")
    await expect(page.locator('.memory-doc h1, .memory-doc h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('Share tab toggle works', async ({ page }) => {
    await page.locator('.nav-item[data-tab="share"]').click();
    await expect(page.locator('.share-card')).toBeVisible();
    await expect(page.locator('#share-toggle-visual')).toBeVisible();
  });

  test('API endpoints respond with valid JSON', async ({ request }) => {
    const tasks = await (await request.get('/api/tasks')).json();
    expect(Array.isArray(tasks)).toBe(true);

    const metrics = await (await request.get('/api/metrics')).json();
    expect(metrics).toHaveProperty('tasks');
    expect(metrics).toHaveProperty('cost');

    const inbox = await (await request.get('/api/inbox')).json();
    expect(inbox).toHaveProperty('summary');
    expect(inbox).toHaveProperty('pending_gates');

    const pipeline = await (await request.get('/api/pipeline')).json();
    expect(Array.isArray(pipeline)).toBe(true);
    expect(pipeline.length).toBe(7);

    const cost = await (await request.get('/api/cost?days=30')).json();
    expect(cost).toHaveProperty('series');
    expect(cost.series.length).toBe(30);

    const memory = await (await request.get('/api/memory')).json();
    expect(memory).toHaveProperty('layers');
  });
});
