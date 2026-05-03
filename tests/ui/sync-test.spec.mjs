// SSE sync test — verifies pipeline → UI live updates
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

const PRJ_CWD = '/Users/avelikiy/development/gcto-pipeline-test';
const PRJ_SLUG = 'gcto-pipeline-test';
const BOARD_URL = 'http://localhost:3141';

function bd(args, opts = {}) {
  const r = spawnSync('bd', args, { cwd: PRJ_CWD, encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`bd ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return (r.stdout || '') + (r.stderr || '');
}

async function gotoProject(page) {
  await page.goto(`${BOARD_URL}?project=${PRJ_SLUG}`);
  // Wait for init() to complete by waiting for project-name to be set
  await page.waitForFunction(
    (slug) => document.getElementById('project-name')?.textContent?.includes(slug),
    PRJ_SLUG,
    { timeout: 10000, polling: 200 }
  );
}

test.describe('UI ↔ Pipeline sync', () => {
  test('01 board loads and switches to test project', async ({ page }) => {
    await gotoProject(page);
    const projName = await page.locator('#project-name').textContent();
    expect(projName).toContain(PRJ_SLUG);
  });

  test('02 inbox shows pending gates from beads', async ({ page }) => {
    await gotoProject(page);
    // inbox is the default landing tab
    await page.waitForTimeout(500);
    const inboxText = await page.locator('#panel-inbox').textContent();
    expect(inboxText).toMatch(/gate.*ship.*auth/i);
  });

  test('03 kanban renders 5 status columns with tasks', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForSelector('#kanban-board .column', { timeout: 5000 });
    const cols = await page.locator('#kanban-board .column').count();
    expect(cols).toBe(5);
    // Should have at least one done card
    const doneCards = await page.locator('#kanban-board .col-done .card').count();
    expect(doneCards).toBeGreaterThan(0);
  });

  test('04 SSE: creating new task in beads appears in UI', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForSelector('#kanban-board .column', { timeout: 5000 });

    const title = `SSE-create-${Date.now()}`;
    const out = bd(['create', title, '-d', 'sync test task']);
    const id = out.match(/(gcto-pipeline-test-\w+)/)?.[1];
    expect(id).toBeTruthy();

    // Wait for SSE/cache TTL (2s) + UI render
    const start = Date.now();
    await page.waitForFunction(
      (t) => {
        const cards = document.querySelectorAll('#kanban-board .card');
        return Array.from(cards).some(c => c.textContent.includes(t));
      },
      title,
      { timeout: 10000, polling: 300 }
    );
    const elapsed = Date.now() - start;
    console.log(`  └─ task appeared in UI after ${elapsed}ms`);

    // Cleanup
    bd(['close', id], { allowFail: true });
  });

  test('05 SSE: closing task moves it to done column', async ({ page }) => {
    const title = `SSE-close-${Date.now()}`;
    const out = bd(['create', title]);
    const id = out.match(/(gcto-pipeline-test-\w+)/)?.[1];
    expect(id).toBeTruthy();

    await gotoProject(page);
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForSelector('#kanban-board .column', { timeout: 5000 });

    // Wait for task to appear in backlog
    await page.waitForFunction(
      (t) => {
        const cards = document.querySelectorAll('#kanban-board .col-backlog .card');
        return Array.from(cards).some(c => c.textContent.includes(t));
      },
      title,
      { timeout: 8000, polling: 300 }
    );

    bd(['close', id]);
    const start = Date.now();

    await page.waitForFunction(
      (t) => {
        const cards = document.querySelectorAll('#kanban-board .col-done .card');
        return Array.from(cards).some(c => c.textContent.includes(t));
      },
      title,
      { timeout: 10000, polling: 300 }
    );
    console.log(`  └─ task moved to done after ${Date.now() - start}ms`);
  });

  test('06 gate approve via UI → bd update → inbox refresh', async ({ page }) => {
    const title = `gate: SSE-approve-${Date.now()}`;
    const out = bd(['create', title]);
    const id = out.match(/(gcto-pipeline-test-\w+)/)?.[1];
    bd(['update', id, '--add-label', 'gate']);

    await gotoProject(page);
    // wait for our gate to appear in inbox
    await page.waitForFunction(
      (id) => document.querySelector('#panel-inbox')?.textContent?.includes(id),
      id,
      { timeout: 8000, polling: 500 }
    );

    // Click any approve button on inbox; we'll then check our gate left
    const approveButtons = page.locator('#panel-inbox button:has-text("Approve")');
    const count = await approveButtons.count();
    expect(count).toBeGreaterThan(0);

    // Find and click the approve button next to our gate id
    const gateRow = page.locator('#panel-inbox').locator(`text=${id}`).first();
    const approve = gateRow.locator('xpath=ancestor::*[1]').locator('button:has-text("Approve")').first();

    // Fallback: find approve button in same row
    let clicked = false;
    if (await approve.count() > 0) {
      await approve.click();
      clicked = true;
    } else {
      // Try a more robust approach: find the row containing our id, then click its approve
      const rows = await page.locator('#panel-inbox .inbox-card, #panel-inbox .gate-card, #panel-inbox [class*="gate"]').all();
      for (const row of rows) {
        const text = await row.textContent();
        if (text.includes(id)) {
          const btn = row.locator('button:has-text("Approve")').first();
          if (await btn.count() > 0) {
            await btn.click();
            clicked = true;
            break;
          }
        }
      }
    }
    expect(clicked).toBe(true);

    const start = Date.now();
    await page.waitForFunction(
      (id) => !document.querySelector('#panel-inbox')?.textContent?.includes(id),
      id,
      { timeout: 8000, polling: 300 }
    );
    console.log(`  └─ gate approved + removed in ${Date.now() - start}ms`);
  });

  test('07 metrics tab shows hero + cost panel', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="dashboard"]').click();
    await page.waitForSelector('#panel-dashboard.active', { timeout: 5000 });
    await expect(page.locator('#mp-hero')).toBeVisible();
    await expect(page.locator('#cost-panel')).toBeVisible();
  });

  test('08 agents tab is separate from metrics', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="agents"]').click();
    await page.waitForSelector('#panel-agents.active', { timeout: 5000 });
    await expect(page.locator('#panel-agents #agent-cost-panel')).toBeVisible();
    await expect(page.locator('#panel-agents #agent-list')).toBeVisible();
    await expect(page.locator('#panel-agents #timeline')).toBeVisible();
  });

  test('09 no ✱ asterisks in agents view', async ({ page }) => {
    await gotoProject(page);
    await page.locator('.nav-item[data-tab="agents"]').click();
    await page.waitForSelector('#panel-agents.active', { timeout: 5000 });
    const html = await page.locator('#panel-agents').innerHTML();
    expect(html).not.toContain('✱');
  });

  test('11 New issue button opens modal and creates task', async ({ page }) => {
    await gotoProject(page);
    await page.locator('button.btn-new').click();
    await expect(page.locator('#new-issue-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#ni-input-title')).toBeFocused();

    const title = `UI-modal-test-${Date.now()}`;
    await page.locator('#ni-input-title').fill(title);
    await page.locator('#ni-input-desc').fill('Created via modal');
    await page.locator('#ni-input-priority').selectOption('1');
    await page.locator('#ni-input-agent').selectOption('senior-dev');

    const start = Date.now();
    await page.locator('#ni-submit').click();

    // Modal closes
    await expect(page.locator('#new-issue-modal')).toHaveCount(0, { timeout: 5000 });

    // Task should appear in kanban via SSE
    await page.locator('.nav-item[data-tab="kanban"]').click();
    await page.waitForFunction(
      (t) => Array.from(document.querySelectorAll('#kanban-board .card')).some(c => c.textContent.includes(t)),
      title,
      { timeout: 8000, polling: 300 }
    );
    console.log(`  └─ task created via modal + visible in UI in ${Date.now() - start}ms`);
  });

  test('12 New issue modal closes on Esc', async ({ page }) => {
    await gotoProject(page);
    await page.locator('button.btn-new').click();
    await expect(page.locator('#new-issue-modal')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#new-issue-modal')).toHaveCount(0, { timeout: 2000 });
  });

  test('13 New issue modal: gate checkbox auto-prefixes title', async ({ page }) => {
    await gotoProject(page);
    await page.locator('button.btn-new').click();
    await expect(page.locator('#new-issue-modal')).toBeVisible({ timeout: 3000 });

    const baseTitle = `Modal-gate-${Date.now()}`;
    await page.locator('#ni-input-title').fill(baseTitle);
    await page.locator('#ni-input-gate').check();
    await page.locator('#ni-submit').click();

    await expect(page.locator('#new-issue-modal')).toHaveCount(0, { timeout: 5000 });

    // Should appear as a gate in inbox
    await page.waitForFunction(
      (t) => document.querySelector('#panel-inbox')?.textContent?.includes('gate: ' + t),
      baseTitle,
      { timeout: 8000, polling: 300 }
    );
  });

  test('10 project switcher persists selection across reload', async ({ page }) => {
    await gotoProject(page);
    const before = await page.locator('#project-name').textContent();
    await page.reload();
    await page.waitForFunction(
      (slug) => document.getElementById('project-name')?.textContent?.includes(slug),
      PRJ_SLUG,
      { timeout: 10000, polling: 200 }
    );
    const after = await page.locator('#project-name').textContent();
    expect(after).toBe(before);
  });
});
