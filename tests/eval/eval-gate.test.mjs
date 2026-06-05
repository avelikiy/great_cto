// tests/eval/eval-gate.test.mjs — Unit tests for scripts/eval-gate.mjs
//
// Run: node --test tests/eval/eval-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateGate, parseResultsJsonl } from '../../scripts/eval-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE = join(__dirname, '..', '..', 'scripts', 'eval-gate.mjs');

const r = (eval_, rate, extra = {}) => ({ eval: eval_, rate, split: 'holdout', ...extra });

// ── parseResultsJsonl ─────────────────────────────────────────────────────────

test('parseResultsJsonl: parses lines, skips blanks and malformed', () => {
  const text = '{"eval":"a","rate":1}\n\n{bad json}\n{"eval":"b","rate":0.5}\n';
  const out = parseResultsJsonl(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].eval, 'a');
  assert.equal(out[1].eval, 'b');
});

// ── evaluateGate: core decisions ──────────────────────────────────────────────

test('evaluateGate: equal rates → promote', () => {
  const g = evaluateGate([r('a', 0.8)], [r('a', 0.8)]);
  assert.equal(g.pass, true);
  assert.equal(g.regressions.length, 0);
});

test('evaluateGate: candidate better → promote with improvement', () => {
  const g = evaluateGate([r('a', 0.6)], [r('a', 0.9)]);
  assert.equal(g.pass, true);
  assert.equal(g.improvements.length, 1);
  assert.equal(g.improvements[0].delta, 0.3);
});

test('evaluateGate: candidate regresses → block', () => {
  const g = evaluateGate([r('a', 0.9)], [r('a', 0.7)]);
  assert.equal(g.pass, false);
  assert.equal(g.regressions.length, 1);
  assert.equal(g.regressions[0].eval, 'a');
});

test('evaluateGate: epsilon tolerates tiny drop', () => {
  const g = evaluateGate([r('a', 0.90)], [r('a', 0.89)], { epsilon: 0.02 });
  assert.equal(g.pass, true, 'within epsilon should not block');
  assert.equal(g.regressions.length, 0);
});

test('evaluateGate: drop beyond epsilon still blocks', () => {
  const g = evaluateGate([r('a', 0.90)], [r('a', 0.80)], { epsilon: 0.02 });
  assert.equal(g.pass, false);
});

test('evaluateGate: candidate below its own threshold → block even if no baseline', () => {
  const g = evaluateGate([], [r('a', 0.5, { threshold: 0.8 })]);
  assert.equal(g.pass, false);
  assert.equal(g.belowThreshold.length, 1);
});

test('evaluateGate: belowThreshold flag honored', () => {
  const g = evaluateGate([r('a', 0.9)], [r('a', 0.85, { belowThreshold: true })]);
  assert.equal(g.pass, false);
  assert.equal(g.belowThreshold.length, 1);
});

test('evaluateGate: missing-in-candidate reported, does not block', () => {
  const g = evaluateGate([r('a', 0.9), r('b', 0.9)], [r('a', 0.9)]);
  assert.equal(g.pass, true);
  assert.deepEqual(g.missing, ['b']);
});

test('evaluateGate: split filter restricts comparison', () => {
  const base = [r('a', 0.9, { split: 'holdout' }), r('a', 0.2, { split: 'tuning' })];
  const cand = [r('a', 0.9, { split: 'holdout' }), r('a', 0.1, { split: 'tuning' })];
  // Only holdout considered → equal → promote (tuning regression ignored)
  const g = evaluateGate(base, cand, { split: 'holdout' });
  assert.equal(g.pass, true);
});

test('evaluateGate: multiple evals, one regression blocks the whole set', () => {
  const g = evaluateGate(
    [r('a', 0.9), r('b', 0.9)],
    [r('a', 0.95), r('b', 0.6)],
  );
  assert.equal(g.pass, false);
  assert.equal(g.regressions.length, 1);
  assert.equal(g.improvements.length, 1);
});

// ── CLI ───────────────────────────────────────────────────────────────────────

function writeJsonl(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'evalgate-'));
  const path = join(dir, `${Math.abs(hash(JSON.stringify(rows)))}.jsonl`);
  writeFileSync(path, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  return path;
}
function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }

test('CLI: promote exits 0', () => {
  const base = writeJsonl([r('a', 0.8)]);
  const cand = writeJsonl([r('a', 0.9)]);
  const res = spawnSync(process.execPath, [GATE, '--baseline', base, '--candidate', cand], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(res.stdout.includes('PROMOTE'));
});

test('CLI: regression exits 1', () => {
  const base = writeJsonl([r('a', 0.9)]);
  const cand = writeJsonl([r('a', 0.6)]);
  const res = spawnSync(process.execPath, [GATE, '--baseline', base, '--candidate', cand], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.ok(res.stdout.includes('BLOCK'));
});

test('CLI: missing args exits 2', () => {
  const res = spawnSync(process.execPath, [GATE, '--baseline', 'x.jsonl'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
