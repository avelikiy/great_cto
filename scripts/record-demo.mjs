#!/usr/bin/env node
/**
 * Record a 21-second demo of the great_cto admin board.
 *
 * Prereq: `node scripts/seed-demo.mjs` (seeds /tmp/great_cto-demo with 14 tasks).
 *
 * Output:
 *   site/assets/demo.webm    — recorded raw (Chromium native)
 *   site/assets/demo.mp4     — H.264 transcode (Safari/iOS)
 *   site/assets/demo-poster.jpg — frame at 1.8s
 *
 * Storyboard — 7 tabs × 3s each:
 *   0–3s    Inbox       "Resume where you stopped"
 *   3–6s    Kanban      "14 tasks · 5 columns · live SSE"
 *   6–9s    Dashboard   "$50 spent · 13× cheaper than human"
 *   9–12s   Memory      "4 layers · every Friday smarter"
 *   12–15s  Share       "Public report — one click"
 *   15–18s  Logs        "Every verdict logged"
 *   18–21s  Agents      "34 specialists · real-time activity"
 */
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, renameSync, readdirSync, statSync } from "node:fs";
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
  deviceScaleFactor: 2,
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

console.log("[record-demo] navigating");
await page.goto(BOARD_URL, { waitUntil: "domcontentloaded" });
await sleep(1200); // let SPA render

// Overlay helper — injected per scene (addInitScript gets stomped by SPA)
async function showOverlay(text, durationMs = 2600) {
  await page.evaluate(({ text, durationMs }) => {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
      background: rgba(10,12,20,0.94); color: #00d97e;
      border: 1px solid rgba(0,217,126,0.55);
      padding: 12px 26px; border-radius: 999px;
      font-size: 19px; font-weight: 600; letter-spacing: 0.3px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
      z-index: 99999; pointer-events: none;
      opacity: 0; transition: opacity 220ms ease;
      box-shadow: 0 10px 36px rgba(0,217,126,0.32);
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 260);
    }, durationMs);
  }, { text, durationMs });
}

// Click a tab + wait for content to render
async function clickTab(tabName) {
  const selector = `[data-tab="${tabName}"]`;
  await page.click(selector, { force: true });
  await sleep(450); // let tab content paint
}

// ----- Scenes (7 × 3s = 21s) -------------------------------------------

console.log("[record-demo] scene 1/7: Inbox");
await clickTab("inbox");
await showOverlay("Resume where you stopped");
await sleep(2700);

console.log("[record-demo] scene 2/7: Kanban");
await clickTab("kanban");
await showOverlay("14 tasks · 5 columns · live");
await sleep(2700);

console.log("[record-demo] scene 3/7: Dashboard (Metrics)");
await clickTab("dashboard");
await showOverlay("$50 spent · 13× cheaper than human");
await sleep(2700);

console.log("[record-demo] scene 4/7: Memory");
await clickTab("memory");
await showOverlay("4 layers · every Friday smarter");
await sleep(2700);

console.log("[record-demo] scene 5/7: Share");
await clickTab("share");
await showOverlay("Public report — one click");
await sleep(2700);

console.log("[record-demo] scene 6/7: Logs");
await clickTab("logs");
await showOverlay("Every verdict logged");
await sleep(2700);

console.log("[record-demo] scene 7/7: Agents");
await clickTab("agents");
await showOverlay("34 specialists · real-time");
await sleep(2900);

// ----- Wrap up ----------------------------------------------------------
console.log("[record-demo] closing");
await ctx.close();
await browser.close();

const webms = readdirSync(VIDEO_DIR).filter(f => f.endsWith(".webm"))
  .map(f => ({ f, mtime: statSync(join(VIDEO_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (!webms.length) { console.error("no webm produced"); process.exit(3); }
const srcWebm = join(VIDEO_DIR, webms[0].f);
const dstWebm = join(OUT_DIR, "demo.webm");
renameSync(srcWebm, dstWebm);
console.log(`[record-demo] webm → ${dstWebm}`);

const dstMp4 = join(OUT_DIR, "demo.mp4");
const dstPoster = join(OUT_DIR, "demo-poster.jpg");
console.log("[record-demo] transcoding mp4 + poster");
execSync(
  `ffmpeg -y -i "${dstWebm}" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an "${dstMp4}"`,
  { stdio: ["ignore", "ignore", "inherit"] }
);
// Poster at 1.8s — first frame is blank during fade-in
execSync(
  `ffmpeg -y -ss 1.8 -i "${dstWebm}" -frames:v 1 -q:v 2 "${dstPoster}"`,
  { stdio: ["ignore", "ignore", "inherit"] }
);

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
