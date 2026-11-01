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
import { buildFixture, buildShowcaseRecords, SAMPLE_TASK_ID } from './lib/screenshot-fixture.mjs';
import { seedRecordedCapture } from './lib/screenshot-causal-fixture.mjs';
import { writeTextChunk } from './lib/png-meta.mjs';
import { isMainModule } from './lib/is-main.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.CAPTURE_PORT || 3242);
const CHECK = process.argv.includes('--check');

/** Stable image/metadata names, current routes and actual panel identities. */
export const SHOTS = [
  // The redesign's screens (great_cto-ki1x.26). `board.png` is the one README
  // embeds, so it shows the screen the board opens on — Work since 3.48.
  { tab: 'work', route: 'work', panel: 'work', file: 'board.png', settle: 1500 },
  { tab: 'ledger', route: 'insights/ledger', panel: 'budgets', file: 'ledger.png', settle: 2000 },
  { tab: 'fleet', route: 'settings/executors', panel: 'agents', file: 'fleet.png', settle: 2000 },
  { tab: 'harness', route: 'settings/runtime', panel: 'harness', file: 'harness.png', settle: 2000 },
  { tab: 'settings', route: 'settings/general', panel: 'settings', file: 'settings.png', settle: 1500 },
  { tab: 'execution', route: 'work', panel: 'work', file: 'execution.png', detail: 'execution', settle: 500 },
  { tab: 'evidence', route: 'work', panel: 'work', file: 'evidence.png', detail: 'evidence', settle: 500 },
  { tab: 'knowledge', route: 'knowledge', panel: 'knowledge', file: 'knowledge.png', document: 'docs/ARCHITECTURE.md', settle: 500 },
  { tab: 'insights', route: 'insights/outcomes', panel: 'admin-outcomes', file: 'insights.png', settle: 500 },
  { tab: 'work-social', route: 'work', panel: 'work', file: 'work-social.png', viewport: { width: 1200, height: 630 }, settle: 500 },
];

