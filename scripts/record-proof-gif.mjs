#!/usr/bin/env node
/**
 * Record the README's opening GIF: one real run, scrolled end to end.
 *
 * People star a project after they have seen what it does. The run on
 * https://greatcto.systems/proof is a real one — prompt, architect, a human gate,
 * parallel implementers, a reviewer's PARTIAL and the fix, the e2e pass, the ship
 * gate, the merged PR — with a time and a cost on every stage. This scrolls
 * through it and renders a GIF, so the first thing the README shows is a run and
 * not a promise.
 *
 * A board tour over the screenshot fixture was tried first and dropped: the
 * fixture is sparse by design, and a GIF of "$0.00" and "No agents match this
 * view" shows an empty product exactly where it should show a result.
 *
 * The GIF is served from the site (https://greatcto.systems/assets/one-real-run.gif),
 * not committed here: at ~4 MB it would ride along with every plugin install, and
 * the site can replace it without a release.
 *
 * Usage:
 *   node scripts/record-proof-gif.mjs --out <path>   # default: one-real-run.gif in the OS temp dir
 * Needs: playwright (root devDependency) and ffmpeg on PATH, and the network.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const outAt = process.argv.indexOf('--out');
const OUT = path.resolve(outAt > 0 && process.argv[outAt + 1] ? process.argv[outAt + 1] : path.join(os.tmpdir(), 'one-real-run.gif'));
const URL = 'https://greatcto.systems/proof';
const VIEW = { width: 1280, height: 800 };
// From the run's headline (1h 26m · $3.40) to the lesson it saved, at a pace the
// eye can follow; the page's own section offsets decide the ends.
const SCROLL_MS = 13000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch {
    console.error('ffmpeg is not on PATH — brew install ffmpeg');
    process.exit(2);
  }
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch {
    console.error('playwright is not installed — run `npm i` first');
    process.exit(2);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-proof-gif-'));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: tmp, size: VIEW } });
    const page = await context.newPage();
    const started = Date.now();
    const res = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!res || !res.ok()) throw new Error(`${URL} answered ${res && res.status()}`);

    const ends = await page.evaluate(() => {
      const timeline = document.querySelector('#timeline');
      const caveats = [...document.querySelectorAll('h3')].find((h) => /caveats/i.test(h.textContent || ''));
      const top = (el) => el.getBoundingClientRect().top + window.scrollY;
      return { from: timeline ? top(timeline) - 20 : 0, to: caveats ? top(caveats) - window.innerHeight + 40 : null };
    });
    if (ends.to === null) throw new Error('the proof page no longer has its caveats section — check the layout before recording');
    await page.evaluate((y) => window.scrollTo(0, y), ends.from);
    await sleep(1200);
    const lead = (Date.now() - started) / 1000;

    // Eased scroll driven by the page's own frame clock, so the video has no jumps.
    await page.evaluate(({ from, to, ms }) => new Promise((done) => {
      const t0 = performance.now();
      const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, from + (to - from) * ease(k));
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    }), { from: ends.from, to: ends.to, ms: SCROLL_MS });
    await sleep(1800);

    const video = page.video();
    await context.close();
    const webm = await video.path();

    const filters = 'fps=7,scale=640:-1:flags=lanczos';
    const palette = path.join(tmp, 'palette.png');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-ss', lead.toFixed(2), '-i', webm, '-vf', `${filters},palettegen=max_colors=48:stats_mode=diff`, palette], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-ss', lead.toFixed(2), '-i', webm, '-i', palette,
      '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', OUT], { stdio: 'ignore' });

    console.log(`  ✓ ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, from ${URL})`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
