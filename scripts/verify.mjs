#!/usr/bin/env node
/** Repo-local verification controller. Never merges, installs, approves or downloads. */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { measureResources, selectWorkers, planVerification, sourceSnapshot, watchSource, receiptCurrent, summarizeGate, preflight, runStep } from './lib/verification-lane.mjs';

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'node scripts/verify.mjs --mode feedback|final --base REF [--workers auto|1|2] [--plan]\nnode scripts/verify.mjs --check-receipt FILE';
async function main() {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--plan') { if (opts.plan) throw Error('duplicate option'); opts.plan = true; }
    else if (['--mode', '--base', '--workers', '--check-receipt'].includes(key) && args[i + 1] && !Object.hasOwn(opts, key.slice(2))) opts[key.slice(2)] = args[++i];
    else throw Error('unknown, duplicate or incomplete option');
  }
  if (opts['check-receipt']) {
    if (Object.keys(opts).length !== 1) throw Error('receipt check cannot execute tests');
    const current = receiptCurrent(JSON.parse(readFileSync(opts['check-receipt'], 'utf8')), cwd);
    console.log(JSON.stringify({ state: current ? 'source-current' : 'invalid', mergeEligible: false }));
    process.exitCode = current ? 0 : 1; return;
  }
  if (!['feedback', 'final'].includes(opts.mode) || !opts.base) throw Error('explicit mode and base required');
  const resources = selectWorkers({ ...measureResources(), requested: opts.workers || 'auto' });
  const plan = planVerification({ cwd, base: opts.base, workers: resources.workers });
  if (opts.plan) { console.log(JSON.stringify({ ...plan, mode: opts.mode, resources }, null, 2)); return; }
  const started = performance.now(), mode = opts.mode;
  const report = { version: 1, mode, startedAt: new Date().toISOString(), result: 'unknown', mergeEligible: false,
    plan, resources, steps: [], processQuiescenceAttested: false, independentReview: 'not-attested' };
  let guard;
  try {
    if (mode === 'final') { report.source = sourceSnapshot(cwd); guard = watchSource(cwd); }
    report.preflight = await preflight({ cwd, browserRequired: mode === 'final' || plan.browserRequired });
    if (report.preflight.state !== 'ready') { report.result = 'blocked'; return; }
    if (mode === 'feedback' && !plan.changed.length) { report.result = 'nothing-to-check'; return; }
    const evidence = mkdtempSync(join(tmpdir(), 'great-cto-verify-')); report.evidence = evidence;
    const steps = mode === 'final'
      ? [{ name: 'canonical-gate', command: 'bash', args: ['scripts/ci-local.sh', '--e2e', ...(resources.workers === 1 ? ['--serial'] : [])] }]
      : plan.steps;
    for (const [i, step] of steps.entries()) {
      const logFile = join(evidence, `step-${i}.log`);
      console.error(`verify: ${step.name}; log: ${logFile}`);
      const result = await runStep(step, { cwd, logFile, env: { ...process.env, GREAT_CTO_TEST_PLUGIN_DIR: cwd } });
      const text = readFileSync(logFile, 'utf8');
      report.steps.push({ ...result, logFile });
      if (result.code !== 0) { report.result = 'failed'; return; }
      if (mode === 'final') {
        Object.assign(report, summarizeGate({ code: result.code, text }));
        const plain = text.replace(/\u001b\[[0-9;]*m/g, '');
        if (!/^ CI-LOCAL: (?:ALL GATES GREEN|GREEN, \d+ TEST\(S\) SKIPPED — NOT CHECKED)\s*$/m.test(plain)) report.result = 'unknown';
      }
    }
    if (mode === 'feedback') report.result = !plan.tests.length ? 'full-required' : plan.fullRequired ? 'feedback-passed-full-required' : 'feedback-passed';
    if (mode === 'final') {
      // Flush fs.watch events before the final epoch check, including edit/revert.
      await new Promise(r => setImmediate(r));
      if (!guard.unchanged() || JSON.stringify(sourceSnapshot(cwd)) !== JSON.stringify(report.source)) { report.result = 'invalidated'; return; }
      report.postflight = await preflight({ cwd, browserRequired: true });
      if (report.postflight.state !== 'ready' || report.postflight.browser !== report.preflight.browser
        || !guard.unchanged() || JSON.stringify(sourceSnapshot(cwd)) !== JSON.stringify(report.source)) report.result = 'invalidated';
    }
  } catch (error) {
    report.result = mode === 'final' && report.source ? 'invalidated' : 'blocked';
    report.reason = error.message === 'final candidate must be clean, including untracked files' ? 'unclean-candidate' : 'verification-unavailable';
  } finally {
    guard?.close(); report.elapsedMs = Math.round(performance.now() - started); report.finishedAt = new Date().toISOString();
    if (report.evidence) writeFileSync(join(report.evidence, 'receipt.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = ['passed', 'passed-with-not-checked', 'feedback-passed', 'feedback-passed-full-required', 'nothing-to-check'].includes(report.result) ? 0 : 1;
  }
}
main().catch(() => { console.error(usage); process.exitCode = 2; });
