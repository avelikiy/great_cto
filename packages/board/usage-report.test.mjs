import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { usageReports } from './lib/usage-report.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
test('cold statistics returns immediately and single-flights all window requests', async () => {
  let resolve, calls = 0;
  const reports = usageReports({ compute: () => { calls++; return new Promise(r => { resolve = r; }); } });
  assert.equal(reports.get(30).state, 'computing');
  assert.equal(reports.get(7).state, 'computing'); await tick(); assert.equal(calls, 1);
  resolve({ state: 'counted', tokens: 123 }); await tick();
  assert.equal(reports.get(30).tokens, 123);
  reports.get(7); await tick(); assert.equal(calls, 2);
  resolve({ state: 'counted' }); await tick();
});
test('refresh preserves counted data with explicit stale error and clears it on recovery', async () => {
  let time = 0, fail = false;
  const reports = usageReports({ now: () => time, ttlMs: 10, compute: async () => { if (fail) throw Error('private detail'); return { state: 'counted', tokens: 123 }; } });
  reports.get(30); await tick(); time = 11; fail = true;
  assert.equal(reports.get(30).tokens, 123); await tick();
  const stale = reports.get(30); assert.equal(stale.stale, true); assert.match(stale.refreshError, /failed/);
  assert.doesNotMatch(JSON.stringify(stale), /private detail/);
  time = 22; fail = false; reports.get(30); await tick(); assert.equal(reports.get(30).stale, false);
});
test('CPU-bound statistics worker does not block HTTP event loop scheduling', async () => {
  let worker;
  const reports = usageReports({ compute: () => new Promise((resolve, reject) => {
    worker = new Worker("const {parentPort}=require('node:worker_threads'); const end=Date.now()+300; while(Date.now()<end){}; parentPort.postMessage({state:'counted'});", { eval: true });
    worker.once('message', resolve); worker.once('error', reject);
  }) });
  try {
    reports.get(30); await tick();
    const start = Date.now(); await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(Date.now() - start < 200, 'main thread must stay responsive while statistics computes');
  } finally { await worker?.terminate(); }
});
test('Tools follows primary navigation; only footer consumes remaining vertical space', () => {
  const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  assert.match(html, /\.nav \{[^}]*flex: 0 0 auto/);
  assert.match(html, /\.sidebar-footer \{\s*margin-top: auto/);
  assert.ok(html.indexOf('id="nav-tablist"') < html.indexOf('id="tools-nav"'));
});
