// scripts/lib/product-browser.mjs — headless browser signals for a shipped product
// (QUALITY-DEEPEN #6, F6a a11y + F6b Web Vitals). Opt-in via --browser; zero runtime
// cost when off. See docs/arch/ARCH-quality-deepen-followups.md.
//
// F6a — axe-core accessibility scan of the product's preview page.
// F6b — Web Vitals (LCP / CLS / INP) captured on the same page load, same harness.
//
// Both signals degrade to 'na' (no penalty, same convention as product-eval.mjs's
// tsconfig-less typecheck/lint) whenever a precondition is missing:
//   • no dev/preview/start script in package.json → 'na', no server to hit
//   • playwright not installed / browsers not downloaded → 'na', never crash
//   • server doesn't respond within the timeout → 'na'
//
// Pure scoring helpers (scoreA11y, scoreVitals) are unit-tested without a browser;
// runBrowserChecks(dir) is the impure entrypoint that actually launches Chromium —
// only exercised manually / in fleet runs, never in the unit-test job (would require
// a browser download).
//
// Usage:
//   node scripts/lib/product-browser.mjs <product-dir> [--json] [--timeout 15000]

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 15000;

/** Which package.json script to use as the preview command, or null if none exists. */
export function pickPreviewScript(pkg) {
  const scripts = pkg?.scripts || {};
  for (const name of ['preview', 'dev', 'start']) {
    if (scripts[name]) return name;
  }
  return null;
}

/**
 * F6a: axe-core violations → a11y signal. Pure.
 * @param {Array<{impact:string}>|null} violations  axe-core's violations array, or null
 *        when the scan couldn't run (→ 'na', not 0 — a crash isn't "zero violations").
 * @returns {{ signal: number|'na', violations: number, critical: number }}
 */
export function scoreA11y(violations) {
  if (violations == null) return { signal: 'na', violations: 0, critical: 0 };
  const critical = violations.filter(v => v.impact === 'critical' || v.impact === 'serious').length;
  // Full credit at 0 violations; each critical/serious violation costs 0.2, floor 0.
  const signal = Math.max(0, 1 - critical * 0.2);
  return { signal: round2(signal), violations: violations.length, critical };
}

/**
 * F6b: Web Vitals → a signal per metric + a blended one. Pure. Thresholds are the
 * standard "good" boundaries (web.dev/vitals): LCP ≤2.5s, CLS ≤0.1, INP ≤200ms.
 * @param {{lcp:number,cls:number,inp:number}|null} vitals  ms/unitless/ms, or null → 'na'.
 */
export function scoreVitals(vitals) {
  if (vitals == null) return { signal: 'na', lcp: null, cls: null, inp: null };
  const lcpOk = typeof vitals.lcp === 'number' ? clamp01(1 - Math.max(0, vitals.lcp - 2500) / 2500) : 1;
  const clsOk = typeof vitals.cls === 'number' ? clamp01(1 - Math.max(0, vitals.cls - 0.1) / 0.25) : 1;
  const inpOk = typeof vitals.inp === 'number' ? clamp01(1 - Math.max(0, vitals.inp - 200) / 300) : 1;
  const signal = round2((lcpOk + clsOk + inpOk) / 3);
  return { signal, lcp: vitals.lcp ?? null, cls: vitals.cls ?? null, inp: vitals.inp ?? null };
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function round2(n) { return Math.round(n * 100) / 100; }

// ── impure: launch the preview server + a real browser ────────────────────────

/** Best-effort: does anything answer at `url` yet? */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  return false;
}

/** Try to dynamically load playwright; null (not a throw) if it's not installed —
 *  this is the graceful-degradation seam: a product-eval run in an environment
 *  without the devDependency (or without `npx playwright install`'d browsers)
 *  must fall through to 'na', never crash the whole eval. */
async function loadPlaywright() {
  try { return await import('playwright'); } catch { return null; }
}

