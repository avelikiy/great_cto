// Phase 5: the first point where a gate stops asking.
//
// Every earlier "conclusively passes" rested on single-sample runs, and a single
// sample of a three-case eval can only score 0, 0.33, 0.67 or 1.00. The holdout×3
// baseline finished on 2026-08-11 — 75 of 75 — and is the first evidence in this
// repository that could carry a decision to stop asking a human.
//
// The refusals are the substance. Thirty evals clear the interval and only
// fifteen agents qualify, which is the rule working rather than the rule being
// strict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, tierAll, evidenceFor, CLASS_A } from '../../scripts/lib/gate-tier.mjs';

const row = (o = {}) => ({
  agent: 'some-reviewer',
  eval: 'EVAL-x',
  split: 'holdout',
  samples: 3,
  run_id: '2026-08-11T10:00:00Z',
  actorSource: 'agent:some-reviewer',
  sharedExpanded: [],
  power: { status: 'passed' },
  ...o,
});

test('conclusive evidence at the right shape drops the gate to notify', () => {
  const t = tierFor('some-reviewer', { rows: [row()] });
  assert.equal(t.tier, 'notify');
  assert.match(t.why, /conclusively passed/);
});

// ── The refusal that matters most ───────────────────────────────────────────

test('Class A stays gated on the best evidence in the repository', () => {
  // devops is 82%, [72%, 89%], n=77 — the only agent that had this evidence
  // before today, and the one that must not be let through. A tier that cannot
  // refuse it is a rubber stamp.
  for (const a of CLASS_A) {
    const t = tierFor(a, { rows: [row({ agent: a })] });
    assert.equal(t.tier, 'gated', `${a} must stay gated`);
    assert.match(t.why, /ADR-009/);
    assert.match(t.why, /not competence/);
  }
});

test('Class A is not configuration — it refuses before it even looks at evidence', () => {
  const t = tierFor('devops', { rows: [] });
  assert.equal(t.tier, 'gated');
  assert.match(t.why, /Class A/, 'the reason is the class, not the absence of data');
});

// ── The other two cuts ──────────────────────────────────────────────────────

test('a fixture that inlined the shared contracts measures an agent that does not exist', () => {
  // On 2026-08-07 architect did not fetch the contract whose command sat
  // verbatim in its own file. An eval that hands it over has not tested the
  // handoff.
  const t = tierFor('some-reviewer', { rows: [row({ sharedExpanded: ['verdict-format.md'] })] });
  assert.equal(t.tier, 'gated');
  assert.match(t.why, /verdict-format\.md/);
  assert.match(t.why, /may never fetch/);
});

test('the generic actor measures the eval, not the agent', () => {
  const t = tierFor('some-reviewer', { rows: [row({ actorSource: 'generic' })] });
  assert.equal(t.tier, 'gated');
  assert.match(t.why, /generic actor/);
});

test('an inconclusive interval is not a pass', () => {
  const t = tierFor('some-reviewer', { rows: [row({ power: { status: 'inconclusive' } })] });
  assert.equal(t.tier, 'gated');
  assert.match(t.why, /interval, not the point/);
});

test('unmeasured is named as unmeasured, not as failing', () => {
  const t = tierFor('never-run', { rows: [] });
  assert.equal(t.tier, 'gated');
  assert.match(t.why, /unmeasured/);
  assert.match(t.why, /not the same as failing/);
});

test('every eval bound to the agent must clear, not the best one', () => {
  // Passing one of three evals shows one thing the agent can do, not that it can
  // be left alone.
  const rows = [
    row({ eval: 'EVAL-a', power: { status: 'passed' } }),
    row({ eval: 'EVAL-b', power: { status: 'failed' } }),
  ];
  const t = tierFor('some-reviewer', { rows });
  assert.equal(t.tier, 'gated');
  assert.match(t.why, /1 of 2/);
});

// ── Which row counts ────────────────────────────────────────────────────────

test('the newest row wins, not the most flattering one', () => {
  // An agent that improved and then regressed is at its regression. Picking the
  // best row would be choosing the evidence to suit the conclusion.
  const rows = [
    row({ run_id: '2026-08-01T00:00:00Z', power: { status: 'passed' } }),
    row({ run_id: '2026-08-11T00:00:00Z', power: { status: 'failed' } }),
  ];
  assert.equal(tierFor('some-reviewer', { rows }).tier, 'gated');
});

test('a single-sample run is not evidence for this decision', () => {
  assert.equal(evidenceFor('some-reviewer', [row({ samples: 1 })]).length, 0);
  assert.match(tierFor('some-reviewer', { rows: [row({ samples: 1 })] }).why, /unmeasured/);
});

test('the tuning split is not evidence either', () => {
  assert.equal(evidenceFor('some-reviewer', [row({ split: 'tuning' })]).length, 0);
});

test('a run cut short by dropout is not evidence', () => {
  const r = row({ dropout: { severe: true, why: 'never reached the provider' } });
  assert.equal(evidenceFor('some-reviewer', [r]).length, 0);
});

// ── The whole fleet ─────────────────────────────────────────────────────────

test('tierAll reports every agent it has seen, with a reason each', () => {
  const rows = [row({ agent: 'a' }), row({ agent: 'devops' }), row({ agent: 'b', power: { status: 'failed' } })];
  const all = tierAll(rows);
  assert.equal(all.length, 3);
  assert.ok(all.every((x) => x.why), 'a verdict without a reason is not actionable');
  assert.equal(all.find((x) => x.agent === 'devops').tier, 'gated');
  assert.equal(all.find((x) => x.agent === 'a').tier, 'notify');
});