export async function selectScreenshotPanel(page, shot) {
  await page.evaluate(route => window.switchTab(route), shot.route);
  await page.waitForSelector(`#panel-${shot.panel}.active`, { state: 'visible', timeout: 30000 });
}

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
  // macOS /var is a symlink. Use the real temporary root so the private
  // enrollment reader can retain its fail-closed ancestor-symlink checks.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-capture-')));
  const projectRoot = path.join(tmp, 'acme-storefront');
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(fakeHome, '.great_cto'), { recursive: true });
  buildFixture(projectRoot);
  const records = buildShowcaseRecords(projectRoot, fakeHome);
  const graphRunId = await seedRecordedCapture(projectRoot, fakeHome);

  // The registry the switcher reads. One project, so the switcher cannot show
  // anything the operator would not want photographed.
  fs.writeFileSync(path.join(fakeHome, '.great_cto', 'projects.json'),
    JSON.stringify({ projects: [{ name: 'acme-storefront', path: projectRoot }] }, null, 2));
  // Fleet reads the installed agents from ~/.claude/agents. With HOME redirected
  // and nothing there, the README's Fleet shot showed "No agents match this view"
  // from v3.28 to v3.36. Install the repo's own agents the way install-local does.
  const agentsDir = path.join(fakeHome, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'agents')).filter((n) => n.endsWith('.md'))) {
    fs.copyFileSync(path.join(ROOT, 'agents', f), path.join(agentsDir, `great_cto-${f}`));
  }
  fs.writeFileSync(path.join(fakeHome, '.great_cto', 'decisions.md'),
    '# Decisions\n\n- 2026-08-18 — checkout stays off our origin (PCI SAQ-A).\n');

  let chromium;
  try { ({ chromium } = await import('playwright')); } catch {
    console.error('playwright is not installed — run `npm i` first');
    process.exit(2);
  }

  // `--no-open`: server.mjs opens a real browser tab on start unless told not to,
  // and a capture run is not a reason to take over the operator's screen. Six
  // captures during one session opened six tabs.
  const server = spawn(process.execPath, [path.join(ROOT, 'packages', 'board', 'server.mjs'), '--no-open'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      CODEX_HOME: path.join(fakeHome, '.codex'),
      CLAUDE_CONFIG_DIR: path.join(fakeHome, '.claude'),
      PORT: String(PORT),
      GREAT_CTO_PROJECTS_FILE: path.join(fakeHome, '.great_cto', 'projects.json'),
      GREAT_CTO_NO_BOARD: '1',
      GREAT_CTO_TASKS_DIR: records.tasks,
      GREAT_CTO_CODEX_RUNS_DIR: records.runs,
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
      colorScheme: 'light',
    });
    // Match the public site's light theme without changing the operator's board.
    await page.addInitScript(() => {
      try { localStorage.setItem('gcto_board_theme', 'light'); } catch { /* private mode */ }
    });
    // Not `networkidle`: the board holds an SSE stream open for live updates, so
    // the network is never idle and the wait can only time out.
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('[data-tab="decisions"]', { timeout: 30_000 });
    await sleep(2500);

    // Refuse to photograph an error. Every README screenshot from v3.26 to
    // v3.27.5 opened on a red 'acme was not found' banner: the board derived the
    // project slug from a task id's prefix (`acme-6f` -> `acme`) while the
    // fixture registers `acme-storefront`, so a healthy setup reported itself
    // broken in the product's own shop window. Fixed in the board; this is the
    // guard, at the only place that can see the rendered page.
    const banner = await page.$('#project-fallback-banner, .degraded-banner');
    if (banner) {
      const text = (await banner.innerText()).replace(/\s+/g, ' ').trim();
      throw new Error(`the board is showing an error banner, so these screenshots would ship it: "${text}"`);
    }

    const destDir = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-shots-')) : OUT;
    fs.mkdirSync(destDir, { recursive: true });
    const written = [];

    for (const shot of SHOTS) {
      await page.setViewportSize(shot.viewport || { width: 1440, height: 900 });
      // Legacy Tools buttons are deliberately hidden. Use the board's actual
      // router and refuse a missing/hidden target instead of shooting a stale panel.
      await selectScreenshotPanel(page, shot);
      if (shot.panel === 'work') {
        const selected = shot.detail === 'execution' ? `run:${graphRunId}` : `task:${SAMPLE_TASK_ID}`;
        await page.locator(`[data-work-select="${selected}"]`).click();
        await page.locator(`[data-work-tab="${shot.detail || 'overview'}"]`).click();
        await page.waitForSelector(`#work-tab-${shot.detail || 'overview'}[aria-selected="true"]`);
        if (shot.detail === 'execution') await page.waitForSelector('.execution-graph svg');
      }
      if (shot.document) {
        await page.locator(`[data-doc-path="${shot.document}"]`).click();
        await page.waitForSelector('#knowledge-document .knowledge-diagram');
      }
      if (shot.tab === 'insights') await page.waitForSelector('#admin-outcomes-body .admin-metrics');
      await sleep(shot.settle);
      // Refuse to photograph an empty panel. The Fleet shot said "No agents match
      // this view" from v3.28 to v3.36 because the fixture HOME had no agents.
      const empty = await page.evaluate(() => /No agents match this view|Nothing here yet/.test(document.body.innerText));
      if (empty) throw new Error(`the ${shot.tab} panel is empty in the fixture, so ${shot.file} would ship a blank screen`);
      const warning = await page.locator('#project-fallback-banner:visible, .degraded-banner:visible, .work-warning:visible').first();
      if (await warning.count()) throw new Error(`the ${shot.tab} panel reports a source error: ${(await warning.innerText()).replace(/\s+/g, ' ').trim()}`);
      const raw = await page.screenshot({ type: 'png' });
      const stamped = [
        ['great_cto.version', version],
        ['great_cto.panel', shot.tab],
        ['great_cto.fixture', 'acme-storefront'],
        ['great_cto.sample', 'synthetic; not a live-model benchmark'],
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

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
}