/**
 * F6a+F6b: run both browser signals against a product's preview server.
 * Never throws — every failure mode (no preview script, no playwright, server never
 * comes up, browser launch fails) resolves to { a11y: 'na', vitals: 'na', reason }.
 * @param {string} dir
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=15000]
 * @param {number} [opts.port]  override the port probed (default: pick a free-ish one)
 */
export async function runBrowserChecks(dir, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const na = { a11y: scoreA11y(null), vitals: scoreVitals(null) };

  let pkg;
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return { ...na, reason: 'no package.json' }; }
  const scriptName = pickPreviewScript(pkg);
  if (!scriptName) return { ...na, reason: 'no dev/preview/start script' };

  const pw = await loadPlaywright();
  if (!pw) return { ...na, reason: 'playwright not installed' };

  const port = opts.port || 4173;
  const url = opts.url || `http://localhost:${port}`;
  let proc;
  try {
    proc = spawn('npm', ['run', scriptName, '--silent'], { cwd: dir, stdio: 'ignore', detached: true });
  } catch {
    return { ...na, reason: 'failed to start preview server' };
  }

  try {
    const up = await waitForServer(url, timeoutMs);
    if (!up) return { ...na, reason: 'preview server did not respond within timeout' };

    let browser;
    try {
      browser = await pw.chromium.launch({ headless: true });
    } catch {
      return { ...na, reason: 'chromium not installed (run: npx playwright install chromium)' };
    }
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });

      // F6a — axe-core. Injected via addScriptTag from the installed devDependency;
      // no network fetch, no runtime dependency (axe-core is devDependency-only).
      let violations = null;
      try {
        const axePath = fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url));
        if (existsSync(axePath)) {
          await page.addScriptTag({ path: axePath });
          const results = await page.evaluate(() => window.axe.run());
          violations = results.violations || [];
        }
      } catch { /* leave violations null → 'na' */ }

      // F6b — Web Vitals via the Performance API (no extra library: LCP/CLS come from
      // PerformanceObserver entries already buffered by the time `load` fires; INP is
      // approximated from event timing entries, best-effort).
      let vitals = null;
      try {
        vitals = await page.evaluate(() => new Promise((resolve) => {
          const out = { lcp: null, cls: 0, inp: null };
          try {
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
            if (lcpEntries.length) out.lcp = lcpEntries[lcpEntries.length - 1].startTime;
            for (const e of performance.getEntriesByType('layout-shift')) {
              if (!e.hadRecentInput) out.cls += e.value;
            }
            const evts = performance.getEntriesByType('event');
            if (evts.length) out.inp = Math.max(...evts.map(e => e.duration));
          } catch { /* best-effort only */ }
          resolve(out);
        }));
      } catch { /* leave vitals null → 'na' */ }

      return { a11y: scoreA11y(violations), vitals: scoreVitals(vitals), reason: null };
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    try { proc && process.kill(-proc.pid); } catch { /* already gone */ }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main(argv) {
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir)) { console.error('Usage: product-browser.mjs <product-dir> [--json] [--timeout ms]'); process.exit(2); }
  const ti = argv.indexOf('--timeout');
  const timeoutMs = ti > -1 ? parseInt(argv[ti + 1], 10) : DEFAULT_TIMEOUT_MS;

  const r = await runBrowserChecks(dir, { timeoutMs });
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(r, null, 2)); return; }
  console.log(`Browser checks — ${dir}`);
  console.log(`  a11y (axe-core)   ${r.a11y.signal === 'na' ? ' n/a' : `${Math.round(r.a11y.signal * 100)}/100`}  ${r.a11y.signal === 'na' ? '' : `(${r.a11y.violations} violations, ${r.a11y.critical} critical/serious)`}`);
  console.log(`  vitals (LCP/CLS/INP) ${r.vitals.signal === 'na' ? ' n/a' : `${Math.round(r.vitals.signal * 100)}/100`}  ${r.vitals.signal === 'na' ? '' : `lcp=${r.vitals.lcp}ms cls=${r.vitals.cls} inp=${r.vitals.inp}ms`}`);
  if (r.reason) console.log(`  (na reason: ${r.reason})`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
