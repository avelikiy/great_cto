import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { newRun, runStage, approve } from '../../scripts/lib/codex-pipeline.mjs';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';

// Acceptance paths use real read APIs and an offline controller. Browser view
// transitions cannot turn the fixture's observations into an approval action.
test('canvas workspace preserves route history, project identity, evidence and usable graph area', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-canvas-browser-'));
  const root = path.join(tmp, FIXTURE_NAME), otherSlug = 'acme-secondary', other = path.join(tmp, otherSlug);
  const home = path.join(tmp, 'home'), plugin = path.join(tmp, 'plugin');
  for (const dir of [root, other]) { fs.mkdirSync(dir); buildFixture(dir); }
  const tasks = path.join(other, '.great_cto', 'tasks.md');
  fs.writeFileSync(tasks, fs.readFileSync(tasks, 'utf8').replace('Cart totals disagree with the invoice on partial refund', 'Secondary workspace sentinel'));
  commitFixture(root); commitFixture(other);
  fs.mkdirSync(path.join(plugin, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(plugin, 'shared', 'pipeline.toml'), '[transitions.writer]\non=["DONE"]\ngate="gate:code"\nnext=["reviewer"]\n[transitions.reviewer]\non=["PASS"]\ngate="gate:ship"\nnext=[]');
  const state = newRun({ root, pluginRoot: plugin, prompt: 'Canvas browser fixture', allowed: ['src', 'docs'], entry: 'writer', hostRoutes: { reviewer: 'claude-code' } });
  const options = verdict => ({ execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'offline fixture', meta: {}, files: [] }) }), verify: async () => ({ state: 'verified', findings: [], checks: ['offline fixture, no model calls'] }) });
  await runStage(state, options('DONE')); approve(state, state.pending.token); await runStage(state, options('PASS'));
  const runs = path.join(home, '.great_cto', 'codex-runs'); fs.mkdirSync(runs, { recursive: true, mode: 0o700 });
  const runFile = path.join(runs, state.id + '.json'), savedState = JSON.stringify(state);
  fs.writeFileSync(runFile, savedState);
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, name: FIXTURE_NAME, path: root }, { slug: otherSlug, name: otherSlug, path: other }] }));
  let server, browser;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: root, portEnv: 'PORT', env: { HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_NO_BOARD: '1' } });
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.port}`, key = 'run:' + state.id;
    let releaseScopedRead, captureScopedRead;
    const scopedReadHeld = new Promise(resolve => { releaseScopedRead = resolve; });
    const scopedReadCaptured = new Promise(resolve => { captureScopedRead = resolve; });
    const initialScopedWork = url => url.pathname === '/api/work' && url.searchParams.get('project') === FIXTURE_NAME;
    await page.route(initialScopedWork, async route => {
      const response = await route.fetch(); captureScopedRead();
      await scopedReadHeld; await route.fulfill({ response });
    });
    await page.goto(`${base}/#/work`);
    await scopedReadCaptured;
    await page.waitForFunction(slug => new URLSearchParams(location.search).get('project') === slug && currentProject === slug, FIXTURE_NAME);
    assert.equal(await page.locator('#work-list [data-work-select]').count(), 0, 'default-scope rows are cleared while the explicit project read is pending');
    assert.match(await page.locator('#work-list').innerText(), /Loading/);
    releaseScopedRead();
    await page.unrouteAll({ behavior: 'wait' });
    await page.locator(`[data-work-select="${key}"]`).waitFor();
    await page.waitForFunction(slug => new URLSearchParams(location.search).get('project') === slug && currentProject === slug, FIXTURE_NAME);
    assert.equal(await page.locator('#project-name').innerText(), FIXTURE_NAME, 'registered default scope is made explicit before navigation history is created');
    assert.equal(await page.locator('.work-detail-only').count(), 0, 'Work is a list, not an automatic task selection');
    const source = await (await page.request.get(`${base}/api/work?project=${FIXTURE_NAME}`)).json();
    const graph = source.entries.find(entry => entry.key === key).execution.graph;
    const issue = source.entries.find(entry => entry.kind === 'issue' && entry.title.includes('Cart totals disagree'));
    assert(issue, 'fixture includes a task key shared by both projects');

    await page.getByRole('button', { name: /^Needs attention / }).click();
    await page.locator('#search-input').fill(state.id);
    try { await page.locator(`[data-work-select="${key}"]`).click(); }
    catch (error) { console.error('Canvas navigation diagnostic:', await page.evaluate(() => ({url:location.href,activePanels:[...document.querySelectorAll('.panel.active')].map(p=>p.id),workPanel:document.getElementById('panel-work')?.outerHTML.slice(0,1200),current:typeof currentTab==='string'?currentTab:null}))); throw error; }
    await page.locator('#work-tab-execution').click();
    await page.locator('.execution-graph svg').waitFor();
    assert.match(page.url(), /work\/task\/run%3A[^/]+\/execution/);
    assert.equal(await page.locator('#panel-work .work-task-list').count(), 0, 'detail has no persistent task list');
    assert.equal(await page.locator('[data-graph-node]').count(), graph.nodes.length);
    assert.equal(await page.locator('.execution-edges > path').count(), graph.edges.length);
    assert.equal(await page.locator('#work-detail-panel [data-work-action]').count(), 0, 'Execution has no publication or approval controls');
    const canvas = await page.locator('.execution-graph-canvas').boundingBox(), rail = await page.locator('#sidebar').boundingBox();
    assert(rail.width <= 65, `compact navigation uses ${rail.width}px`);
    assert(canvas.width >= 1200, `1440px viewport leaves ${canvas.width}px for graph`);
    console.log('Canvas geometry:', JSON.stringify({ viewport: 1440, canvasWidth: canvas.width, navigationWidth: rail.width }));
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
    assert((await page.locator('#sidebar').boundingBox()).width > rail.width, 'navigation expansion reveals labels');
    await page.getByRole('button', { name: 'Compact navigation', exact: true }).click();
    assert.equal((await page.locator('#sidebar').boundingBox()).width, rail.width);
    await page.goBack(); await page.locator('#work-tab-overview[aria-selected="true"]').waitFor();
    await page.goForward(); await page.locator('#work-tab-execution[aria-selected="true"]').waitFor();
    await page.getByRole('button', { name: '← Work', exact: true }).click();
    await page.locator('.work-list-only').waitFor();
    assert.equal(await page.locator('#search-input').inputValue(), state.id, 'return restores the list query');
    assert.equal(await page.locator('[data-work-filter="attention"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-work-select]').count(), 1, 'return preserves the filtered cohort');
    await page.locator('#search-input').fill('');
    await page.getByRole('button', { name: /^All active / }).click();
    await page.setViewportSize({ width: 1440, height: 560 });
    const lastTask = page.locator('.work-list-only [data-work-select]').last();
    await lastTask.scrollIntoViewIfNeeded();
    const listScroll = await page.locator('#panel-work').evaluate(panel => panel.scrollTop);
    assert(listScroll > 0, 'short viewport produces a genuinely scrolled work list');
    await lastTask.click();
    await page.getByRole('button', { name: '← Work', exact: true }).click();
    assert(Math.abs((await page.locator('#panel-work').evaluate(panel => panel.scrollTop)) - listScroll) <= 1, 'return restores list scroll instead of jumping to the top');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(`[data-work-select="${key}"]`).click(); await page.locator('#work-tab-execution').click();

    const switcher = page.getByRole('button', { name: 'Switch task', exact: true });
    await switcher.click(); await page.locator('.work-switcher[open]').waitFor();
    await page.locator('[data-switch-search]').fill('does-not-match-any-task');
    assert.equal(await page.locator('.work-switcher [data-work-select]:visible').count(), 0);
    assert(await page.locator('[data-switch-empty]').isVisible());
    await page.keyboard.press('Escape'); await page.locator('.work-switcher').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-work-switch')), '', 'Escape returns focus to task switcher');
    const first = page.locator('[data-graph-node]').first(), firstId = await first.getAttribute('data-graph-node'), url = page.url();
    await first.focus(); await first.press('Enter'); await page.locator('.work-node-inspector[open]').waitFor();
    assert.equal(await page.locator('.work-node-inspector [data-graph-detail][open]').getAttribute('data-graph-detail'), firstId);
    assert.equal(page.url(), url, 'node inspection does not create a route transition');
    assert.equal(await page.locator('.work-node-inspector [data-work-action]').count(), 0);
    await page.keyboard.press('Escape'); await page.locator('.work-node-inspector').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-graph-node')), firstId, 'Escape restores selected graph-node focus');

    await first.focus(); await first.press('Enter');
    await page.locator('.work-node-inspector[open]').waitFor();
    await page.locator('#nav-tablist [data-tab="knowledge"]').click();
    await page.locator('#panel-knowledge').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.work-node-inspector').count(), 0, 'leaving Work removes the body-mounted node inspector');
    await page.locator('#nav-tablist [data-tab="work"]').click();
    await page.locator('.work-list-only').waitFor();
    await page.locator(`[data-work-select="${key}"]`).click();
    await page.locator('#work-tab-execution').click();
    await first.focus(); await first.press('Enter');
    await page.locator('.work-node-inspector[open]').waitFor();
    const projectTasks = path.join(root, '.great_cto', 'tasks.md'), beforeTasks = fs.readFileSync(projectTasks, 'utf8');
    const changedTitle = 'Refreshed task sentinel';
    fs.writeFileSync(projectTasks, beforeTasks.replace(issue.title, changedTitle));
    await page.evaluate(() => window.GctoWork.refresh());
    assert.equal(await page.evaluate(key => window.GctoWork.getSnapshot().entries.find(entry => entry.key === key)?.title, issue.key), changedTitle, 'an open inspector receives a newer project snapshot');
    await page.keyboard.press('Escape');
    await page.locator('.work-node-inspector').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-graph-node')), firstId, 'Escape after a pending repaint restores focus to the replacement graph node');
    await page.getByRole('button', { name: 'Switch task', exact: true }).click();
    assert(await page.locator('.work-switcher').innerText().then(text => text.includes(changedTitle)), 'the pending snapshot is rendered, not discarded when inspector closes');
    await page.keyboard.press('Escape');
    fs.writeFileSync(projectTasks, beforeTasks);
    await page.evaluate(() => window.GctoWork.refresh());

    for (const width of [375, 768, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${width}px viewport has no outer horizontal overflow`);
      assert(await page.locator('.execution-graph-canvas').isVisible());
    }
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.locator('#menu-btn').click();
    assert.equal(await page.locator('#sidebar.open').count(), 1, 'mobile navigation drawer opens over Execution');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'opened drawer locks background scrolling');
    await page.locator('#nav-tablist [data-tab="work"]').click();
    assert.equal(await page.locator('#sidebar.open').count(), 0, 'choosing Work closes the drawer even when Work is already the active panel');
    assert.equal(await page.locator('#sidebar-scrim.open').count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'choosing Work unlocks background scrolling');
    assert(await page.locator('.work-list-only').isVisible());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(`[data-work-select="${key}"]`).click(); await page.locator('#work-tab-execution').click();

    await switcher.click(); await page.locator('[data-switch-search]').fill(issue.title);
    await page.locator('.work-switcher').locator(`[data-work-select="${issue.key}"]`).click();
    await page.locator('#work-tab-execution').click();
    assert.equal(await page.locator('.execution-graph svg').count(), 0, 'native issue without recorded dependencies is not drawn as a causal graph');
    assert.match(await page.locator('#work-detail-panel').innerText(), /Dependencies not recorded|graph unavailable|No linked controller-recorded graph/);
    fs.writeFileSync(path.join(runs, '00000000-0000-4000-8000-000000000000.json'), '{');
    await page.evaluate(() => window.GctoWork.refresh());
    assert.match(await page.locator('#work-list').innerText(), /project membership is unknown|Sources incomplete/);
    fs.rmSync(path.join(runs, '00000000-0000-4000-8000-000000000000.json'));

    // switchProject replaces the current entry. Older task entries still carry
    // the original project query, and browser Back must reload their scope.
    await page.evaluate(slug => switchProject(slug), otherSlug);
    await page.locator('.work-list-only').waitFor();
    await page.locator(`[data-work-select="${issue.key}"]`).click();
    await page.locator('.work-task-header h2').filter({ hasText: 'Secondary workspace sentinel' }).waitFor();
    await page.locator('#work-tab-execution').click();
    await page.goBack(); await page.locator('#work-tab-overview[aria-selected="true"]').waitFor();
    await page.goBack(); await page.locator('.work-list-only').waitFor();
    await page.goBack();
    await page.waitForFunction(slug => currentProject === slug && document.getElementById('project-name')?.textContent === slug, FIXTURE_NAME);
    await page.locator('.work-task-header h2').filter({ hasText: issue.title }).waitFor();
    assert(!await page.locator('#work-list').innerText().then(text => text.includes('Secondary workspace sentinel')), 'the same task key must not reuse another project title');
    await page.goForward();
    await page.waitForFunction(slug => currentProject === slug && document.getElementById('project-name')?.textContent === slug, otherSlug);
    await page.locator('.work-list-only').waitFor();
    // Simulate a legacy history entry created before default-project URLs were
    // canonicalized. Real browser Back must resolve the server default again.
    await page.evaluate(slug => {
      history.pushState({ legacyCanvasFixture: true }, '', '/#/work');
      history.pushState(null, '', '/?project=' + encodeURIComponent(slug) + '#/work');
    }, otherSlug);
    await page.goBack();
    await page.waitForFunction(slug => currentProject === slug && new URLSearchParams(location.search).get('project') === slug && document.getElementById('project-name')?.textContent === slug, FIXTURE_NAME);
    await page.locator(`[data-work-select="${key}"]`).waitFor({ state: 'visible' });
    assert(!await page.locator('#work-list').innerText().then(text => text.includes('Secondary workspace sentinel')), 'legacy unqualified history restores default-project data rather than retaining the last project');
    let holdDefault, defaultCaptured, defaultFulfilled;
    const heldDefault = new Promise(resolve => { holdDefault = resolve; });
    const capturedDefault = new Promise(resolve => { defaultCaptured = resolve; });
    const fulfilledDefault = new Promise(resolve => { defaultFulfilled = resolve; });
    const unqualifiedWork = url => url.pathname === '/api/work' && !url.searchParams.has('project');
    await page.evaluate(() => {
      window.__canvasOriginalAPI = api;
      api = function(url, options) {
        const response = window.__canvasOriginalAPI(url, options);
        if (url === '/api/work') window.__canvasDefaultRead = response;
        return response;
      };
    });
    await page.route(unqualifiedWork, async route => {
      const response = await route.fetch();
      defaultCaptured();
      await heldDefault;
      await route.fulfill({ response });
      defaultFulfilled();
    });
    await page.evaluate(slug => {
      history.pushState({ legacyCanvasRaceFixture: true }, '', '/#/work');
      history.pushState(null, '', '/?project=' + encodeURIComponent(slug) + '#/work');
    }, FIXTURE_NAME);
    await page.goBack();
    await capturedDefault;
    await page.evaluate(slug => switchProject(slug), otherSlug);
    await page.locator(`[data-work-select="${issue.key}"]`).filter({ hasText: 'Secondary workspace sentinel' }).waitFor();
    const defaultFinished = page.waitForEvent('requestfinished', { predicate: request => unqualifiedWork(new URL(request.url())) });
    holdDefault();
    await Promise.all([defaultFinished, fulfilledDefault]);
    assert(await page.evaluate(() => !!window.__canvasDefaultRead), 'the held request belongs to the actual route API read');
    const resolvedDefault = await page.evaluate(async () => { const data = await window.__canvasDefaultRead; await new Promise(resolve => requestAnimationFrame(resolve)); return data?.projectName; });
    assert.equal(resolvedDefault, FIXTURE_NAME, 'the late response carries the original default project');
    assert.equal(new URL(page.url()).searchParams.get('project'), otherSlug, 'late default-scope response must not overwrite an explicit project choice');
    assert.equal(await page.locator('#project-name').innerText(), otherSlug);
    assert(await page.locator(`[data-work-select="${issue.key}"]`).innerText().then(text => text.includes('Secondary workspace sentinel')));
    // Every unqualified read in the window (the 10 s Work poll, an SSE reload)
    // entered this handler too. Removing the last route makes Playwright continue
    // routes still in flight, so a plain unroute() let a slow handler's fulfill()
    // land on an already-continued route. 'wait' drains the handlers first.
    await page.unrouteAll({ behavior: 'wait' });
    await page.evaluate(() => { api = window.__canvasOriginalAPI; delete window.__canvasOriginalAPI; delete window.__canvasDefaultRead; });
    await page.goto(`${base}/?project=${FIXTURE_NAME}#/work/task/run%3Amissing/execution`);
    await page.getByRole('heading', { name: 'Selected task is unavailable', exact: true }).waitFor();
    assert.equal(await page.locator('#work-list [data-selected-work]').count(), 0, 'an unavailable explicit task is never replaced by another project task');
    assert.equal(await page.locator('#work-list .execution-graph svg').count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(fs.readFileSync(runFile, 'utf8'), savedState, 'navigation, graph inspection and zoom leave controller state unchanged');
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  }
});
