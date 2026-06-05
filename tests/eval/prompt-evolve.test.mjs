// tests/eval/prompt-evolve.test.mjs — Unit tests for scripts/prompt-evolve.mjs
//
// Run: node --test tests/eval/prompt-evolve.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computePromptHash, buildGeneration, appendGeneration, readLedger, ledgerPath,
} from '../../scripts/prompt-evolve.mjs';
import { evaluateGate } from '../../scripts/eval-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'prompt-evolve.mjs');
const r = (eval_, rate, extra = {}) => ({ eval: eval_, rate, split: 'holdout', ...extra });

function tmp() { return mkdtempSync(join(tmpdir(), 'evolve-')); }

// ── computePromptHash ─────────────────────────────────────────────────────────

test('computePromptHash: deterministic sha256', () => {
  assert.equal(computePromptHash('abc'), computePromptHash('abc'));
  assert.notEqual(computePromptHash('abc'), computePromptHash('abd'));
  assert.match(computePromptHash('abc'), /^[0-9a-f]{64}$/);
});

// ── buildGeneration ───────────────────────────────────────────────────────────

test('buildGeneration: promoted when gate passes', () => {
  const gate = evaluateGate([r('a', 0.8)], [r('a', 0.9)]);
  const g = buildGeneration({ agent: 'x', gen: 2, promptHash: 'h', lesson: 'L', gate });
  assert.equal(g.verdict, 'promoted');
  assert.equal(g.gen, 2);
  assert.equal(g.lesson, 'L');
});

test('buildGeneration: rejected when gate fails (regression)', () => {
  const gate = evaluateGate([r('a', 0.9)], [r('a', 0.6)]);
  const g = buildGeneration({ agent: 'x', gen: 2, promptHash: 'h', gate });
  assert.equal(g.verdict, 'rejected');
  assert.equal(g.gate.regressions.length, 1);
});

// ── ledger I/O ────────────────────────────────────────────────────────────────

test('appendGeneration + readLedger round-trip', () => {
  const root = tmp();
  const gate = evaluateGate([r('a', 0.8)], [r('a', 0.85)]);
  appendGeneration(buildGeneration({ agent: 'sec', gen: 1, promptHash: 'h1', gate, ts: '2026-01-01T00:00:00Z' }), root);
  appendGeneration(buildGeneration({ agent: 'sec', gen: 2, promptHash: 'h2', gate, ts: '2026-01-02T00:00:00Z' }), root);
  const gens = readLedger('sec', root);
  assert.equal(gens.length, 2);
  assert.equal(gens[0].gen, 1);
  assert.equal(gens[1].promptHash, 'h2');
});

test('readLedger: empty for unknown agent', () => {
  assert.deepEqual(readLedger('nobody', tmp()), []);
});

// ── CLI record ────────────────────────────────────────────────────────────────

function writeJsonl(dir, name, rows) {
  const p = join(dir, name);
  writeFileSync(p, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  return p;
}

test('CLI record: promote exits 0 and writes ledger', () => {
  const dir = tmp();
  const promptFile = join(dir, 'agent.md');
  writeFileSync(promptFile, '# prompt v1\n');
  const base = writeJsonl(dir, 'base.jsonl', [r('a', 0.8)]);
  const cand = writeJsonl(dir, 'cand.jsonl', [r('a', 0.9)]);
  const res = spawnSync(process.execPath, [
    SCRIPT, 'record', '--agent', 'demo', '--gen', '2',
    '--prompt-file', promptFile, '--lesson', 'tighten refusal',
    '--baseline', base, '--candidate', cand, '--root', dir,
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(res.stdout.includes('PROMOTED'));
  const ledger = readFileSync(ledgerPath('demo', dir), 'utf8');
  assert.ok(ledger.includes('"verdict":"promoted"'));
  assert.ok(ledger.includes('tighten refusal'));
});

test('CLI record: regression exits 1 (REJECTED), still records', () => {
  const dir = tmp();
  const promptFile = join(dir, 'agent.md');
  writeFileSync(promptFile, '# prompt v2 worse\n');
  const base = writeJsonl(dir, 'base.jsonl', [r('a', 0.9)]);
  const cand = writeJsonl(dir, 'cand.jsonl', [r('a', 0.6)]);
  const res = spawnSync(process.execPath, [
    SCRIPT, 'record', '--agent', 'demo', '--gen', '2',
    '--prompt-file', promptFile, '--baseline', base, '--candidate', cand, '--root', dir,
  ], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.ok(res.stdout.includes('REJECTED'));
  assert.equal(readLedger('demo', dir).length, 1);
});

test('CLI record: missing args exits 2', () => {
  const res = spawnSync(process.execPath, [SCRIPT, 'record', '--agent', 'x'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});

test('CLI log: lists recorded generations', () => {
  const dir = tmp();
  const gate = evaluateGate([r('a', 0.8)], [r('a', 0.9)]);
  appendGeneration(buildGeneration({ agent: 'demo', gen: 1, promptHash: 'abc123abc123', lesson: 'first', gate, ts: '2026-01-01T00:00:00Z' }), dir);
  const res = spawnSync(process.execPath, [SCRIPT, 'log', '--agent', 'demo', '--root', dir], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.ok(res.stdout.includes('gen 1'));
  assert.ok(res.stdout.includes('first'));
});
