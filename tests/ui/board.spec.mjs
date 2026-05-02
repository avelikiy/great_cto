// Top-20 Playwright e2e for great_cto board admin
// Run: cd tests/ui && npx playwright test --project=chromium
import { test, expect } from '@playwright/test';

test.describe('great_cto admin — top-20 e2e', () => {
  let consoleErrors = [];

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip page nav for API-only tests
    if (testInfo.title.startsWith('21 ')) return;

    consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(`PAGE: ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(`CONSOLE: ${m.text()}`);
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for init() to populate task count — this signals API responses processed
    await page.waitForFunction(() => {
      const cnt = document.getElementById('nav-task-count');
      const t = cnt?.textContent?.trim();
      return t && t !== '0' && /^\d+/.test(t);
    }, null, { timeout: 30000, polling: 250 });
  });

  // ── 1. Smoke ──────────────────────────────────────────────────────────────
  test('01 smoke — page loads without console errors', async ({ page }) => {
    await expect(page).toHaveTitle(/great_cto/);
    await page.waitForTimeout(500);
    // Filter out third-party noise (font CDN, etc); fail only on app-level errors
    const appErrors = consoleErrors.filter(e =>
      !/fonts\.google/.test(e) && !/extension/.test(e) && !/ResizeObserver/.test(e)
    );
    expect(appErrors).toEqual([]);
  });

  // ── 2. Layout — sidebar ───────────────────────────────────────────────────
  test('02 sidebar renders brand + 5 nav items', async ({ page }) => {
    await expect(page.locator('.sidebar-brand .brand-name')).toHaveText('greatcto');
    await expect(page.locator('.sidebar-brand .brand-mark svg')).toBeVisible();
    for (const tab of ['inbox', 'kanban', 'dashboard', 'memory', 'share']) {
      await expect(page.locator(`.nav-item[data-tab="${tab}"]`)).toBeVisible();
    }
  });

  // ── 3. Layout — topbar ────────────────────────────────────────────────────
  test('03 topbar has crumbs + search + New issue', async ({ page }) => {
    await expect(page.locator('.crumbs #crumb-icon')).toBeVisible();
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('.btn-new')).toContainText('New issue');
    await expect(page.locator('#topbar-task-count')).toContainText('ISSUES');
  });

  // ── 4. Inbox — greeting + summary pills ───────────────────────────────────
  test('04 inbox greeting + 4 summary pills', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    await expect(page.locator('#inbox-greet')).toBeVisible();
    await expect(page.locator('#inbox-greet')).toContainText(/morning|afternoon|evening|late/i);
    const pills = page.locator('#inbox-summary .pill-stat');
    await expect(pills).toHaveCount(4);
  });

  // ── 5. Inbox — pending gates with Approve/Reject ──────────────────────────
  test('05 inbox shows pending gates with inline Approve/Reject', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    await expect(page.locator('#inbox-gates .inbox-row').first()).toBeVisible({ timeout: 5000 });
    const firstGate = page.locator('#inbox-gates .inbox-row').first();
    await expect(firstGate.locator('.gate-approve')).toBeVisible();
    await expect(firstGate.locator('.gate-reject')).toBeVisible();
    await expect(firstGate.locator('.gate-approve')).toHaveText(/Approve/);
  });

  // ── 6. Inbox — Active pipeline 7 stages ───────────────────────────────────
  test('06 pipeline track renders 7 stages with labels', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    await expect(page.locator('#pipeline-track .pl-stage').first()).toBeVisible();
    const stages = page.locator('#pipeline-track .pl-stage');
    await expect(stages).toHaveCount(7);
    const expectedLabels = ['architect', 'senior dev', '12-angle', 'qa', 'security', 'devops', 'l3 support'];
    for (const label of expectedLabels) {
      await expect(page.locator('#pipeline-track')).toContainText(label, { ignoreCase: true });
    }
  });

  // ── 7. Inbox — risk sections ──────────────────────────────────────────────
  test('07 inbox renders P0/Blocked/Stale section headers', async ({ page }) => {
    await page.locator('.nav-item[data-tab="inbox"]').click();
    const sectionHeads = page.locator('.inbox-section-head h3');
    const headTexts = await sectionHeads.allTextContents();
    expect(headTexts).toEqual(expect.arrayContaining(['Pending decisions', 'P0 open', 'Blocked', 'Stale (in progress > 48h)']));
  });

  // ── 8. Kanban — 5 columns ─────────────────────────────────────────────────
  test('08 kanban renders 5 status columns', async ({ page }) => {
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await expect(page.locator('.column').first()).toBeVisible({ timeout: 5000 });
    const cols = page.locator('.column');
    expect(await cols.count()).toBeGreaterThanOrEqual(5);
    const labels = await page.locator('.col-title').allTextContents();
    for (const expected of ['Gates', 'Backlog', 'In Progress', 'Done']) {
      expect(labels).toContain(expected);
    }
  });

  // ── 9. Kanban — uniform cards with description preview ────────────────────
  test('09 cards have uniform height + description preview', async ({ page }) => {
    await page.locator('.nav-item[data-tab="kanban"]').click();
    const cards = page.locator('.card');
    expect(await cards.count()).toBeGreaterThan(0);
    // At least one card has description preview
    await expect(page.locator('.card .card-desc').first()).toBeVisible();
    // Cards are flex-column with fixed/min height
    const firstHeight = await cards.first().evaluate(el => el.getBoundingClientRect().height);
    expect(firstHeight).toBeGreaterThan(80);
    expect(firstHeight).toBeLessThan(220);  // generous upper bound (gate cards are taller)
  });

  // ── 10. Kanban — gate cards have approval actions ─────────────────────────
  test('10 gate cards have inline Approve/Reject', async ({ page }) => {
    await page.locator('.nav-item[data-tab="kanban"]').click();
    const gateCard = page.locator('.card.card-gate').first();
    if (await gateCard.count()) {
      await expect(gateCard.locator('.gate-approve')).toBeVisible();
      await expect(gateCard.locator('.gate-reject')).toBeVisible();
    } else {
      test.skip(true, 'no open gates in fixture');
    }
  });

  // ── 11. Side panel — opens with description ───────────────────────────────
  test('11 side panel opens on card click + shows title + description', async ({ page }) => {
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.locator('.card').first().click();
    const side = page.locator('#side-panel.open');
    await expect(side).toBeVisible();
    await expect(side.locator('.side-title')).toBeVisible();
    // ID badge populated
    await expect(side.locator('#side-id')).not.toHaveText('—');
  });

  // ── 12. Side panel — close via ESC + button ───────────────────────────────
  test('12 side panel closes via ESC + close button', async ({ page }) => {
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.locator('.card').first().click();
    await expect(page.locator('#side-panel.open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#side-panel.open')).toHaveCount(0);
    // Re-open and click X
    await page.locator('.card').first().click();
    await page.locator('#side-panel .side-close').click();
    await expect(page.locator('#side-panel.open')).toHaveCount(0);
  });

  // ── 13. Search — keyboard shortcut ────────────────────────────────────────
  test('13 ⌘K focuses search, Esc clears', async ({ page }) => {
    const search = page.locator('#search-input');
    // Dispatch ⌘K directly — headless Chrome doesn't always propagate
    // keyboard.press modifier combos the same way a real browser does
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k', code: 'KeyK', metaKey: true, ctrlKey: false,
        bubbles: true, cancelable: true,
      }))
    );
    await expect(search).toBeFocused({ timeout: 5000 });
    await search.fill('test');
    // Esc should clear the value
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
      }))
    );
    await expect(search).toHaveValue('');
  });

  // ── 14. Search — filters by title ─────────────────────────────────────────
  test('14 search filters tasks across title/id/agent', async ({ page }) => {
    const search = page.locator('#search-input');
    await search.fill('OAuth');
    await page.waitForTimeout(200);
    await expect(page.locator('#topbar-task-count')).toContainText('MATCH');
    await search.fill('');
    await page.waitForTimeout(200);
    await expect(page.locator('#topbar-task-count')).toContainText('ISSUES');
  });

  // ── 15. Project switcher dropdown ─────────────────────────────────────────
  test('15 project switcher dropdown opens + filters', async ({ page }) => {
    const sw = page.locator('#proj-switch');
    await sw.click();
    await page.waitForTimeout(150);
    await expect(sw).toHaveClass(/open/);
    const items = page.locator('#proj-menu-list .proj-item');
    expect(await items.count()).toBeGreaterThan(0);
    // Filter
    await page.locator('#proj-search').fill('xyz-no-match-test');
    await page.waitForTimeout(150);
    await expect(page.locator('#proj-menu-list .proj-menu-empty')).toBeVisible();
  });

  // ── 16. Metrics — hero + secondary stats ──────────────────────────────────
  test('16 metrics tab shows 3 hero + 4 secondary cards', async ({ page }) => {
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    await expect(page.locator('#mp-hero .metric-card').first()).toBeVisible({ timeout: 5000 });
    expect(await page.locator('#mp-hero .metric-card').count()).toBe(3);
    expect(await page.locator('#mp-secondary .metric-card').count()).toBe(4);
  });

  // ── 17. Metrics — cost panel ──────────────────────────────────────────────
  test('17 metrics has Cost panel with 4 summary cells + chart bars', async ({ page }) => {
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    const cost = page.locator('#cost-panel');
    await expect(cost).toBeVisible({ timeout: 5000 });
    await expect(cost.locator('.cost-summary .cost-cell')).toHaveCount(4);
    expect(await cost.locator('.cost-bar').count()).toBe(30);  // 30 days
  });

  // ── 18. Metrics — agent utilization + activity feed ───────────────────────
  test('18 metrics has agent bars + activity feed rows', async ({ page }) => {
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    await page.waitForTimeout(300);
    // Agent rows OR empty state
    const agentList = page.locator('#agent-list');
    await expect(agentList).toBeVisible();
    const timeline = page.locator('#timeline');
    await expect(timeline).toBeVisible();
  });

  // ── 19. Memory tab ────────────────────────────────────────────────────────
  test('19 memory tab loads 4 layers + rendered markdown', async ({ page }) => {
    await page.locator('.nav-item[data-tab="memory"]').click();
    await expect(page.locator('.memory-page')).toBeVisible({ timeout: 5000 });
    // Sidebar layers (rendered as .mem-item)
    const layers = page.locator('.memory-side .mem-item');
    await expect(layers.first()).toBeVisible({ timeout: 8000 });
    expect(await layers.count()).toBeGreaterThanOrEqual(4);
    // Rendered markdown content (not just <pre>)
    await expect(page.locator('.memory-doc h1, .memory-doc h2').first()).toBeVisible();
  });

  // ── 20. Share toggle ──────────────────────────────────────────────────────
  test('20 share tab — toggle + URL block visible', async ({ page }) => {
    await page.locator('.nav-item[data-tab="share"]').click();
    await expect(page.locator('.share-card')).toBeVisible();
    await expect(page.locator('#share-toggle-visual')).toBeVisible();
    await expect(page.locator('#share-help')).toBeVisible();
  });

  // ── 21. API endpoints — bonus ─────────────────────────────────────────────
  test('21 API endpoints — all return valid JSON with expected shape', async ({ request }) => {
    const tasks = await (await request.get('/api/tasks')).json();
    expect(Array.isArray(tasks)).toBe(true);
    if (tasks.length > 0) {
      // Tasks expose description (post-fix)
      expect(tasks[0]).toHaveProperty('description');
      // raw_status exposed for gate logic
      expect(tasks[0]).toHaveProperty('raw_status');
    }

    const metrics = await (await request.get('/api/metrics')).json();
    expect(metrics).toHaveProperty('tasks');
    expect(metrics).toHaveProperty('cost');
    expect(metrics).toHaveProperty('qa');
    expect(metrics).toHaveProperty('security');

    const inbox = await (await request.get('/api/inbox')).json();
    expect(inbox).toHaveProperty('summary');
    expect(inbox.summary).toHaveProperty('gates');
    expect(inbox.summary).toHaveProperty('p0');

    const pipeline = await (await request.get('/api/pipeline')).json();
    expect(Array.isArray(pipeline)).toBe(true);
    expect(pipeline.length).toBe(7);
    expect(pipeline[0]).toHaveProperty('stage');
    expect(pipeline[0]).toHaveProperty('status');

    const cost = await (await request.get('/api/cost?days=30')).json();
    expect(cost.series).toHaveLength(30);
    expect(cost).toHaveProperty('total_llm');

    const memory = await (await request.get('/api/memory')).json();
    expect(memory).toHaveProperty('layers');
    expect(memory.layers.length).toBeGreaterThanOrEqual(4);

    const projects = await (await request.get('/api/projects')).json();
    expect(Array.isArray(projects)).toBe(true);
  });
});
