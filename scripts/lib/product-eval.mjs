// scripts/lib/product-eval.mjs — EXECUTED product quality (the ceiling).
//
// product-score.mjs measures the *presence* of quality machinery (a floor). This
// EXECUTES it: runs the product's tests, typecheck, lint, dependency audit and a
// secret scan, and turns the real results into a measured 0-100 score. Presence ≠
// excellence — this is "does it actually work + is it clean", not "does it have the shape".
//
// Pure scoreExecution(results) is unit-tested; runEval(dir) spawns the real commands.
//
// Usage:
//   node scripts/lib/product-eval.mjs <product-dir> [--json]
//   node scripts/lib/product-eval.mjs <dir> --gate --min 70 [--baseline prev.json]   # exit 1 if below/regressed
//   node scripts/lib/product-eval.mjs <dir> --browser   # F6a/F6b: opt-in headless a11y + Web Vitals signals

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBrowserChecks } from './product-browser.mjs';

/** Weights sum to 100. n/a dimensions score full (nothing to fail) so a zero-dep
 *  .mjs product isn't punished for lacking a tsconfig/lint/lockfile. */
export const EXEC_RUBRIC = Object.freeze([
  { key: 'tests',     weight: 45, label: 'Tests pass (executed)' },
  { key: 'typecheck', weight: 15, label: 'Typecheck clean' },
  { key: 'lint',      weight: 10, label: 'Lint clean' },
  { key: 'deps',      weight: 15, label: 'No high/critical vulns' },
  { key: 'secrets',   weight: 15, label: 'No leaked secrets' },
]);

/**
 * Pure. results: { tests:{ran,passed,total,failed}, typecheck:'pass'|'fail'|'na',
 * lint:'pass'|'fail'|'na', auditHigh:number|null, secretLeak:boolean }
 * @returns {{total,grade,breakdown}}
 */
export function scoreExecution(results = {}) {
  const sig = {};
  const t = results.tests || {};
  sig.tests = !t.ran ? 0 : (t.total > 0 ? (t.total - (t.failed || 0)) / t.total : 0);
  sig.typecheck = results.typecheck === 'fail' ? 0 : 1;   // pass | na → 1
  sig.lint = results.lint === 'fail' ? 0 : 1;             // pass | na → 1
  sig.deps = results.auditHigh == null ? 1 : (results.auditHigh === 0 ? 1 : Math.max(0, 1 - results.auditHigh * 0.34));
  sig.secrets = results.secretLeak ? 0 : 1;

  const breakdown = EXEC_RUBRIC.map(d => {
    const s = Math.max(0, Math.min(1, sig[d.key] ?? 0));
    return { key: d.key, label: d.label, weight: d.weight, signal: round2(s), points: round2(s * d.weight) };
  });
  const total = Math.round(breakdown.reduce((a, b) => a + b.points, 0));
  return { total, grade: grade(total), breakdown };
}

function round2(n) { return Math.round(n * 100) / 100; }
function grade(t) { return t >= 90 ? 'A' : t >= 75 ? 'B' : t >= 60 ? 'C' : t >= 45 ? 'D' : 'F'; }

// ── execution (run the real commands in the product dir) ──────────────────────

function run(cmd, args, cwd, timeout = 180000) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Parse node:test / TAP counts from stdout. */
/**
 * Extract test counts from a runner's summary. Returns all-nulls when the shape
 * is unrecognised — the caller MUST treat that as "not measured", never as a
 * result. Matching only node:test here is what let a vitest suite of 269 passing
 * tests be scored as "1 test, and it failed" (see RESCORE-2026-07-19).
 *
 * Supported summaries:
 *   node:test / TAP   `# tests 79` / `# pass 77` / `# fail 2`
 *   vitest            `Tests  70 failed | 62 passed (132)`  ·  `Tests  157 passed (157)`
 *   jest              `Tests:  1 failed, 195 passed, 196 total`
 */
