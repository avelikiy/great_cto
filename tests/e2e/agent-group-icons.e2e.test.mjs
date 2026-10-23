import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { classifyAgentGroup } from '../../scripts/lib/agent-groups.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';

test('role symbols cover the roster, drawer, themes and mobile; failed asset keeps readable names', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-role-icons-'));
  buildFixture(dir);
  const home = path.join(dir, '.home'), agents = path.join(home, 'agents');
  fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
  fs.mkdirSync(agents);
  const registry = path.join(home, '.great_cto/projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, name: FIXTURE_NAME, path: dir }] }));
  const slugs = fs.readdirSync('agents').filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  for (const slug of slugs) fs.copyFileSync(path.resolve('agents', slug + '.md'), path.join(agents, `great_cto-${slug}.md`));
  let server, browser;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: dir, portEnv: 'PORT', env: {
      HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
      GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_AGENTS_DIR: agents, GREAT_CTO_NO_BOARD: '1',
    } });
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    const url = `http://127.0.0.1:${server.port}/?project=${encodeURIComponent(FIXTURE_NAME)}#/fleet`;
    await page.goto(url);
    await page.locator('.agent-row').first().waitFor();
    await page.locator('#nav-view-all').click();
    await page.waitForFunction(n => document.querySelectorAll('.agent-row').length === n, slugs.length);
    assert.equal(slugs.length, 72);
    for (const slug of slugs) {
      const row = page.locator(`.agent-row[data-slug="${slug}"]`);
      assert.equal(await row.locator('.grp-icon').getAttribute('data-agent-group'), classifyAgentGroup(slug), slug);
      await row.locator('.ar-status').waitFor({ state: 'attached' });
    }
    const architect = page.locator('.agent-row[data-slug="architect"]');
    await architect.focus(); await page.keyboard.press('Enter');
    await page.locator('#agent-drawer[open]').waitFor();
    await page.waitForFunction(() => document.querySelector('#agent-drawer-title .grp-icon'));
    assert.equal(await page.locator('#agent-drawer-title .grp-icon').getAttribute('data-agent-group'), 'arch');
    await page.keyboard.press('Escape');
    await page.locator('#agent-drawer[open]').waitFor({ state: 'hidden' });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const box = await architect.locator('.grp-icon').boundingBox();
        assert.equal(box.width, 14); assert.equal(box.height, 14);
        assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `${theme}/${width}`);
        if (process.env.GCTO_ICON_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.GCTO_ICON_SCREENSHOTS, `admin-${theme}-${width}.png`) });
      }
    }
    assert.equal(requests.filter(u => new URL(u).pathname === '/assets/agent-groups.js').length, 1);
    assert.deepEqual(errors, []);
    const fallback = await browser.newPage();
    fallback.on('pageerror', e => errors.push(e.message));
    await fallback.route('**/assets/agent-groups.js', r => r.abort());
    await fallback.goto(url);
    await fallback.locator('.agent-row').first().waitFor();
    await fallback.locator('#nav-view-all').click();
    await fallback.waitForFunction(n => document.querySelectorAll('.agent-row').length === n, slugs.length);
    assert.match(await fallback.locator('.agent-row[data-slug="architect"]').innerText(), /architect/);
    assert.equal(await fallback.locator('.grp-icon').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, dir); else fs.rmSync(dir, { recursive: true, force: true });
  }
});
