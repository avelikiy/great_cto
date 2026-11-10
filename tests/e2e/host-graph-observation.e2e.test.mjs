import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { enableNativeGraph, observeNativeGraphHook } from '../../scripts/lib/host-graph-bindings.mjs';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [[file, fs.readFileSync(file, 'utf8')]];
  }).sort(([a], [b]) => a.localeCompare(b));
}

test('native host observations use real read-only project APIs and browser pagination', { timeout: 120000 }, async () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-host-graph-browser-')));
  const root = path.join(tmp, FIXTURE_NAME), home = path.join(tmp, 'home');
  fs.mkdirSync(root); buildFixture(root); commitFixture(root);
  const store = path.join(home, '.great_cto', 'graph-bindings');
  const journalStore = path.join(home, '.great_cto', 'host-graphs');
  const options = { store, journalStore }, sessionId = randomUUID();
  const canary = 'SYNTHETIC-PRIVATE-PAYLOAD-NOT-FOR-PROJECTION';
  // Both hosts deliberately share a session ID. Their journals must remain separate.
  for (const host of ['codex', 'claude-code']) {
    enableNativeGraph({ root, host, sourceVersion: '1.2.3' }, options);
    const ingest = event => {
      const result = observeNativeGraphHook({ root, host, event: { session_id: sessionId, cwd: root, ...event } }, options);
      assert.notEqual(result.state, 'not-enrolled'); assert.notEqual(result.state, 'degraded');
    };
    ingest({ hook_event_name: 'SessionStart' });
    const calls = host === 'codex' ? 100 : 1;
    for (let index = 0; index < calls; index += 1) {
      const call = { tool_use_id: `fixture-call-${index}`, tool_name: 'Read', tool_input: { file_path: canary }, tool_response: canary };
      ingest({ ...call, hook_event_name: 'PreToolUse' });
      ingest({ ...call, hook_event_name: 'PostToolUse' });
    }
  }
  const savedBindings = filesUnder(store), savedJournals = filesUnder(journalStore);
  assert(savedJournals.every(([, content]) => !content.includes(canary)));
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, name: FIXTURE_NAME, path: root }] }));
  let server, browser;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: root, portEnv: 'PORT', env: {
      HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), GREAT_CTO_NO_BOARD: '1',
      GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_GRAPH_BINDINGS_DIR: store, GREAT_CTO_HOST_GRAPHS_DIR: journalStore,
    } });
    const base = `http://127.0.0.1:${server.port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const browserErrors = [], browserWrites = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) browserWrites.push(request.method());
    });
    const response = await page.request.get(`${base}/api/work?project=${FIXTURE_NAME}`);
    assert.equal(response.status(), 200);
    const snapshot = await response.json();
    const native = snapshot.entries.filter(entry => entry.kind === 'native');
    assert.equal(native.length, 2);
    const codex = native.find(entry => entry.host === 'codex'), claude = native.find(entry => entry.host === 'claude-code');
    for (const entry of [codex, claude]) {
      assert.equal(entry.execution.graph.source, 'host-observation');
      assert.equal(entry.execution.graph.complete, false);
      assert.deepEqual(Object.keys(entry.execution.graph.coverage).sort(), ['artifacts', 'gates', 'lifecycle', 'parentChild', 'tools', 'verification']);
      assert(entry.execution.graph.nodes.every(node => node.host === entry.host));
      assert.equal(entry.execution.graph.coverage.gates.supported, false);
      assert.deepEqual(entry.decisions, []);
    }
    assert.equal(codex.execution.graph.total, 201);
    assert.equal(codex.execution.graph.nodes.length, 200);
    assert(codex.execution.graph.cursor);
    assert.equal(claude.execution.graph.total, 3);
    const query = new URLSearchParams({ project: FIXTURE_NAME, host: 'codex', session: sessionId, run: sessionId, cursor: codex.execution.graph.cursor });
    const nextResponse = await page.request.get(`${base}/api/host-graph?${query}`);
    assert.equal(nextResponse.status(), 200);
    const next = await nextResponse.json();
    assert.equal(next.nodes.length, 1); assert.equal(next.total, 201); assert.equal(next.cursor, null);
    assert(!codex.execution.graph.nodes.some(node => node.id === next.nodes[0].id));
    assert(!JSON.stringify(snapshot).includes(canary)); assert(!JSON.stringify(next).includes(canary));
    assert(!JSON.stringify(next).includes('token'));
    assert.equal((await page.request.get(`${base}/api/work?project=unknown-project`)).status(), 404);
    const unknownProject = new URLSearchParams(query); unknownProject.set('project', 'unknown-project');
    assert.equal((await page.request.get(`${base}/api/host-graph?${unknownProject}`)).status(), 404);
    const missingSession = new URLSearchParams({ project: FIXTURE_NAME, host: 'codex', session: randomUUID() });
    assert.equal((await page.request.get(`${base}/api/host-graph?${missingSession}`)).status(), 404);
    const foreignCursor = new URLSearchParams({ project: FIXTURE_NAME, host: 'claude-code', session: sessionId, cursor: codex.execution.graph.cursor });
    assert.equal((await page.request.get(`${base}/api/host-graph?${foreignCursor}`)).status(), 200);
    const foreign = await (await page.request.get(`${base}/api/host-graph?${foreignCursor}`)).json();
    assert.equal(foreign.health, 'degraded'); assert.equal(foreign.nodes.length, 0);
    assert.equal((await page.request.post(`${base}/api/host-graph?${query}`)).status(), 405);
    assert.equal((await page.request.post(`${base}/api/work?project=${FIXTURE_NAME}`)).status(), 405);

    await page.goto(`${base}/?project=${FIXTURE_NAME}#/work`);
    await page.locator(`[data-work-select="${codex.key}"]`).click();
    await page.locator('[data-work-tab="execution"]').click();
    await page.getByRole('heading', { name: 'Host-observed graph', exact: true }).waitFor();
    const graphSection = page.locator('section.execution-graph');
    assert.equal(await graphSection.locator('[data-graph-node]').count(), 200);
    assert.equal(await graphSection.locator('dl[aria-label="Host observation coverage"] dt').count(), 6);
    assert.equal(await page.getByRole('heading', { name: 'Controller-recorded graph', exact: true }).count(), 0);
    const firstIds = await graphSection.locator('[data-graph-node]').evaluateAll(nodes => nodes.map(node => node.dataset.graphNode));
    const pageRequest = page.waitForResponse(r => new URL(r.url()).pathname === '/api/host-graph' && r.request().method() === 'GET');
    await page.getByRole('button', { name: 'Next observation page', exact: true }).click();
    assert.equal((await pageRequest).status(), 200);
    await page.waitForFunction(() => document.querySelectorAll('.execution-graph [data-graph-node]').length === 1);
    assert.equal(await graphSection.locator('[data-graph-node]').getAttribute('data-graph-node'), next.nodes[0].id);
    assert.equal(await graphSection.locator('[data-graph-node]').evaluate(node => node === document.activeElement), true, 'pagination restores keyboard focus inside the new page');
    assert(!firstIds.includes(next.nodes[0].id));
    assert.equal(await page.getByRole('button', { name: 'Next observation page', exact: true }).count(), 0);
    assert.match(await graphSection.innerText(), /Showing 1 of 201 recorded observations/);
    assert.deepEqual(browserErrors, []); assert.deepEqual(browserWrites, []);
    assert.deepEqual(filesUnder(store), savedBindings, 'read-only inspection must not change enrollment');
    assert.deepEqual(filesUnder(journalStore), savedJournals, 'pagination and denied mutations must not change observations');
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  }
});
