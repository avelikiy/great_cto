// scripts/shoot-console.mjs — capture clean operator-console screenshots with Playwright.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/console-shots';
mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:3141/autopilot.html';

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1340, height: 920 }, deviceScaleFactor: 2 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('#inbox .card', { timeout: 15000 });
await wait(800);

// 1 — Inbox (the hero: cases awaiting a human signature)
await page.screenshot({ path: `${OUT}/console-inbox.png` });
console.log('✓ console-inbox.png');

// 2 — Case drawer (criteria · evidence · AI-draft · audit)
await page.click('#inbox .card .back'); // the "⋯ details" button
await page.waitForSelector('#drawer', { state: 'visible', timeout: 8000 });
await wait(700);
await page.screenshot({ path: `${OUT}/console-drawer.png` });
console.log('✓ console-drawer.png');
await page.click('#drawer .x').catch(() => {});
await wait(300);

// 3 — Ops tab (metering · connector health · dead-letter)
await page.click('nav.tabs button[data-tab="ops"]');
await page.waitForSelector('#ops-kpis .kpi', { timeout: 8000 });
await wait(700);
await page.screenshot({ path: `${OUT}/console-ops.png` });
console.log('✓ console-ops.png');

// 4 — Analytics tab (is the autopilot taking work off the desk?)
await page.click('nav.tabs button[data-tab="analytics"]');
await wait(900);
await page.screenshot({ path: `${OUT}/console-analytics.png` });
console.log('✓ console-analytics.png');

await b.close();
console.log('done →', OUT);
