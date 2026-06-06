// tests/lib/trace.test.mjs — unit tests for req→uc→task→test traceability (governance Phase 4)
//
// Run: node --test tests/lib/trace.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classify, buildGraph, traceUp, traceDown, coverageGaps,
  formatTrace, formatCoverage, LAYER_RANK,
} from '../../scripts/lib/trace.mjs';

// A complete chain: REQ ← UC ← TASK ← TEST  (edges: from depends on to)
const NODES = [
  { id: 'r1', title: 'login required', labels: ['req', 'feature-auth'], status: 'open' },
  { id: 'u1', title: 'user signs in', labels: ['uc', 'feature-auth'], status: 'open' },
  { id: 't1', title: 'impl /login', labels: ['feature-auth'], status: 'closed' },
  { id: 'x1', title: 'test login happy path', labels: ['test', 'feature-auth'], status: 'open' },
];
const EDGES = [
  { from: 'u1', to: 'r1' }, // uc depends on req
  { from: 't1', to: 'u1' }, // task depends on uc
  { from: 'x1', to: 't1' }, // test depends on task
];
const full = () => buildGraph({ nodes: NODES, edges: EDGES });

// ── classify ──────────────────────────────────────────────────────────────────

test('classify: req / uc / test / task by label', () => {
  assert.equal(classify({ labels: ['req'] }), 'req');
  assert.equal(classify({ labels: ['use-case'] }), 'uc');
  assert.equal(classify({ labels: ['usc'] }), 'uc');
  assert.equal(classify({ labels: ['test'] }), 'test');
  assert.equal(classify({ labels: ['feature-x'] }), 'task');
  assert.equal(classify({ labels: [] }), 'task');
});

test('classify: req wins when both req and test present (rank priority)', () => {
  assert.equal(classify({ labels: ['req', 'test'] }), 'req');
});

// ── buildGraph ──────────────────────────────────────────────────────────────────

test('buildGraph: deps and dependents are inverse', () => {
  const g = full();
  assert.ok(g.deps.get('u1').has('r1'));        // u1 depends on r1
  assert.ok(g.dependents.get('r1').has('u1'));  // r1 depended on by u1
});

test('buildGraph: self-edge ignored', () => {
  const g = buildGraph({ nodes: [{ id: 'a', labels: [] }], edges: [{ from: 'a', to: 'a' }] });
  assert.equal(g.deps.get('a').size, 0);
});

test('buildGraph: layerOf returns other for unknown id', () => {
  assert.equal(full().layerOf('zzz'), 'other');
});

// ── traceUp / traceDown ─────────────────────────────────────────────────────────

test('traceUp from test → reaches task, uc, req (full rationale)', () => {
  const ids = traceUp(full(), 'x1').map((n) => n.id).sort();
  assert.deepEqual(ids, ['r1', 't1', 'u1']);
});

test('traceUp from req → nothing (root rationale)', () => {
  assert.equal(traceUp(full(), 'r1').length, 0);
});

test('traceDown from req → impact reaches uc, task, test', () => {
  const ids = traceDown(full(), 'r1').map((n) => n.id).sort();
  assert.deepEqual(ids, ['t1', 'u1', 'x1']);
});

test('traceDown from test → nothing (leaf)', () => {
  assert.equal(traceDown(full(), 'x1').length, 0);
});

test('traceDown carries layer + depth', () => {
  const d = traceDown(full(), 'r1').find((n) => n.id === 'u1');
  assert.equal(d.layer, 'uc');
  assert.equal(d.depth, 1);
});

// ── coverageGaps ─────────────────────────────────────────────────────────────────

test('coverageGaps: complete chain → no gaps', () => {
  assert.deepEqual(coverageGaps(full()), []);
});

test('coverageGaps: req with no uc and no test → two gaps', () => {
  const g = buildGraph({ nodes: [{ id: 'r1', labels: ['req'] }], edges: [] });
  const gaps = coverageGaps(g);
  assert.equal(gaps.length, 2);
  assert.match(gaps.map((x) => x.gap).join(' '), /no use-case/);
  assert.match(gaps.map((x) => x.gap).join(' '), /untested requirement/);
});

test('coverageGaps: uc without task flagged', () => {
  const g = buildGraph({
    nodes: [{ id: 'r1', labels: ['req'] }, { id: 'u1', labels: ['uc'] }],
    edges: [{ from: 'u1', to: 'r1' }],
  });
  const gaps = coverageGaps(g);
  // r1 has uc (good for that check) but still untested; u1 has no task.
  assert.ok(gaps.some((x) => x.id === 'u1' && /no implementation task/.test(x.gap)));
});

test('coverageGaps: task without test flagged', () => {
  const g = buildGraph({
    nodes: [{ id: 't1', labels: ['feature-x'] }],
    edges: [],
  });
  assert.ok(coverageGaps(g).some((x) => x.gap === 'task has no test'));
});

test('coverageGaps: req reaches test through chain → no untested gap', () => {
  const gaps = coverageGaps(full(), ['r1']);
  assert.equal(gaps.length, 0);
});

test('coverageGaps: scoped to id subset', () => {
  // only inspect t1 → its single gap is "no test" (here it HAS a test, so none)
  assert.deepEqual(coverageGaps(full(), ['t1']), []);
});

test('coverageGaps: sorted by layer rank (req before task)', () => {
  const g = buildGraph({
    nodes: [{ id: 't1', labels: ['feature-x'] }, { id: 'r1', labels: ['req'] }],
    edges: [],
  });
  const gaps = coverageGaps(g);
  assert.ok(LAYER_RANK[gaps[0].layer] <= LAYER_RANK[gaps[gaps.length - 1].layer]);
  assert.equal(gaps[0].layer, 'req');
});

// ── formatting ───────────────────────────────────────────────────────────────────

test('formatTrace: includes rationale and impact headings', () => {
  const s = formatTrace(full(), 't1');
  assert.match(s, /Rationale/);
  assert.match(s, /Impact/);
  assert.match(s, /r1/);
  assert.match(s, /x1/);
});

test('formatTrace: unknown id → not-found message', () => {
  assert.match(formatTrace(full(), 'nope'), /not found/);
});

test('formatCoverage: complete chain → ✓ message', () => {
  assert.match(formatCoverage(full(), [...full().byId.keys()], 'feature-auth'), /chain complete/);
});

test('formatCoverage: gaps listed with ✗', () => {
  const g = buildGraph({ nodes: [{ id: 'r1', labels: ['req'] }], edges: [] });
  const s = formatCoverage(g, ['r1'], 'feature-x');
  assert.match(s, /coverage gap/);
  assert.match(s, /r1/);
});
