// tests/eval/agent-changelog.test.mjs — Unit tests for scripts/agent-changelog.mjs
//
// Run: node --test tests/eval/agent-changelog.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderChangelog, summarizeDelta } from '../../scripts/agent-changelog.mjs';
import { buildGeneration, appendGeneration } from '../../scripts/prompt-evolve.mjs';
import { evaluateGate } from '../../scripts/eval-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'agent-changelog.mjs');
const r = (eval_, rate, extra = {}) => ({ eval: eval_, rate, split: 'holdout', ...extra });
function tmp() { return mkdtempSync(join(tmpdir(), 'changelog-')); }

// ── summarizeDelta ────────────────────────────────────────────────────────────

test('summarizeDelta: promoted with improvements', () => {
  const gate = evaluateGate([r('a', 0.6)], [r('a', 0.9)]);
  const g = buildGeneration({ agent: 'x', gen: 2, promptHash: 'h', gate });
  assert.match(summarizeDelta(g), /improved/);
});

test('summarizeDelta: rejected mentions regression', () => {
  const gate = evaluateGate([r('a', 0.9)], [r('a', 0.6)]);
  const g = buildGeneration({ agent: 'x', gen: 2, promptHash: 'h', gate });
  assert.match(summarizeDelta(g), /regression/);
});

// ── renderChangelog ───────────────────────────────────────────────────────────

test('renderChangelog: empty ledger → placeholder', () => {
  const md = renderChangelog('x', []);
  assert.match(md, /No evolution generations recorded/);
});

test('renderChangelog: table row per generation + provenance', () => {
  const gateUp = evaluateGate([r('a', 0.6)], [r('a', 0.9)]);
  const gens = [
    buildGeneration({ agent: 'sec', gen: 1, promptHash: 'aaaa1111', lesson: 'baseline', gate: gateUp, ts: '2026-01-01T00:00:00Z' }),
    buildGeneration({ agent: 'sec', gen: 2, promptHash: 'bbbb2222', parentHash: 'aaaa1111', lesson: 'tighten refusal', gate: gateUp, ts: '2026-02-01T00:00:00Z' }),
  ];
  const md = renderChangelog('sec', gens);
  assert.match(md, /Evolutionary changelog — sec/);
  assert.match(md, /Generations:\*\* 2/);
  assert.match(md, /tighten refusal/);
  assert.match(md, /Current prompt provenance/);
  assert.match(md, /bbbb2222/); // latest promoted hash
});

test('renderChangelog: escapes pipe chars in lesson', () => {
  const gate = evaluateGate([r('a', 0.8)], [r('a', 0.9)]);
  const g = buildGeneration({ agent: 'x', gen: 1, promptHash: 'h', lesson: 'a | b | c', gate, ts: '2026-01-01T00:00:00Z' });
  const md = renderChangelog('x', [g]);
  assert.ok(md.includes('a \\| b \\| c'));
});

// ── CLI ───────────────────────────────────────────────────────────────────────

test('CLI: --write produces changelog file', () => {
  const root = tmp();
  const reviews = tmp();
  const gate = evaluateGate([r('a', 0.6)], [r('a', 0.9)]);
  appendGeneration(buildGeneration({ agent: 'demo', gen: 1, promptHash: 'h1h1h1h1', lesson: 'first lesson', gate, ts: '2026-01-01T00:00:00Z' }), root);
  const res = spawnSync(process.execPath, [
    SCRIPT, '--agent', 'demo', '--root', root, '--reviews-root', reviews, '--write',
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(res.stdout.includes('first lesson'));
  assert.ok(existsSync(join(reviews, 'demo.changelog.md')));
  assert.match(readFileSync(join(reviews, 'demo.changelog.md'), 'utf8'), /Evolutionary changelog/);
});

test('CLI: missing --agent exits 2', () => {
  const res = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
