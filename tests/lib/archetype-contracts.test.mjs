// tests/lib/archetype-contracts.test.mjs — QUALITY-DEEPEN #3 domain contracts.
// Run: node --test tests/lib/archetype-contracts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS, contractFamily, checkContracts } from '../../scripts/lib/archetype-contracts.mjs';

test('every archetype has ≥2 contracts', () => {
  for (const [a, items] of Object.entries(CONTRACTS)) assert.ok(items.length >= 2, `${a} needs ≥2`);
});

test('contractFamily maps real names to families', () => {
  assert.equal(contractFamily('cli-tool'), 'cli-tool');           // no contracts → passthrough
  assert.equal(contractFamily('vertical-saas'), 'crud');
  assert.equal(contractFamily('Booking/scheduling'), 'booking');
  assert.equal(contractFamily('marketplace-lite'), 'marketplace');
  assert.equal(contractFamily('content/media'), 'content');
});

test('checkContracts: marketplace test text covering all invariants → 100%', () => {
  const txt = 'creates escrow hold on order; double release rejected (already released); seller cannot order own listing 403';
  const r = checkContracts('marketplace', txt);
  assert.equal(r.total, 3);
  assert.equal(r.covered, 3);
  assert.equal(r.coverage, 100);
});

test('checkContracts: content missing the entitlement gate → flagged', () => {
  const txt = 'lists catalog; purchase creates entitlement'; // no 403/deny path
  const r = checkContracts('content', txt);
  assert.equal(r.results.find(c => c.id === 'entitlement-gate').covered, false);
  assert.equal(r.results.find(c => c.id === 'purchase-grants').covered, true);
  assert.ok(r.coverage < 100);
});

test('checkContracts: booking double-book + cancel-release detected', () => {
  const r = checkContracts('booking', 'rejects double-booking with 409; cancel releases the slot back to availability');
  assert.equal(r.covered, 3);
});

test('checkContracts: unknown archetype family → no contracts', () => {
  const r = checkContracts('cli-tool', 'whatever');
  assert.equal(r.total, 0);
  assert.equal(r.coverage, null);
});
