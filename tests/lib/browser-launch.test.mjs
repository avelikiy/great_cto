// The board's browser checks launch Playwright's bundled Chromium, and the
// installed Google Chrome only when the bundled build is missing.
//
// They used `channel: 'chrome'`. On macOS every launch of the installed Chrome
// copies the app into `…/X/com.google.Chrome.code_sign_clone/` for its signature
// check; a clean close removes the copy, a SIGKILL does not. The contrast-abort
// test kills its browser on purpose, so every gate run left one copy behind
// (measured 2026-11-10). The bundled Chromium leaves none.
//
// What these tests hold: the fallback happens for a missing browser and for
// nothing else, no browser launch in scripts/ or tests/ names the Chrome channel
// directly, and a real launch runs the bundled binary when it is installed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser, loadBrowser } from '../../scripts/lib/layout-snapshot.mjs';

function fakeChromium(errors) {
  const calls = [];
  const make = (method) => async (opts) => {
    calls.push({ method, opts });
    const e = errors.shift();
    if (e) throw new Error(e);
    return { method, opts };
  };
  return { calls, launch: make('launch'), launchServer: make('launchServer') };
}

test('the bundled Chromium is tried first, with no channel', async () => {
  const c = fakeChromium([]);
  const r = await launchBrowser(c);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].opts.channel, undefined);
  assert.equal(c.calls[0].opts.headless, true);
  assert.equal(r.method, 'launch');
});

test('a missing bundled build falls back to the installed Chrome', async () => {
  const c = fakeChromium(["browserType.launch: Executable doesn't exist at /x/chrome-headless-shell"]);
  await launchBrowser(c, { timeout: 5000 }, 'launchServer');
  assert.equal(c.calls.length, 2);
  assert.deepEqual(c.calls.map((x) => x.method), ['launchServer', 'launchServer']);
  assert.equal(c.calls[0].opts.channel, undefined);
  assert.equal(c.calls[1].opts.channel, 'chrome');
  assert.equal(c.calls[1].opts.timeout, 5000, 'the caller options travel with the fallback');
});

test('any other launch error is re-thrown, not hidden behind a second browser', async () => {
  const c = fakeChromium(['Target page, context or browser has been closed']);
  await assert.rejects(launchBrowser(c), /has been closed/);
  assert.equal(c.calls.length, 1, 'a crash is not a missing browser');
});

// ---- no launch names the Chrome channel directly -------------------------

const CHROME_CHANNEL = /channel\s*:\s*['"`]chrome['"`]/;
// The one place allowed to name it: the fallback inside launchBrowser.
const ALLOWED = new Set([path.join('scripts', 'lib', 'layout-snapshot.mjs')]);

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) sourceFiles(p, out);
    else if (/\.(mjs|cjs|js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

function chromeChannelHits(files) {
  const hits = [];
  for (const f of files) {
    if (ALLOWED.has(f) || f === path.join('tests', 'lib', 'browser-launch.test.mjs')) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (CHROME_CHANNEL.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  return hits;
}

test('the scan catches the Chrome channel in its usual spellings', () => {
  // Proven on bad examples first, or the scan below could be catching nothing.
  for (const bad of [
    "chromium.launch({ channel: 'chrome', headless: true })",
    'chromium.launchServer({channel:"chrome",headless:true})',
    'launch({ channel : `chrome` })',
  ]) assert.ok(CHROME_CHANNEL.test(bad), bad);
  assert.ok(!CHROME_CHANNEL.test("chromium.launch({ channel: 'chrome-beta' })"), 'another channel is not this one');
  assert.ok(!CHROME_CHANNEL.test('chromium.launch({ headless: true })'));
});

test('no browser launch in scripts/ or tests/ names the Chrome channel directly', () => {
  const files = [...sourceFiles('scripts'), ...sourceFiles('tests')];
  assert.ok(files.length > 100, `expected the repository's sources, found ${files.length}`);
  assert.deepEqual(chromeChannelHits(files), [],
    "use launchBrowser() from scripts/lib/layout-snapshot.mjs: `channel: 'chrome'` leaves a " +
    'code_sign_clone copy of Chrome behind on macOS every time the browser is killed');
});

// ---- a real launch runs the bundled binary -------------------------------

test('a real launch runs the bundled Chromium when it is installed', { timeout: 60_000 }, async (t) => {
  const chromium = await loadBrowser();
  if (!chromium) return t.skip('playwright not installed — not checked, not passed');
  let bundled;
  try { bundled = chromium.executablePath(); } catch { bundled = null; }
  if (!bundled || !existsSync(bundled)) {
    return t.skip(`bundled Chromium not installed (${bundled || 'no path'}) — fallback path, not checked here`);
  }
  const server = await launchBrowser(chromium, { timeout: 15_000 }, 'launchServer');
  try {
    const exe = server.process().spawnfile || server.process().spawnargs[0];
    assert.ok(!/Google Chrome\.app/.test(exe), `launched the installed Chrome: ${exe}`);
    // Headless runs the headless shell, a sibling of the full Chromium build, so
    // the check is "under the same Playwright browsers dir", not "this exact file".
    const browsersDir = bundled.slice(0, bundled.indexOf(`${path.sep}chromium-`));
    assert.ok(browsersDir && exe.startsWith(browsersDir),
      `expected a binary under ${browsersDir}, got ${exe}`);
  } finally {
    await server.close().catch(() => {});
  }
});
