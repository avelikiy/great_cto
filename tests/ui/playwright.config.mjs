// Playwright config for great_cto board admin UI
// Run: cd tests/ui && npx playwright test
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.m?js$/,
  fullyParallel: false,           // single shared server
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['line']] : 'list',
  use: {
    baseURL: process.env.BOARD_URL || 'http://localhost:3146',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 20000,
  },
  webServer: {
    // setup-fixture.mjs creates a tmp project + boots board on port 3146
    command: 'node setup-fixture.mjs',
    url: 'http://localhost:3146/api/tasks',
    timeout: 90000,   // bd init + 11 bd commands ≈ 25–30s cold start
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
