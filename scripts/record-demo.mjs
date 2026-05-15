#!/usr/bin/env node
/**
 * Record a 15-second demo of the great_cto admin board for landing-page hero.
 *
 * Prereq: `node scripts/seed-demo.mjs` (seeds /tmp/great_cto-demo with 14 tasks).
 *
 * Output:
 *   site/assets/demo.webm    — recorded raw (Chromium native)
 *   site/assets/demo.mp4     — H.264 transcode (Safari/iOS)
 *   site/assets/demo-poster.jpg — first frame
 *
 * Storyboard (15s total):
 *   0–3s   Overview (hero tiles: 14 / $50 / 13× cheaper)
 *   3–6s   Hover into pipeline track + overlay "12-angle review"
 *   6–9s   Open a task side-panel + overlay "human gate approval"
 *   9–12s  Scroll to Agent utilization + overlay "agent breakdown"
 *  12–15s  Return to top + overlay "$650 → $50 · 13× cheaper"
 */
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync, renameSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(import.meta.dirname || new URL(".", import.meta.url).pathname, "..");
const OUT_DIR = join(ROOT, "site", "assets");
const VIDEO_DIR = join(ROOT, "tmp", "demo-video");
const PORT = 4242;
const BOARD_URL = `http://localhost:${PORT}/?project=great_cto-demo`;

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

// ----- Boot the board ---------------------------------------------------
console.log(`[record-demo] booting board on :${PORT}`);
const boardProc = spawn(
  "node",
  [join(ROOT, "packages/cli/dist/main.js"), "board", "--port", String(PORT), "--no-open"],
  { stdio: ["ignore", "pipe", "pipe"], detached: true }
);
let boardReady = false;
boardProc.stdout.on("data", (b) => {
  const s = b.toString();
  if (s.includes("http://localhost")) boardReady = true;
});
boardProc.stderr.on("data", (b) => process.stderr.write(`[board] ${b}`));

// Wait for board
const deadline = Date.now() + 15000;
while (!boardReady && Date.now() < deadline) await sleep(200);
if (!boardReady) {
  console.error("[record-demo] board failed to start");
  try { process.kill(-boardProc.pid, "SIGKILL"); } catch {}
  process.exit(2);
}
console.log(`[record-demo] board up at ${BOARD_URL}`);

// ----- Launch Playwright ------------------------------------------------
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,           // retina-sharp output
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

// Inject an overlay helper into every page
await page.addInitScript(() => {
  window.__overlay = (text, durationMs = 2500) => {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `
      position: fixed; top: 32px; left: 50%; transform: translateX(-50%);
      background: rgba(10,12,20,0.92); color: #00d97e; border: 1px solid #00d97e;
      padding: 10px 22px; border-radius: 999px; font-size: 18px;
      font-family: -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;
      font-weight: 600; letter-spacing: 0.4px; z-index: 99999;
      opacity: 0; transition: opacity 280ms ease;
      box-shadow: 0 8px 32px rgba(0,217,126,0.35);
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 350);
    }, durationMs);
  };
});

console.log("[record-demo] navigating");
await page.goto(BOARD_URL, { waitUntil: "domcontentloaded" });
// Wait for hero stats to render
await page.waitForSelector("#tasks-shipped, .hero-num, .num", { timeout: 8000 }).catch(() => {});
await sleep(800);

// --- Scene 1: overview (0–3s) ------------------------------------------
console.log("[record-demo] scene 1: overview");
await page.evaluate(() => window.__overlay && window.__overlay("14 tasks · $50 LLM · 13× cheaper", 2800));
await sleep(3000);

// --- Scene 2: pipeline (3–6s) ------------------------------------------
console.log("[record-demo] scene 2: pipeline");
const pipelineEl = await page.$("#pipeline-track, .pipeline, [class*='pipeline']");
if (pipelineEl) {
  await pipelineEl.scrollIntoViewIfNeeded();
  await sleep(400);
  const stages = await page.$$("#pipeline-track .stage, .pipeline-stage, [class*='stage']");
  if (stages.length > 0) await stages[Math.min(3, stages.length - 1)].hover().catch(() => {});
}
await page.evaluate(() => window.__overlay && window.__overlay("12-angle review pipeline", 2800));
await sleep(3000);

// --- Scene 3: open task side panel (6–9s) ------------------------------
console.log("[record-demo] scene 3: task / gate");
const taskRow = await page.$(".task-row, .ts-item, [data-task-id], .resume-item");
if (taskRow) await taskRow.click({ force: true }).catch(() => {});
await sleep(600);
await page.evaluate(() => window.__overlay && window.__overlay("human gate approval", 2400));
await sleep(2400);
// close any opened panel
await page.keyboard.press("Escape").catch(() => {});
await sleep(200);

// --- Scene 4: agent utilization (9–12s) --------------------------------
console.log("[record-demo] scene 4: agents");
await page.evaluate(() => {
  const target = document.querySelector("[id*='agent'], [class*='agent-util'], h2,h3");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
});
await sleep(600);
await page.evaluate(() => window.__overlay && window.__overlay("49 agents · real-time activity", 2600));
await sleep(2600);

// --- Scene 5: back to top with savings callout (12–15s) ----------------
console.log("[record-demo] scene 5: savings");
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await sleep(500);
await page.evaluate(() => window.__overlay && window.__overlay("$650 → $50  ·  13× cheaper", 3000));
await sleep(2800);

// ----- Wrap up ----------------------------------------------------------
console.log("[record-demo] closing");
await ctx.close();    // ← flushes video
await browser.close();

// Move recorded webm into site/assets/
const webms = readdirSync(VIDEO_DIR).filter(f => f.endsWith(".webm"))
  .map(f => ({ f, mtime: statSync(join(VIDEO_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (!webms.length) { console.error("no webm produced"); process.exit(3); }
const srcWebm = join(VIDEO_DIR, webms[0].f);
const dstWebm = join(OUT_DIR, "demo.webm");
renameSync(srcWebm, dstWebm);
console.log(`[record-demo] webm → ${dstWebm}`);

// Transcode to mp4 (H.264) and create poster
const dstMp4 = join(OUT_DIR, "demo.mp4");
const dstPoster = join(OUT_DIR, "demo-poster.jpg");
console.log("[record-demo] transcoding mp4 + poster");
execSync(
  `ffmpeg -y -i "${dstWebm}" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an "${dstMp4}"`,
  { stdio: ["ignore", "ignore", "inherit"] }
);
execSync(
  `ffmpeg -y -i "${dstWebm}" -frames:v 1 -q:v 2 "${dstPoster}"`,
  { stdio: ["ignore", "ignore", "inherit"] }
);

// Kill board
try { process.kill(-boardProc.pid, "SIGKILL"); } catch {}

const sizes = {
  webm: (statSync(dstWebm).size / 1024 / 1024).toFixed(2),
  mp4:  (statSync(dstMp4).size  / 1024 / 1024).toFixed(2),
  poster: (statSync(dstPoster).size / 1024).toFixed(0),
};
console.log("[record-demo] ✓ done");
console.log(`  webm:   ${dstWebm}  (${sizes.webm} MB)`);
console.log(`  mp4:    ${dstMp4}   (${sizes.mp4} MB)`);
console.log(`  poster: ${dstPoster} (${sizes.poster} KB)`);
