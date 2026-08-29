#!/usr/bin/env node
/**
 * Photograph the board for the README and the landing page.
 *
 * Two rules, both learned from defects already in this repository:
 *
 *  1. Never the operator's own board. It lists every project on the machine and
 *     prints paths beginning with a home directory and username. The capture runs
 *     against a seeded fixture with HOME redirected, so there is nothing else to
 *     find and nothing personal to print. See scripts/lib/screenshot-fixture.mjs.
 *
 *  2. Every image carries the version it was taken from, in a tEXt chunk inside
 *     the PNG. A screenshot from v2.73.1 sat in the README while the board
 *     shipped 3.16.0 and nothing could tell. Now CI can — see
 *     tests/lib/screenshot-freshness.test.mjs.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs            # write docs/screenshots/
 *   node scripts/capture-screenshots.mjs --check    # capture to a temp dir and
 *                                                   # report what WOULD change
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFixture } from './lib/screenshot-fixture.mjs';
import { writeTextChunk } from './lib/png-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.CAPTURE_PORT || 3242);
const CHECK = process.argv.includes('--check');

/** Panel id (data-tab) → output file. */
const SHOTS = [
  { tab: 'inbox', file: 'inbox.png', settle: 1500 },
  { tab: 'kanban', file: 'board.png', settle: 1500 },
  { tab: 'dashboard', file: 'metrics.png', settle: 2000 },
  { tab: 'docs', file: 'docs.png', settle: 2000 },
  { tab: 'budgets', file: 'budgets.png', settle: 1500 },
  { tab: 'logs', file: 'activity.png', settle: 1500 },
];

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'cli', 'package.json'), 'utf8')).version;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForBoard(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-capture-'));
  const projectRoot = path.join(tmp, 'acme-storefront');
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(fakeHome, '.great_cto'), { recursive: true });
  buildFixture(projectRoot);

  // The registry the switcher reads. One project, so the switcher cannot show
  // anything the operator would not want photographed.
  fs.writeFileSync(path.join(fakeHome, '.great_cto', 'projects.json'),
    JSON.stringify({ projects: [{ name: 'acme-storefront', path: projectRoot }] }, null, 2));
  fs.writeFileSync(path.join(fakeHome, '.great_cto', 'decisions.md'),
    '# Decisions\n\n- 2026-08-18 — checkout stays off our origin (PCI SAQ-A).\n');

  let chromium;
  try { ({ chromium } = await import('playwright')); } catch {
    console.error('playwright is not installed — run `npm i` first');
    process.exit(2);
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'packages', 'board', 'server.mjs')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      PORT: String(PORT),
      GREAT_CTO_PROJECTS_FILE: path.join(fakeHome, '.great_cto', 'projects.json'),
      GREAT_CTO_NO_BOARD: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  server.stdout.on('data', (b) => serverLog.push(String(b)));
  server.stderr.on('data', (b) => serverLog.push(String(b)));

  const base = `http://127.0.0.1:${PORT}`;
  let browser;
  try {
    if (!await waitForBoard(`${base}/api/version`)) {
      throw new Error(`the board did not answer on ${base}\n${serverLog.join('').slice(-800)}`);
    }

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    // The board reads its theme from localStorage before first paint; setting it
    // here avoids photographing a light flash on a dark shot.
    await page.addInitScript(() => {
      try { localStorage.setItem('gcto_board_theme', 'dark'); } catch { /* private mode */ }
    });
    // Not `networkidle`: the board holds an SSE stream open for live updates, so
    // the network is never idle and the wait can only time out.
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('[data-tab="inbox"]', { timeout: 30_000 });
    await sleep(2500);

    const destDir = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-shots-')) : OUT;
    fs.mkdirSync(destDir, { recursive: true });
    const written = [];

    for (const shot of SHOTS) {
      const nav = await page.$(`[data-tab="${shot.tab}"]`);
      if (!nav) throw new Error(`no nav item [data-tab="${shot.tab}"] — the board's tabs changed, `
        + 'so this script is photographing a screen that no longer exists');
      await nav.click();
      await sleep(shot.settle);
      const raw = await page.screenshot({ type: 'png' });
      const stamped = [
        ['great_cto.version', version],
        ['great_cto.panel', shot.tab],
        ['great_cto.fixture', 'acme-storefront'],
      ].reduce((buf, [k, v]) => writeTextChunk(buf, k, v), raw);
      fs.writeFileSync(path.join(destDir, shot.file), stamped);
      written.push(shot.file);
      console.log(`  ✓ ${shot.file}  (${shot.tab}, v${version}, ${(stamped.length / 1024).toFixed(0)} KB)`);
    }

    console.log(CHECK
      ? `\ncheck only — ${written.length} images written to ${destDir}, docs/screenshots/ untouched`
      : `\n${written.length} images written to docs/screenshots/ at v${version}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
