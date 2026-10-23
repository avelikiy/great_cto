import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';

test('four advisory focus directions work by keyboard and reflow without execution changes', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-focus-browser-'));
  const root = path.join(tmp, FIXTURE_NAME), home = path.join(tmp, 'home'), agents = path.join(home, '.claude', 'agents');
  fs.mkdirSync(root); buildFixture(root); commitFixture(root);
  fs.mkdirSync(agents, { recursive: true });
  for (const role of ['architect', 'senior-dev', 'game-reviewer']) fs.writeFileSync(path.join(agents, `great_cto-${role}.md`), `---\nname: ${role}\ndescription: Fixture role\n---\n`);
  fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, path: root }] }));
  const projectFile = path.join(root, '.great_cto', 'PROJECT.md'), before = fs.readFileSync(projectFile, 'utf8');
  let server, browser;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: root, portEnv: 'PORT',
      env: { HOME: home, GREAT_CTO_AGENTS_DIR: agents, GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_NO_UPDATE_CHECK: '1' } });
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true }), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.port}/?project=${FIXTURE_NAME}&host=codex#/settings/executors`);
    await page.waitForFunction(slug => currentProject === slug, FIXTURE_NAME);
    await page.waitForFunction(() => fleetState.registryScope === pqs() && !fleetState.registryLoading && fleetState.registry?.directions.length === 4);
    await page.getByRole('group', { name: 'Focus direction', exact: true }).waitFor();
    const controls = page.locator('[data-focus-direction]');
    await page.waitForFunction(() => document.querySelectorAll('[data-focus-direction]').length === 4);
    assert.deepEqual(await controls.allTextContents(), ['Fintech + crypto', 'Telemedicine', 'Venture Pipeline', 'Mental Care']);
    assert.equal(await page.locator('[data-focus-direction][aria-pressed="true"]').count(), 0);
    const finance = page.getByRole('button', { name: 'Fintech + crypto', exact: true });
    await finance.focus(); await finance.press('Enter');
    await page.locator('[data-focus-direction="fintech-crypto"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('#focus-packs details').count(), 2);
    await page.locator('#focus-packs summary').first().click();
    assert.equal(await page.locator('#focus-packs details').first().locator('li').count(), 3);
    const mental = page.getByRole('button', { name: 'Mental Care', exact: true });
    await mental.focus(); await mental.press('Space');
    await page.locator('[data-focus-direction="mental-care"][aria-pressed="true"]').waitFor();
    try { await page.waitForFunction(() => document.querySelector('#focus-proposal-body')?.textContent.includes('Assessment: unavailable')); }
    catch (error) { console.error(await page.locator('#focus-proposal-body').innerText()); console.error(await page.evaluate(() => ({project:fleetState.projectId,focus:fleetState.focusId,failed:fleetState.proposalFailed,invalid:fleetState.proposalInvalid,proposal:fleetState.proposal}))); throw error; }
    assert.match(await page.locator('#focus-proposal-body').innerText(), /Selective omission is not permitted/);
    assert.match(await page.locator('#focus-selection-status').innerText(), /No diagnosis or treatment claim/);
    assert.equal(await page.locator('#focus-proposal-body svg').count(), 0);
    assert.match(await page.locator('#focus-proposal').innerText(), /Advisory\. Does not change execution/);
    const evidenceDetails = page.locator('#focus-evidence-limits');
    assert.equal(await evidenceDetails.count(), 1);
    assert.equal(await evidenceDetails.getAttribute('open'), null);
    await evidenceDetails.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.match(await evidenceDetails.innerText(), /Required gates/);
    await evidenceDetails.locator('summary').press('Enter');
    await page.locator('#nav-view-all').click();
    await page.getByRole('button', { name: 'Mental Care', exact: true }).waitFor();
    assert.match(await page.locator('#fleet-list').innerText(), /game-reviewer/);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      for (const width of [1440, 1024, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${theme}/${width} overflow`);
        if (width <= 375) assert((await controls.first().boundingBox()).height >= 44);
        if (width === 375) assert.equal(Math.round((await page.locator('.focus-inspection').boundingBox()).x), 12);
      }
    }
    await page.locator('.focus-inspection').evaluate(el => { el.style.fontSize = '32px'; });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, '200% focus text reflows');
    await page.locator('.focus-inspection').evaluate(el => { el.style.fontSize = ''; });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.getByRole('button', { name: 'Telemedicine', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-focus-direction="telemedicine"]').getAttribute('aria-pressed'), 'true');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: '/tmp/four-domain-focus-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({ path: '/tmp/four-domain-focus-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    assert.equal(fs.readFileSync(projectFile, 'utf8'), before);
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  }
});