export function parseTestCounts(out) {
  const text = String(out ?? '');
  const grab = (re) => { const m = text.match(re); return m ? parseInt(m[1], 10) : null; };

  // node:test / TAP — line-anchored counters.
  const tapTotal = grab(/^[#ℹ]\s*tests\s+(\d+)/m);
  if (tapTotal != null) {
    return { total: tapTotal, pass: grab(/^[#ℹ]\s*pass\s+(\d+)/m), fail: grab(/^[#ℹ]\s*fail\s+(\d+)/m) };
  }

  // vitest — the `Tests` line, not `Test Files` (which counts files, not cases).
  // Anchor on `Tests` NOT preceded by `Test Files`, then read its segments.
  const vitest = text.match(/^\s*Tests\s+(.+)$/m);
  if (vitest) {
    const seg = vitest[1];
    const num = (re) => { const m = seg.match(re); return m ? parseInt(m[1], 10) : null; };
    const pass = num(/(\d+)\s+passed/);
    const fail = num(/(\d+)\s+failed/) ?? 0;
    // Trailing "(N)" is the authoritative total; fall back to pass+fail.
    const total = num(/\((\d+)\)\s*$/) ?? (pass != null ? pass + fail : null);
    if (total != null) return { total, pass: pass ?? total - fail, fail };
  }

  // jest — `Tests:  1 failed, 195 passed, 196 total`
  const jest = text.match(/^\s*Tests:\s+(.+)$/m);
  if (jest) {
    const seg = jest[1];
    const num = (re) => { const m = seg.match(re); return m ? parseInt(m[1], 10) : null; };
    const total = num(/(\d+)\s+total/);
    if (total != null) {
      const fail = num(/(\d+)\s+failed/) ?? 0;
      return { total, pass: num(/(\d+)\s+passed/) ?? total - fail, fail };
    }
  }

  return { total: null, pass: null, fail: null };
}

/** Execute checks in a product dir → results for scoreExecution. */
export function runEval(dir) {
  const pkgPath = join(dir, 'package.json');
  let pkg = {};
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { /* none */ }
  const scripts = pkg.scripts || {};

  // tests — run `npm test` if a test script exists; exit code is the source of truth.
  // `ran` means "we obtained real counts", NOT "we launched something". A suite
  // whose summary we cannot read tells us nothing about the pass rate, so we
  // report not-measured and let the scorer null out — inventing "1 test, and it
  // failed" is how 269 passing tests once scored 0/1 (RESCORE-2026-07-19).
  let tests = { ran: false, total: 0, passed: 0, failed: 0, reason: 'no-test-script' };
  if (scripts.test) {
    const r = run('npm', ['test', '--silent'], dir);
    const c = parseTestCounts((r.stdout || '') + (r.stderr || ''));
    if (c.total != null) {
      const fail = c.fail ?? 0;
      tests = { ran: true, total: c.total, passed: c.pass ?? (c.total - fail), failed: fail, reason: null };
    } else {
      tests = {
        ran: false, total: 0, passed: 0, failed: 0,
        reason: r.status === 0 ? 'no-readable-summary' : 'suite-did-not-report',
      };
    }
  }

  // typecheck — only if a tsconfig exists
  let typecheck = 'na';
  if (existsSync(join(dir, 'tsconfig.json'))) {
    const r = scripts.typecheck ? run('npm', ['run', 'typecheck', '--silent'], dir) : run('npx', ['--no-install', 'tsc', '--noEmit'], dir);
    typecheck = r.status === 0 ? 'pass' : 'fail';
  }

  // lint — only if a lint script exists
  let lint = 'na';
  if (scripts.lint) { lint = run('npm', ['run', 'lint', '--silent'], dir).status === 0 ? 'pass' : 'fail'; }

  // deps — npm audit only if a lockfile exists
  let auditHigh = null;
  if (existsSync(join(dir, 'package-lock.json'))) {
    const r = run('npm', ['audit', '--json'], dir, 60000);
    try { const a = JSON.parse(r.stdout || '{}'); const v = a.metadata?.vulnerabilities || {}; auditHigh = (v.high || 0) + (v.critical || 0); }
    catch { auditHigh = null; }
  }

  // secrets — light scan over source
  const secretLeak = scanSecrets(dir);

  return { tests, typecheck, lint, auditHigh, secretLeak };
}

function scanSecrets(dir) {
  const re = /(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|password\s*[=:]\s*['"][^'"]{6,})/;
  const skip = new Set(['node_modules', '.git', 'dist', '.next']);
  const stack = [dir]; let n = 0;
  while (stack.length && n < 400) {
    let entries; try { entries = readdirSync(stack.pop(), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(e.path ?? dir, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) stack.push(p); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|env|json|ya?ml)$/.test(e.name)) continue;
      if (/\.env\.(example|sample|template)$/.test(e.name)) continue; // placeholders ok
      if (++n > 400) break;
      try { if (re.test(readFileSync(p, 'utf8'))) return true; } catch { /* ignore */ }
    }
  }
  return false;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main(argv) {
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) { console.error('Usage: product-eval.mjs <dir> [--json] [--gate --min N [--baseline f]] [--browser]'); process.exit(2); }

  const results = runEval(dir);
  const res = scoreExecution(results);

  // F6a/F6b: opt-in browser signals (a11y + Web Vitals). Additive report only — never
  // folds into res.total's fixed EXEC_RUBRIC weights (doc non-goal: "add signals,
  // don't shift weights"). Zero cost when --browser isn't passed: runBrowserChecks is
  // never even imported-and-called in that case beyond the static import above, which
  // has no side effects until invoked.
  let browser = null;
  if (argv.includes('--browser')) browser = await runBrowserChecks(dir);

  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ dir, ...res, results, ...(browser ? { browser } : {}) }, null, 2)); }
  else {
    console.log(`Executed quality — ${dir}`);
    for (const b of res.breakdown) console.log(`  ${b.label.padEnd(26)} ${'█'.repeat(Math.round(b.signal * 10)).padEnd(10, '·')} ${b.points}/${b.weight}`);
    console.log(`  tests: ${results.tests.ran ? `${results.tests.passed}/${results.tests.total} pass` : 'no test script'} · typecheck ${results.typecheck} · lint ${results.lint} · vulns ${results.auditHigh ?? 'n/a'} · secrets ${results.secretLeak ? 'LEAK' : 'clean'}`);
    console.log(`\n  EXECUTED SCORE: ${res.total}/100  (grade ${res.grade})`);
    if (browser) {
      const a11y = browser.a11y.signal === 'na' ? 'n/a' : `${Math.round(browser.a11y.signal * 100)}/100 (${browser.a11y.violations} violations)`;
      const vitals = browser.vitals.signal === 'na' ? 'n/a' : `${Math.round(browser.vitals.signal * 100)}/100`;
      console.log(`  browser: a11y ${a11y} · vitals ${vitals}${browser.reason ? ` (${browser.reason})` : ''}`);
    }
  }

  // gate mode (#2)
  if (argv.includes('--gate')) {
    const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
    const min = parseFloat(get('--min') || '70');
    let fail = res.total < min, reason = res.total < min ? `score ${res.total} < min ${min}` : '';
    const bl = get('--baseline');
    if (bl && existsSync(bl)) {
      try { const prev = JSON.parse(readFileSync(bl, 'utf8')).total; if (typeof prev === 'number' && res.total < prev - 2) { fail = true; reason = `regression ${res.total} < baseline ${prev}`; } } catch { /* ignore */ }
    }
    if (fail) { console.error(`\ngate:quality BLOCK — ${reason}`); process.exit(1); }
    console.log('\ngate:quality PASS');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
