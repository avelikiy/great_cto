// Every control on every board destination is wired, and no destination logs an error.
//
// 3.27.1 shipped blocked tasks that could be opened and not decided: the endpoint
// existed, the button did not. The opposite failure is just as quiet — a button
// whose onclick names a function that was renamed or deleted renders, looks
// clickable and does nothing; the browser logs a ReferenceError only when someone
// presses it. Static checks over index.html cannot tell a wired button from a
// painted one, so this test opens the real page on a fixture project, visits every
// destination the page knows (`[data-tab]`), and for every visible or hidden control:
//
//   - an inline handler (`onclick="fn(…)"`): every function it calls exists on window;
//   - otherwise: a click/keyboard listener is registered on it or on an ancestor
//     below <body> (read through the DevTools protocol, not guessed), or it submits
//     a form.
//
// Page errors and console errors on any destination fail the test too.
// It SKIPS — loudly, as "not checked" — when Playwright or Chromium is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { /* reported as a skip */ }

const CONTROLS = 'button, [role="button"], [onclick], a[href^="javascript:"]';
const LISTENER_TYPES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'change', 'input', 'submit']);

/** Wait until no fetch/XHR except the event stream is in flight for `quietMs`. */
async function settle(page, inflight, { quietMs = 300, maxMs = 10000 } = {}) {
  const until = Date.now() + maxMs;
  let quietSince = Date.now();
  while (Date.now() < until) {
    if (inflight.size) quietSince = Date.now();
    else if (Date.now() - quietSince >= quietMs) return;
    await page.waitForTimeout(50);
  }
}

/** Mark every element that carries a relevant event listener, via CDP. */
async function markListeners(cdp) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { object } = await cdp.send('DOM.resolveNode', { nodeId: root.nodeId });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.objectId, depth: -1, pierce: true });
  const nodes = new Set(listeners.filter((l) => LISTENER_TYPES.has(l.type) && l.backendNodeId).map((l) => l.backendNodeId));
  for (const backendNodeId of nodes) {
    try {
      const { object: el } = await cdp.send('DOM.resolveNode', { backendNodeId });
      await cdp.send('Runtime.callFunctionOn', {
        objectId: el.objectId,
        functionDeclaration: 'function(){ if (this.setAttribute) this.setAttribute("data-wired-listener", "1"); }',
      });
    } catch { /* node left the document between the two calls */ }
  }
}

/** In the page: every control that is not wired, with why. */
function unwiredInPage(selector) {
  const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'function', 'typeof', 'new', 'catch', 'await', 'void', 'delete', 'in', 'of']);
  const label = (el) => (el.id ? `#${el.id}` : '') + `<${el.tagName.toLowerCase()}> "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)}"`;
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    if (el.disabled || el.closest('[inert]')) continue;
    const inline = el.getAttribute('onclick');
    if (inline) {
      const missing = [];
      for (const m of inline.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = m[2];
        if (KEYWORDS.has(name)) continue;
        if (typeof window[name] !== 'function') missing.push(name);
      }
      if (missing.length) out.push(`${label(el)} onclick calls ${[...new Set(missing)].join(', ')} — not a function on the page`);
      continue;
    }
    let wired = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.hasAttribute('data-wired-listener') || (n !== el && n.getAttribute('onclick'))) { wired = true; break; }
    }
    if (!wired && el.form && (el.type === 'submit' || el.getAttribute('type') === null) && el.tagName === 'BUTTON') wired = true;
    if (!wired) out.push(`${label(el)} has no handler on it or an ancestor below <body>`);
  }
  return out;
}

test('every control on every destination is wired, and no destination logs an error', { timeout: 240000 }, async (t) => {
  if (!chromium) return t.skip('playwright is not installed — not checked, not passed');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-controls-'));
  buildFixture(dir);
  const home = path.join(dir, '.home'); fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, name: FIXTURE_NAME, path: dir }] }));
  let server, browser;
  try {
    try {
      server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: dir, portEnv: 'PORT', env: { HOME: home, USERPROFILE: home, GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_NO_BOARD: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' } });
    } catch (e) { return t.skip(`board did not come up — not checked, not passed: ${e.message}`); }
    try { browser = await chromium.launch(); } catch (e) { return t.skip(`chromium would not launch — not checked, not passed: ${String(e.message).split('\n')[0]}`); }

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    const inflight = new Set();
    page.on('request', (r) => { if (!/\/api\/sse/.test(r.url()) && ['fetch', 'xhr'].includes(r.resourceType())) inflight.add(r); });
    page.on('requestfinished', (r) => inflight.delete(r));
    page.on('requestfailed', (r) => inflight.delete(r));
    const cdp = await page.context().newCDPSession(page);

    await page.goto(`http://127.0.0.1:${server.port}/?project=${encodeURIComponent(FIXTURE_NAME)}`);
    await page.waitForFunction(() => typeof window.switchTab === 'function');
    await settle(page, inflight);

    const destinations = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-tab]')].map((e) => e.getAttribute('data-tab')).filter(Boolean))]);
    assert.ok(destinations.length >= 5, `only ${destinations.length} destinations found: ${destinations.join(', ')}`);

    const unwired = new Map();
    let controls = 0;
    for (const dest of destinations) {
      const before = errors.length;
      await page.evaluate((d) => window.switchTab(d, document.querySelector(`[data-tab="${d}"]`)), dest);
      await settle(page, inflight);
      await markListeners(cdp);
      controls = Math.max(controls, await page.evaluate((s) => document.querySelectorAll(s).length, CONTROLS));
      for (const line of await page.evaluate(unwiredInPage, CONTROLS)) if (!unwired.has(line)) unwired.set(line, dest);
      for (const e of errors.slice(before)) errors[errors.indexOf(e)] = `${dest}: ${e}`;
    }
    console.log(`controls checked: up to ${controls} per view across ${destinations.length} destinations (${destinations.join(', ')})`);

    const report = [...unwired].map(([line, dest]) => `${dest}: ${line}`);
    assert.deepEqual(report, [], `controls that do nothing:\n  ${report.join('\n  ')}`);
    assert.deepEqual(errors, [], `errors on the board:\n  ${errors.join('\n  ')}`);
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, dir); else fs.rmSync(dir, { recursive: true, force: true });
  }
});
