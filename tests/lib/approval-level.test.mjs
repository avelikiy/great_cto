// The pipeline chains itself; the only open question is where it pauses. The
// existing levels could not express the one an operator most often wants — ask
// about the product, decide the technical parts yourself — so `gates-only` made
// them approve architecture they did not want to review, and `auto` skipped the
// product decision too.
//
// The properties worth pinning: product-only keeps exactly the two expensive-to-
// undo decisions, a regulated archetype cannot be stripped of its floor by
// choosing a lighter level, and a typo falls back to gating rather than to none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gatesForApprovalLevel, gateApplies, levelFromProjectMd, describeLevel,
  isRegulated, APPROVAL_LEVELS, DEFAULT_LEVEL,
} from '../../scripts/lib/approval-level.mjs';

test('product-only pauses at product and ship — and nowhere technical', () => {
  const g = gatesForApprovalLevel('product-only', { archetype: 'web-service' });
  assert.deepEqual(g, ['product', 'ship']);
});

test('product-only asks the WHAT question that gates-only never asks', () => {
  assert.equal(gateApplies('product', 'product-only'), true);
  assert.equal(gateApplies('product', 'gates-only'), false,
    'the default stops at architecture but never at the product decision');
});

test('product-only skips architecture and planning', () => {
  for (const gate of ['arch', 'plan', 'code']) {
    assert.equal(gateApplies(gate, 'product-only', { archetype: 'web-service' }), false, gate);
  }
});

test('a gate: prefix is accepted, since that is how they are written everywhere', () => {
  assert.equal(gateApplies('gate:ship', 'product-only'), true);
});

// ── the floor that cannot be opted out of ──────────────────────────────────

test('a regulated archetype keeps its security/compliance floor under product-only', () => {
  const g = gatesForApprovalLevel('product-only', { archetype: 'fintech' });
  assert.ok(g.includes('security'), 'security survives');
  assert.ok(g.includes('compliance'), 'compliance survives');
  assert.ok(g.includes('product'), 'and the product decision is still asked');
});

test('even `auto` cannot strip a regulated floor', () => {
  const g = gatesForApprovalLevel('auto', { archetype: 'healthcare' });
  assert.ok(g.includes('security') && g.includes('compliance') && g.includes('ship'),
    'a lighter level must not become a compliance bypass');
});

test('an unregulated archetype under auto really has no gates', () => {
  assert.deepEqual(gatesForApprovalLevel('auto', { archetype: 'cli-tool' }), []);
});

test('isRegulated is case-insensitive and safe on junk', () => {
  assert.equal(isRegulated('FinTech'), true);
  assert.equal(isRegulated('cli-tool'), false);
  assert.equal(isRegulated(undefined), false);
});

// ── failure modes ──────────────────────────────────────────────────────────

test('an unknown level falls back to the default, never to no gates', () => {
  const g = gatesForApprovalLevel('prodcut-only');           // typo on purpose
  assert.deepEqual(g, gatesForApprovalLevel(DEFAULT_LEVEL));
  assert.ok(g.length > 0, 'a typo must not silently disable human review');
});

test('a missing level is the default', () => {
  assert.deepEqual(gatesForApprovalLevel(undefined), gatesForApprovalLevel(DEFAULT_LEVEL));
});

test('levelFromProjectMd reads the field, and rejects an unknown value', () => {
  assert.equal(levelFromProjectMd('project: x\napproval-level: product-only\n'), 'product-only');
  assert.equal(levelFromProjectMd('project: x\n'), DEFAULT_LEVEL);
  assert.equal(levelFromProjectMd('approval-level: nonsense\n'), DEFAULT_LEVEL);
});

test('gates come back in pipeline order, not insertion order', () => {
  const g = gatesForApprovalLevel('expert', { archetype: 'web-service' });
  assert.equal(g[0], 'product', 'product is first — WHAT before HOW');
  assert.equal(g[g.length - 1], 'ship', 'ship is last');
});

test('every advertised level resolves to something', () => {
  for (const l of APPROVAL_LEVELS) {
    assert.ok(Array.isArray(gatesForApprovalLevel(l)), l);
  }
});

test('describeLevel explains an unattended run rather than printing an empty list', () => {
  assert.match(describeLevel('auto', { archetype: 'cli-tool' }), /no human gates/);
  assert.match(describeLevel('product-only'), /gate:product/);
  assert.match(describeLevel('bogus'), /unknown/, 'a typo is surfaced, not silently corrected');
});
