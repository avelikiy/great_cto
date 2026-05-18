/**
 * §4 E2E — capture screenshots of each Security sub-tab after seed-threats.py
 * has populated ~/.leash/audit.jsonl with the curated event set.
 *
 * Run sequence:
 *   1. python3 tests/security/seed-threats.py --tenant great-cto
 *   2. bash tests/security/run-section-4-frontend.sh       (API contracts)
 *   3. npx playwright test tests/4e-e2e-screenshots.spec.ts (this file)
 *
 * Outputs:
 *   - tests/security/playwright/screenshots/4e-<sub>.png — one per sub-tab
 *   - inline assertions: KPI numbers reflect the seeded events
 *
 * Triggered by run-e2e-real-project.sh; not part of the default smoke run.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  // Force scope to project of cwd so the seeded events are visible
  await page.goto('/');
  await page.locator('[data-tab="leash"]').click();
  await expect(page.locator('#panel-leash')).toBeVisible();
  // Let the first poll complete so KPIs are populated
  await page.waitForResponse((r) => r.url().includes('/api/security'), { timeout: 10_000 });
  // The board polls every 5s — let a second cycle settle the numbers
  await page.waitForTimeout(800);
});

test('Review sub-tab: KPI strip reflects seeded threats', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="review"]').click();
  // Wait until the HIGH counter contains a number (not "—" or empty)
  await expect(page.locator('#leash-r-high')).toHaveText(/\d+/, { timeout: 10_000 });

  const high = await page.locator('#leash-r-high').innerText();
  const med = await page.locator('#leash-r-medium').innerText();
  const low = await page.locator('#leash-r-low').innerText();
  // Seed gives: HIGH ≥ 3 (secrets+tool_result_scanner+local_llm_guard+exfil_chain),
  //             MED  ≥ 1 (artifact_leakage redact),
  //             LOW  ≥ 2 (behavioral_baseline + enumeration_detector warns)
  expect(Number(high)).toBeGreaterThanOrEqual(3);
  expect(Number(med)).toBeGreaterThanOrEqual(1);
  expect(Number(low)).toBeGreaterThanOrEqual(2);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4e-review.png'), fullPage: true });
});

test('Threats sub-tab: by-rule table has seeded rules', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="threats"]').click();
  await expect(page.locator('#leash-threats-rules')).toBeVisible();

  const html = await page.locator('#leash-threats-rules').innerHTML();
  // We seeded these 7 rule_ids
  for (const rule of [
    'secrets',
    'tool_result_scanner',
    'local_llm_guard',
    'behavioral_baseline',
    'enumeration_detector',
    'artifact_leakage',
    'exfil_chain_detector',
  ]) {
    expect(html, `rule "${rule}" should appear in by-rule table`).toContain(rule);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4e-threats.png'), fullPage: true });
});

test('Agents sub-tab: seeded agents (meta_critic, qa, test_agent) visible', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="agents"]').click();
  await expect(page.locator('#leash-per-agent')).toBeVisible();
  // Wait for the renderer to swap from "Loading" to populated rows
  await page.waitForTimeout(500);
  const html = await page.locator('#leash-per-agent').innerHTML();
  for (const agent of ['meta_critic', 'qa', 'test_agent']) {
    expect(html, `agent "${agent}" should appear in per-agent table`).toContain(agent);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4e-agents.png'), fullPage: true });
});

test('Sessions sub-tab: screenshot only', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="sessions"]').click();
  await expect(page.locator('#leash-sub-sessions')).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4e-sessions.png'), fullPage: true });
});

test('Budgets sub-tab: per-tenant block renders', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="budgets"]').click();
  await expect(page.locator('#leash-sub-budgets')).toBeVisible();
  // The per-tenant caps table is loaded on subtab open; wait briefly
  await expect(page.locator('#leash-tenant-caps-table')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4e-budgets.png'), fullPage: true });
});

test('Export sub-tab: screenshot only', async ({ page }) => {
  await page.locator('button.leash-subtab[data-subtab="export"]').click();
  await expect(page.locator('#leash-sub-export')).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4e-export.png'), fullPage: true });
});
