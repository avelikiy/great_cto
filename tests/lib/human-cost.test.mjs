// The benchmark scores artifacts. The product sold is "describe it, approve
// twice, get software" — so how often a person had to step in is the number
// closest to the actual claim, and no column reported it.
//
// The interesting property here is restraint: these signals are sparse, and a
// sparse count dressed as a metric is worse than no metric because it looks
// authoritative. Confidence rides along with every reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countInterventions, humanCost, renderHumanCost } from '../../scripts/lib/human-cost.mjs';

test('gate verdicts are counted as human decision points', () => {
  const c = countInterventions([
    '2026-07-01T10:00Z | architect | APPROVED | gate:arch',
    '2026-07-01T11:00Z | senior-dev | DONE | built it',
    '2026-07-01T12:00Z | CTO | REJECTED | gate:ship',
  ]);
  assert.equal(c.gates, 2, 'APPROVED and REJECTED are decisions; DONE is progress');
});

test('agent progress is not an intervention', () => {
  const c = countInterventions([
    '| senior-dev | DONE |', '| qa-engineer | PASS |', '| pm | PLAN_READY |',
  ]);
  assert.equal(c.gates, 0, 'nobody had to decide anything here');
});

test('a stop that needed restarting is counted separately from a gate', () => {
  const c = countInterventions(['| senior-dev | SPEC-OBJECTION | needs re-scope']);
  assert.equal(c.restarts, 1);
});

test('blank and empty lines are ignored', () => {
  const c = countInterventions(['', '   ', null, undefined, '| x | APPROVED |']);
  assert.equal(c.gates, 1);
  assert.equal(c.lines, 1);
});

// ── the restraint that matters ──────────────────────────────────────────────

test('a sparse log is reported but flagged indicative, never as a measurement', () => {
  const h = humanCost('/x', {
    exists: () => true,
    readDir: (p) => (String(p).includes('verdicts') ? ['a.log'] : []),
    readFile: () => '| architect | APPROVED | gate:arch\n| pm | PLAN_READY |\n',
  });
  assert.equal(h.confidence, 'indicative');
  assert.match(h.note, /too sparse/);
  assert.equal(h.gates, 1, 'the number is still reported, not hidden');
});

test('a dense log is reported as measured, with no caveat', () => {
  const many = Array.from({ length: 14 }, (_, i) => `| agent${i} | ${i % 3 ? 'DONE' : 'APPROVED'} |`).join('\n');
  const h = humanCost('/x', {
    exists: () => true,
    readDir: (p) => (String(p).includes('verdicts') ? ['a.log'] : []),
    readFile: () => many,
  });
  assert.equal(h.confidence, 'measured');
  assert.equal(h.note, null);
});

test('extra run logs are counted as manual restarts — the first launch is not one', () => {
  const h = humanCost('/x', {
    exists: () => true,
    readDir: (p) => (String(p).includes('verdicts') ? [] : ['.bench-run-1.log', '.bench-run-2.log', '.bench-run-3.log']),
    readFile: () => '',
  });
  assert.equal(h.launches, 3);
  assert.equal(h.manual_restarts, 2, 'three launches means someone restarted it twice');
});

test('a single clean launch has zero manual restarts', () => {
  const h = humanCost('/x', {
    exists: () => true,
    readDir: (p) => (String(p).includes('verdicts') ? [] : ['.bench-run-1.log']),
    readFile: () => '',
  });
  assert.equal(h.manual_restarts, 0);
});

test('a product with no artifacts at all does not throw', () => {
  const h = humanCost('/x', { exists: () => false, readDir: () => [], readFile: () => '' });
  assert.equal(h.total_interventions, 0);
  assert.equal(h.confidence, 'indicative', 'zero evidence is not a clean run — it is no evidence');
});

test('rendering marks indicative readings so a reader cannot mistake them', () => {
  assert.match(renderHumanCost({ total_interventions: 3, gates: 2, manual_restarts: 1, confidence: 'indicative' }), /~$/);
  assert.doesNotMatch(renderHumanCost({ total_interventions: 3, gates: 3, manual_restarts: 0, confidence: 'measured' }), /~$/);
});

test('rendering names the composition, not just the total', () => {
  const s = renderHumanCost({ total_interventions: 5, gates: 3, manual_restarts: 2, confidence: 'measured' });
  assert.match(s, /3 gates/);
  assert.match(s, /2 restarts/);
});
