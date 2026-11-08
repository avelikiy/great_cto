// The gate reports what the machine was doing during a run, so a red under strain
// can be told from a red in the code. great_cto-tbnc: 12 CPU burners, then CPU plus
// disk contention, did not reproduce the reds, so the cause has to be measured on a
// real one. The report never changes the gate's result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { summarize, assess, report, readSamples, PS_DEADLINE_MS } from '../../scripts/lib/gate-machine.mjs';

const s = (ps_ms, extra = {}) => ({ ts: '2026-11-08T09:00:00Z', ps_ms, load1: 4, mem_free_pct: 50, swap_used_mb: 100, ...extra });

test('the strain line is the deadline the process-inventory tests really have', () => {
  const src = readFileSync(new URL('../../scripts/lib/browser-guardian-resources.mjs', import.meta.url), 'utf8');
  assert.match(src, new RegExp(`timeout:${PS_DEADLINE_MS},`));
});

test('summarize keeps the worst of each column and ignores what one sample could not read', () => {
  const m = summarize([s(70, { load1: 3 }), s(1500, { load1: 22, mem_free_pct: 9, swap_used_mb: 5000 }), s(null, { load1: null, mem_free_pct: null, swap_used_mb: null })]);
  assert.deepEqual(m, { samples: 3, ps_ms_max: 1500, ps_over_deadline: 1, load1_max: 22, mem_free_min: 9, swap_used_max: 5000 });
});

test('assess: at the deadline is strained, one millisecond under is not, no ps reading is unknown', () => {
  assert.equal(assess(summarize([s(PS_DEADLINE_MS)])), 'strained');
  assert.equal(assess(summarize([s(PS_DEADLINE_MS - 1)])), 'no-strain-seen');
  assert.equal(assess(summarize([s(null)])), 'not-measured');
  assert.equal(assess(summarize([])), 'not-measured');
});

test('a failed read is reported as not measured, never as a calm machine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-machine-'));
  try {
    assert.equal(readSamples(join(dir, 'absent.jsonl')), null);
    mkdirSync(join(dir, 'a-directory'));
    assert.equal(readSamples(join(dir, 'a-directory')), null);
    const text = report(null, 'red');
    assert.match(text, /not measured/);
    assert.doesNotMatch(text, /no strain/);
    const file = join(dir, 's.jsonl');
    writeFileSync(file, `${JSON.stringify(s(80))}\nnot json\n${JSON.stringify(s(90))}\n`);
    assert.equal(readSamples(file).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('red under strain says so and keeps the gate red; red without strain names no culprit', () => {
  const strained = report([s(1800)], 'red');
  assert.match(strained, /1800 ms/);
  assert.match(strained, /stays red/);
  const calm = report([s(90)], 'red');
  assert.match(calm, /no strain seen/);
  assert.match(calm, /not judged/); // memory is unjudged, so a calm listing cannot blame the code
  assert.doesNotMatch(calm, /failure in the code/);
  assert.doesNotMatch(calm, /stays red/);
  const green = report([s(90)], 'green');
  assert.match(green, /machine during this run/);
  assert.doesNotMatch(green, /code|stays red/);
});

test('the report command always exits 0, even on an unusable file', () => {
  const script = new URL('../../scripts/lib/gate-machine.mjs', import.meta.url).pathname;
  const out = execFileSync(process.execPath, [script, 'report', '--file', '/nonexistent/samples', '--result', 'red'], { encoding: 'utf8' });
  assert.match(out, /not measured/);
});

test('ci-local starts the sampler, stops it on exit, and reports without touching FAIL', () => {
  const ci = readFileSync(new URL('../../scripts/ci-local.sh', import.meta.url), 'utf8');
  assert.match(ci, /gate-machine\.mjs sample --out "\$RESULTS_DIR\/machine\.jsonl"/);
  assert.match(ci, /^trap '.*GATE_MACHINE_PID.*' EXIT$/m);
  const line = ci.split('\n').find((l) => l.includes('gate-machine.mjs report'));
  assert.ok(line, 'the report is printed');
  assert.match(line, /\|\| true$/);
});
