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

test('recorded graph uses real project APIs, keyboard details and bounded mobile/theme layout', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-graph-browser-'));
  const root = path.join(tmp, FIXTURE_NAME), home = path.join(tmp, 'home'), plugin = path.join(tmp, 'plugin');
  fs.mkdirSync(root); buildFixture(root); commitFixture(root);
  fs.mkdirSync(path.join(plugin, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(plugin, 'shared/pipeline.toml'), '[transitions.writer]\non=["DONE"]\ngate="gate:code"\nnext=["reviewer"]\n[transitions.reviewer]\non=["PASS"]\ngate="gate:ship"\nnext=[]');
  const state = newRun({ root, pluginRoot: plugin, prompt: 'Browser graph fixture', allowed: ['src', 'docs'], entry: 'writer', hostRoutes: { reviewer: 'claude-code' } });
  const options = verdict => ({ execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'offline fixture', meta: {}, files: [] }) }),
    verify: async () => ({ state: 'verified', findings: [], checks: ['offline fixture, no model calls'] }) });
  await runStage(state, options('DONE')); approve(state, state.pending.token); await runStage(state, options('PASS'));
  fs.mkdirSync(path.join(home, '.great_cto', 'codex-runs'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(home, '.great_cto', 'codex-runs', `${state.id}.json`), JSON.stringify(state));
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, name: FIXTURE_NAME, path: root }] }));
  let server, browser;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: root, portEnv: 'PORT',
      env: { HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), GREAT_CTO_NO_BOARD: '1', GREAT_CTO_PROJECTS_FILE: registry } });
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let finishBootstrap;
    const bootstrap = new Promise(resolve => { finishBootstrap = resolve; });
    // Hold a real bootstrap response, not a fabricated API snapshot. Work can
    // be used before the other initial reads finish; that must not reset tabs.
    await page.route('**/api/metrics*', async route => {
      const response = await route.fetch(); await bootstrap; await route.fulfill({ response });
    });
    const base = `http://127.0.0.1:${server.port}`;
    await page.goto(`${base}/?project=${FIXTURE_NAME}#/work`);
    await page.locator(`[data-work-select="run:${state.id}"]`).click();
    await page.locator('[data-work-tab="execution"]').click();
    await page.locator('.execution-graph svg').waitFor();
    finishBootstrap();
    await page.waitForFunction(slug => currentProject === slug, FIXTURE_NAME);
    await page.locator('#work-tab-execution[aria-selected="true"]').waitFor();
    assert(await page.locator('.execution-graph-canvas').isVisible(), 'late bootstrap preserves the selected graph');
    const api = await (await page.request.get(`${base}/api/work?project=${FIXTURE_NAME}`)).json();
    const graph = api.entries.find(e => e.runId === state.id).execution.graph;
    assert.equal(await page.locator('[data-graph-node]').count(), graph.nodes.length);
    assert.equal(await page.locator('.execution-edges > path').count(), graph.edges.length);
    assert.deepEqual(new Set(graph.nodes.filter(n => n.kind === 'attempt').map(n => n.host)), new Set(['codex', 'claude-code']));
    assert(!JSON.stringify(graph).includes(state.pending.token));
    const url = page.url(), first = page.locator('[data-graph-node]').first();
    await first.focus(); await first.press('Enter');
    assert.equal(await page.locator('[data-graph-detail][open]').count(), 1);
    assert.equal(page.url(), url, 'node inspection does not alter the application route');
    const before = await page.locator('.execution-graph svg').getAttribute('width');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert(Number(await page.locator('.execution-graph svg').getAttribute('width')) > Number(before));
    await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
    assert.equal(await page.locator('.execution-graph svg').getAttribute('width'), before);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${theme}/${width} outer overflow`);
        assert(await page.locator('.execution-graph-canvas').isVisible());
      }
    }
    assert.equal((await page.request.get(`${base}/api/work?project=unknown-project`)).status(), 404);
    assert.equal((await page.request.get(`${base}/api/codex-runs?project=unknown-project`)).status(), 404);
    const runListing = await (await page.request.get(`${base}/api/codex-runs?project=${FIXTURE_NAME}`)).json();
    assert.equal(runListing.runs[0].executionGraph.edges.length, graph.edges.length);
    assert.equal((await page.request.post(`${base}/api/work?project=${FIXTURE_NAME}`)).status(), 405);
    assert.deepEqual(errors, []);
    const saved = fs.readFileSync(path.join(home, '.great_cto', 'codex-runs', `${state.id}.json`), 'utf8');
    assert.equal(saved, JSON.stringify(state), 'graph inspection and zoom do not mutate controller state');
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  }
});
