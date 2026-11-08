#!/usr/bin/env node
/**
 * What the machine was doing during a ci-local run.
 *
 *   node scripts/lib/gate-machine.mjs sample --out <file> [--interval-ms 5000]
 *   node scripts/lib/gate-machine.mjs report --file <file> --result green|skipped|red
 *
 * Reds with no code cause kept arriving while other sessions ran an emulator and
 * Gradle, and each cost a 15-minute rerun. CPU burners and CPU plus disk contention
 * did not reproduce them (great_cto-tbnc, 2026-11-08), so the cause has to be read
 * off a real red. One column is judged: how long the process listing takes, because
 * the process-inventory tests give it a fixed deadline. The rest is printed as found.
 *
 * A report only: it never changes the gate's result, and it never says the machine
 * was fine when it could not look.
 */
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { isMainModule } from './is-main.mjs';

/** The timeout scripts/lib/browser-guardian-resources.mjs gives /bin/ps. */
export const PS_DEADLINE_MS = 1000;
/** Long enough to record a listing far over the deadline, short enough to keep sampling. */
const PS_OBSERVE_MS = 10_000;
/** A gate that dies without running its trap must not leave a sampler behind for long. */
const MAX_LIFETIME_MS = 3 * 3600_000;

function run(cmd, args, timeout = 2000) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 && !r.error ? r.stdout : null;
}

function memoryFreePct() {
  const m = /free percentage:\s*(\d+)%/.exec(run('/usr/bin/memory_pressure', ['-Q']) || '');
  return m ? Number(m[1]) : null;
}

function swapUsedMb() {
  const m = /used\s*=\s*([\d.]+)M/.exec(run('/usr/sbin/sysctl', ['-n', 'vm.swapusage']) || '');
  return m ? Math.round(Number(m[1])) : null;
}

/** The same listing the inventory tests time. A timeout records the time it was given. */
function psMs() {
  const t0 = performance.now();
  const r = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,uid=,pgid=,stat=,lstart='], {
    encoding: 'utf8', timeout: PS_OBSERVE_MS, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.error && r.error.code !== 'ETIMEDOUT') return null;
  return Math.round(performance.now() - t0);
}

export function takeSample(now = Date.now()) {
  return { ts: new Date(now).toISOString(), ps_ms: psMs(), load1: Math.round(os.loadavg()[0] * 10) / 10, mem_free_pct: memoryFreePct(), swap_used_mb: swapUsedMb() };
}

/** Samples, or null when the file cannot be read. A bad line does not hide the rest. */
export function readSamples(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const v = JSON.parse(line); if (v && typeof v === 'object') out.push(v); } catch { /* skip the line */ }
  }
  return out;
}

export function summarize(samples) {
  const col = (k) => samples.map((s) => s[k]).filter((v) => Number.isFinite(v));
  const pick = (fn, k) => { const v = col(k); return v.length ? fn(...v) : null; };
  return {
    samples: samples.length,
    ps_ms_max: pick(Math.max, 'ps_ms'),
    ps_over_deadline: col('ps_ms').filter((v) => v >= PS_DEADLINE_MS).length,
    load1_max: pick(Math.max, 'load1'),
    mem_free_min: pick(Math.min, 'mem_free_pct'),
    swap_used_max: pick(Math.max, 'swap_used_mb'),
  };
}

export function assess(m) {
  if (m.ps_ms_max === null) return 'not-measured';
  return m.ps_over_deadline > 0 ? 'strained' : 'no-strain-seen';
}

const shown = (v, unit = '') => (v === null ? 'n/a' : `${v}${unit}`);

export function report(samples, result) {
  if (samples === null) return '   machine during this run: not measured (no readable samples)\n';
  const m = summarize(samples);
  const state = assess(m);
  if (state === 'not-measured') return '   machine during this run: not measured (no process listing was timed)\n';
  let text = `   machine during this run: process listing up to ${m.ps_ms_max} ms (tests allow ${PS_DEADLINE_MS}), `
    + `load up to ${shown(m.load1_max)}, memory free down to ${shown(m.mem_free_min, '%')}, `
    + `swap up to ${shown(m.swap_used_max, ' MB')}, ${m.samples} samples\n`;
  if (result === 'red' && state === 'strained') {
    text += `   ⚠ the machine was strained: ${m.ps_over_deadline} sample(s) at or over the deadline. A test with a fixed deadline may have failed on the machine rather than the code. The gate stays red: rerun on a quiet machine.\n`;
  } else if (result === 'red') {
    text += '   no strain seen in the samples: read this red as a failure in the code until shown otherwise.\n';
  }
  return text;
}

function sampleLoop(out, intervalMs) {
  const parent = process.ppid;
  const started = Date.now();
  const tick = () => {
    if (process.ppid !== parent || Date.now() - started > MAX_LIFETIME_MS) process.exit(0);
    try { fs.appendFileSync(out, `${JSON.stringify(takeSample())}\n`); } catch { process.exit(0); }
  };
  tick();
  setInterval(tick, intervalMs);
}

if (isMainModule(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  if (process.argv[2] === 'sample') {
    sampleLoop(arg('--out'), Number(arg('--interval-ms')) || 5000);
  } else {
    try { process.stdout.write(report(readSamples(arg('--file')), arg('--result'))); }
    catch (e) { process.stdout.write(`   machine during this run: not measured (${e.message})\n`); }
    process.exit(0);
  }
}
