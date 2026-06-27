// tests/lib/metrics-trend.test.mjs — DEEPEN W2 metrics persistence + drift.
// Run: node --test tests/lib/metrics-trend.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHistory, detectDrift } from '../../scripts/lib/metrics-trend.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL = join(__dirname, '..', '..', 'scripts', 'lib', 'metrics-trend.mjs');

test('parseHistory: keeps well-formed rows, skips junk', () => {
  const text = '{"key":"a","value":1}\n\n{bad}\n{"key":"b","value":0.5}\n{"key":"c"}\n';
  const rows = parseHistory(text);
  assert.equal(rows.length, 2);
});

test('detectDrift: stable series → no alert', () => {
  const rows = [0.9, 0.91, 0.9, 0.92, 0.9].map(v => ({ key: 'eval', value: v }));
  const d = detectDrift(rows, { window: 5, threshold: 0.1 })[0];
  assert.equal(d.alert, false);
});

test('detectDrift: a big drop trips the alert', () => {
  const rows = [0.9, 0.92, 0.9, 0.91, 0.6].map(v => ({ key: 'eval', value: v }));
  const d = detectDrift(rows, { window: 5, threshold: 0.1 })[0];
  assert.ok(d.drift < -0.1);
  assert.equal(d.alert, true);
});

test('detectDrift: single point → no baseline, no alert', () => {
  const d = detectDrift([{ key: 'x', value: 0.5 }])[0];
  assert.equal(d.baseline, null);
  assert.equal(d.alert, false);
});

test('detectDrift: separate keys tracked independently', () => {
  const rows = [
    { key: 'a', value: 0.9 }, { key: 'b', value: 0.4 },
    { key: 'a', value: 0.9 }, { key: 'b', value: 0.1 },
  ];
  const ds = detectDrift(rows, { window: 5, threshold: 0.1 });
  const a = ds.find(d => d.key === 'a'); const b = ds.find(d => d.key === 'b');
  assert.equal(a.alert, false);
  assert.equal(b.alert, true);
});

// ── CLI: record then check round-trip ─────────────────────────────────────────

test('CLI: record (flat + json) persists, check reports drift', () => {
  const dir = mkdtempSync(join(tmpdir(), 'metrics-'));
  const env = { ...process.env, GREAT_CTO_DIR: dir };

  // seed a stable baseline then a crash
  for (const v of [0.9, 0.91, 0.9, 0.92]) {
    spawnSync(process.execPath, [TOOL, 'record', '--key', 'eval_pass_rate', '--value', String(v)], { env, encoding: 'utf8' });
  }
  // json form records multiple metrics
  const j = spawnSync(process.execPath, [TOOL, 'record', '--json', '{"eval_pass_rate":0.55,"r2_share":0.45}', '--source', 'gov'], { env, encoding: 'utf8' });
  assert.equal(j.status, 0, j.stdout + j.stderr);
  assert.ok(existsSync(join(dir, 'metrics-history.jsonl')));

  const check = spawnSync(process.execPath, [TOOL, 'check', '--window', '5', '--threshold', '0.1'], { env, encoding: 'utf8' });
  assert.equal(check.status, 1, 'the 0.92→0.55 drop should alert');
  assert.ok(check.stdout.includes('eval_pass_rate'));
});

test('CLI: check with no history exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'metrics-empty-'));
  const env = { ...process.env, GREAT_CTO_DIR: dir };
  const res = spawnSync(process.execPath, [TOOL, 'check'], { env, encoding: 'utf8' });
  assert.equal(res.status, 0);
});
