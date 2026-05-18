import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the §4 browser tests.
 *
 * `BOARD_URL` defaults to localhost:3141 (the standard board port).
 * Set `BOARD_URL=...` env var to point at a different instance.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,            // session state is shared — keep serial
  workers: 1,                      // localStorage races at workers > 1
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: '/tmp/playwright-report', open: 'never' }], ['list']]
    : [['list'], ['html', { outputFolder: '/tmp/playwright-report', open: 'never' }]],
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.BOARD_URL || 'http://localhost:3141',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
