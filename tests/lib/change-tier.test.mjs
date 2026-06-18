// tests/lib/change-tier.test.mjs — unit tests for the per-change risk classifier.
//
// Run: node --test tests/lib/change-tier.test.mjs
//
// classify(signals) → { tier: 'T0'|'T1'|'T2', reasons: string[], escalatedFromLabel }
// Pairs with effectiveGates() (archetypes.ts): the classifier decides the tier,
// effectiveGates maps the tier to a gate set. See
// docs/plans/PLAN-2026-06-18-gate-tiering-reviewer-consolidation.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classify, TIER_RANK } from '../../scripts/lib/change-tier.mjs';

// ── T2 hard triggers (any ⇒ T2) ──────────────────────────────────────────────

test('migration file → T2', () => {
  const r = classify({ changedFiles: ['migrations/003_add_col.sql'] });
  assert.equal(r.tier, 'T2');
  assert.ok(r.reasons.some((x) => /migration/i.test(x)), 'reason cites the migration');
});

test('new write-capable connector → T2', () => {
  const r = classify({ connectors: [{ id: 'clearinghouse', hasWrite: true, isNew: true }] });
  assert.equal(r.tier, 'T2');
  assert.ok(r.reasons.some((x) => /connector/i.test(x)));
});

test('a new READ-only connector is NOT a T2 trigger', () => {
  const r = classify({
    changedFiles: ['scripts/lib/connectors/foo.mjs'],
    connectors: [{ id: 'foo', hasWrite: false, isNew: true }],
  });
  assert.notEqual(r.tier, 'T2');
});

test('production deploy → T2', () => {
  const r = classify({ deployTarget: 'production' });
  assert.equal(r.tier, 'T2');
  assert.ok(r.reasons.some((x) => /deploy|prod/i.test(x)));
});

test('staging deploy is not a T2 trigger', () => {
  assert.notEqual(classify({ deployTarget: 'staging' }).tier, 'T2');
});

test('_domains.json / auth / pricing-config surfaces → T2', () => {
  for (const f of ['site/_domains.json', 'packages/board/auth/session.mjs', 'src/pricing/plans.ts']) {
    assert.equal(classify({ changedFiles: [f] }).tier, 'T2', `${f} must be T2`);
  }
});

// ── T0 — maintenance (all files non-behavioral) ───────────────────────────────

test('docs-only change → T0', () => {
  const r = classify({ changedFiles: ['docs/GATES.md', 'README.md'] });
  assert.equal(r.tier, 'T0');
});

test('tests-only change → T0', () => {
  assert.equal(classify({ changedFiles: ['tests/foo.test.mjs', 'packages/cli/tests/bar.test.mjs'] }).tier, 'T0');
});

test('a docs file that merely mentions pricing/auth in its path stays T0 (not a behavioral surface)', () => {
  assert.equal(classify({ changedFiles: ['docs/pricing.md', 'docs/auth-guide.md'] }).tier, 'T0');
});

// ── T1 — default / reversible feature ─────────────────────────────────────────

test('a source change with no T2 trigger → T1', () => {
  assert.equal(classify({ changedFiles: ['packages/cli/src/report.ts'] }).tier, 'T1');
});

test('mixed docs + source → T1 (not all non-behavioral)', () => {
  assert.equal(classify({ changedFiles: ['README.md', 'packages/cli/src/report.ts'] }).tier, 'T1');
});

test('empty change set defaults to T1 (cannot prove it is maintenance)', () => {
  assert.equal(classify({}).tier, 'T1');
  assert.equal(classify({ changedFiles: [] }).tier, 'T1');
});

// ── Explicit label override (cannot breach the T2 floor) ──────────────────────

test('label tier:t2 upgrades a docs-only change to T2', () => {
  const r = classify({ changedFiles: ['README.md'], labels: ['tier:t2'] });
  assert.equal(r.tier, 'T2');
  assert.ok(r.reasons.some((x) => /label/i.test(x)));
});

test('label tier:t1 upgrades an otherwise-T0 change to T1', () => {
  assert.equal(classify({ changedFiles: ['docs/x.md'], labels: ['tier:t1'] }).tier, 'T1');
});

test('label tier:t0 CANNOT downgrade a hard T2 trigger (floor wins, escalation recorded)', () => {
  const r = classify({ changedFiles: ['migrations/004.sql'], labels: ['tier:t0'] });
  assert.equal(r.tier, 'T2', 'a migration cannot be labelled down to maintenance');
  assert.equal(r.escalatedFromLabel, 'T0', 'the overridden label is recorded for the audit log');
});

test('label is case-insensitive and ignores unrelated labels', () => {
  const r = classify({ changedFiles: ['docs/x.md'], labels: ['p1', 'tier:T2', 'epic'] });
  assert.equal(r.tier, 'T2');
});

// ── Structural ────────────────────────────────────────────────────────────────

test('reasons is always a non-empty array; tier is always valid', () => {
  for (const sig of [{}, { changedFiles: ['a.ts'] }, { deployTarget: 'production' }]) {
    const r = classify(sig);
    assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0);
    assert.ok(['T0', 'T1', 'T2'].includes(r.tier));
  }
});

test('TIER_RANK orders T0 < T1 < T2', () => {
  assert.ok(TIER_RANK.T0 < TIER_RANK.T1 && TIER_RANK.T1 < TIER_RANK.T2);
});

test('classify is pure — does not mutate its input', () => {
  const sig = { changedFiles: ['migrations/1.sql'], labels: ['tier:t0'], connectors: [] };
  const snap = JSON.stringify(sig);
  classify(sig);
  assert.equal(JSON.stringify(sig), snap);
});
