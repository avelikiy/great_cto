// A board on the screenshot fixture project, opened in Chromium, for browser
// tests that walk every destination (controls-wired, a11y). Returns a skip
// reason instead of throwing when the browser or the board cannot start, so
// the caller reports "not checked" rather than a false pass or a false failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { startServerOnFreePort } from './board-start.mjs';
import { reapAndClean } from './reap.mjs';

export async function openBoard({ prefix = 'gcto-board-page-', viewport = { width: 1440, height: 1000 } } = {}) {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { return { skip: 'playwright is not installed — not checked, not passed' }; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  buildFixture(dir);
  const home = path.join(dir, '.home'); fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, name: FIXTURE_NAME, path: dir }] }));
  let server, browser;
  const close = async () => {
    await browser?.close();
    if (server) await reapAndClean(server.proc, dir); else fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    server = await startServerOnFreePort({
      entry: path.resolve('packages/board/server.mjs'), cwd: dir, portEnv: 'PORT',
      env: { HOME: home, USERPROFILE: home, GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_NO_BOARD: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' },
    });
  } catch (e) { await close(); return { skip: `board did not come up — not checked, not passed: ${e.message}` }; }
  try { browser = await chromium.launch(); } catch (e) {
    await close(); return { skip: `chromium would not launch — not checked, not passed: ${String(e.message).split('\n')[0]}` };
  }

  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  // Requests in flight, except the event stream, which never ends.
  const inflight = new Set();
  page.on('request', (r) => { if (!/\/api\/sse/.test(r.url()) && ['fetch', 'xhr'].includes(r.resourceType())) inflight.add(r); });
  page.on('requestfinished', (r) => inflight.delete(r));
  page.on('requestfailed', (r) => inflight.delete(r));

  /** Wait until nothing but the event stream has been in flight for `quietMs`. */
  const settle = async ({ quietMs = 300, maxMs = 10000 } = {}) => {
    const until = Date.now() + maxMs;
    let quietSince = Date.now();
    while (Date.now() < until) {
      if (inflight.size) quietSince = Date.now();
      else if (Date.now() - quietSince >= quietMs) return;
      await page.waitForTimeout(50);
    }
  };

  await page.goto(`http://127.0.0.1:${server.port}/?project=${encodeURIComponent(FIXTURE_NAME)}`);
  await page.waitForFunction(() => typeof window.switchTab === 'function');
  await settle();
  const destinations = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-tab]')].map((e) => e.getAttribute('data-tab')).filter(Boolean))]);
  const go = async (dest) => {
    await page.evaluate((d) => window.switchTab(d, document.querySelector(`[data-tab="${d}"]`)), dest);
    await settle();
  };
  return { page, errors, settle, destinations, go, close, port: server.port };
}
