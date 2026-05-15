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
 *   tmp/demo-video/scene-*.png  — per-scene screenshots (debug)
 *
 * Storyboard (15s total):
 *   0–3s   Metrics view: hero tiles "14 / $50 / 13× cheaper"
 *   3–6s   Click Tasks tab, scroll task list, hover row
 *   6–9s   Click a task → side panel opens with verdicts
 *   9–12s  Click Agents tab, fleet list with utilization
 *  12–15s  Back to Metrics, scroll to cost-panel ($650 vs $50)
 *
 * Overlays are re-injected per scene via page.evaluate (more reliable
 * than addInitScript — the SPA can stomp on a globally-installed helper).
 */
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync, renameSync, readdirSync, statSync } from "node:fs";
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
  if (b.toString().includes("http://localhost")) boardReady = true;
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

// Tiny helper to drop the overlay pill into the page
const overlayJs = (text, durationMs = 2500) => `(() => {
  const prev = document.getElementById('__rec_overlay'); if (prev) prev.remove();
  const el = document.createElement('div');
  el.id = '__rec_overlay';
  el.textContent = ${JSON.stringify(text)};
  el.style.cssText = 'position:fixed;top:32px;left:50%;transform:translateX(-50%);background:rgba(10,12,20,0.94);color:#00d97e;border:1px solid #00d97e;padding:11px 24px;border-radius:999px;font-size:18px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;font-weight:600;letter-spacing:0.4px;z-index:99999;opacity:0;transition:opacity 320ms ease;box-shadow:0 10px 38px rgba(0,217,126,0.4);';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ${durationMs});
})()`;

// ----- Launch Playwright ------------------------------------------------
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

console.log("[record-demo] navigating");
await page.goto(BOARD_URL, { waitUntil: "domcontentloaded" });
// Wait for sidebar nav to render
await page.waitForSelector('[data-tab="dashboard"]', { timeout: 8000 });
await sleep(400);

// Each scene ≈ 2.7s; preamble ≈ 1.5s; total ≈ 15s.
const OVERLAY_MS = 2000;
const POST_MS = 700;

// ====== Scene 1: Metrics hero (≈ 0–3s) =================================
console.log("[record-demo] scene 1: Metrics hero");
await page.click('[data-tab="dashboard"]');
await page.waitForSelector("#mp-hero", { timeout: 5000 });
await sleep(500);
await page.evaluate(overlayJs("metrics · shipped · spend · velocity", OVERLAY_MS));
await sleep(400); await page.screenshot({ path: join(VIDEO_DIR, "scene-1-metrics.png") });
await sleep(POST_MS);

// ====== Scene 2: Tasks kanban (≈ 3–6s) =================================
console.log("[record-demo] scene 2: Tasks");
await page.click('[data-tab="kanban"]');
await sleep(500);
const taskRow = await page.$(".task-row, [data-task-id], .kanban-card");
if (taskRow) await taskRow.hover().catch(() => {});
await page.evaluate(overlayJs("kanban · 14 features · backlog → done", OVERLAY_MS));
await sleep(400); await page.screenshot({ path: join(VIDEO_DIR, "scene-2-tasks.png") });
await sleep(POST_MS);

// ====== Scene 3: task side panel (≈ 6–9s) ==============================
console.log("[record-demo] scene 3: task / verdicts");
if (taskRow) await taskRow.click({ force: true }).catch(() => {});
await sleep(600);
await page.evaluate(overlayJs("12-angle review · human gate approval", OVERLAY_MS));
await sleep(400); await page.screenshot({ path: join(VIDEO_DIR, "scene-3-task.png") });
await sleep(POST_MS);
await page.keyboard.press("Escape").catch(() => {});

// ====== Scene 4: Agents fleet (≈ 9–12s) ================================
console.log("[record-demo] scene 4: Agents");
await page.click('[data-tab="agents"]');
await sleep(600);
await page.evaluate(overlayJs("35 agents · arch · pm · qa · security · ops", OVERLAY_MS));
await sleep(400); await page.screenshot({ path: join(VIDEO_DIR, "scene-4-agents.png") });
await sleep(POST_MS);

// ====== Scene 5: cost dashboard (≈ 12–15s) =============================
console.log("[record-demo] scene 5: cost dashboard");
await page.click('[data-tab="dashboard"]');
await sleep(500);
await page.evaluate(() => {
  const cp = document.getElementById("cost-panel");
  if (cp) cp.scrollIntoView({ behavior: "smooth", block: "center" });
});
await sleep(400);
await page.evaluate(overlayJs("cost dashboard · daily burn · budget", OVERLAY_MS));
await sleep(400); await page.screenshot({ path: join(VIDEO_DIR, "scene-5-cost.png") });
await sleep(POST_MS);

// ----- Wrap up ----------------------------------------------------------
console.log("[record-demo] closing");
await ctx.close();
await browser.close();

const webms = readdirSync(VIDEO_DIR)
  .filter(f => f.endsWith(".webm"))
  .map(f => ({ f, mtime: statSync(join(VIDEO_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (!webms.length) { console.error("no webm produced"); process.exit(3); }
const srcWebm = join(VIDEO_DIR, webms[0].f);
const dstWebm = join(OUT_DIR, "demo.webm");
renameSync(srcWebm, dstWebm);
console.log(`[record-demo] raw webm → ${dstWebm}`);

// Trim to exactly 15s + transcode mp4 + extract poster
const trimmedWebm = join(VIDEO_DIR, "demo-15s.webm");
const dstMp4 = join(OUT_DIR, "demo.mp4");
const dstPoster = join(OUT_DIR, "demo-poster.jpg");
execSync(`ffmpeg -y -i "${dstWebm}" -t 15 -c copy "${trimmedWebm}"`, { stdio: ["ignore", "ignore", "inherit"] });
renameSync(trimmedWebm, dstWebm);
execSync(`ffmpeg -y -i "${dstWebm}" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an "${dstMp4}"`, { stdio: ["ignore", "ignore", "inherit"] });
// Poster: grab frame at 1.8s — first scene is fully rendered with overlay
execSync(`ffmpeg -y -ss 1.8 -i "${dstWebm}" -frames:v 1 -q:v 2 "${dstPoster}"`, { stdio: ["ignore", "ignore", "inherit"] });

try { process.kill(-boardProc.pid, "SIGKILL"); } catch {}

const sizes = {
  webm: (statSync(dstWebm).size / 1024 / 1024).toFixed(2),
  mp4:  (statSync(dstMp4).size  / 1024 / 1024).toFixed(2),
  poster: (statSync(dstPoster).size / 1024).toFixed(0),
};
console.log("[record-demo] ✓ done");
console.log(`  webm:    ${dstWebm}  (${sizes.webm} MB)`);
console.log(`  mp4:     ${dstMp4}   (${sizes.mp4} MB)`);
console.log(`  poster:  ${dstPoster} (${sizes.poster} KB)`);
console.log(`  scenes:  ${VIDEO_DIR}/scene-*.png  (verify each scene rendered)`);
