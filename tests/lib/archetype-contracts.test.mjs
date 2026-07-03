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

// ── F3a: +8 archetypes (docs/arch/ARCH-quality-deepen-followups.md, REQ-2) ────

test('CONTRACTS covers 14 archetypes total (6 web families + 8 F3a families)', () => {
  assert.equal(Object.keys(CONTRACTS).length, 14);
});

test('contractFamily maps the 8 new real archetype names to their families', () => {
  assert.equal(contractFamily('ai-system'), 'ai-system');
  assert.equal(contractFamily('agent-product'), 'agent-product');
  assert.equal(contractFamily('commerce'), 'commerce');
  assert.equal(contractFamily('web3'), 'web3');
  assert.equal(contractFamily('iot-embedded'), 'iot-embedded');
  assert.equal(contractFamily('data-platform'), 'data-platform');
  assert.equal(contractFamily('browser-extension'), 'browser-extension');
  assert.equal(contractFamily('mobile-app'), 'mobile-app');
});

test('contractFamily: agent-product is checked before the looser ai-system pattern', () => {
  // agent-product stack names often also match /ai|llm/ loosely; the more specific
  // family must win so agent-specific invariants (tool-allowlist, isolation) apply.
  assert.equal(contractFamily('agent-runtime'), 'agent-product');
  assert.equal(contractFamily('agentic-workflow'), 'agent-product');
});

test('checkContracts: ai-system — prompt-injection + output-validation + rate-limit all covered → 100%', () => {
  const txt = 'blocks prompt injection attempts; validates output against schema before use; enforces a token budget per request';
  const r = checkContracts('ai-system', txt);
  assert.equal(r.total, 3);
  assert.equal(r.covered, 3);
  assert.equal(r.coverage, 100);
});

test('checkContracts: ai-system missing rate-limit → flagged', () => {
  const txt = 'rejects prompt injection; validates model output schema'; // no cost/rate-limit test
  const r = checkContracts('ai-system', txt);
  assert.equal(r.results.find(c => c.id === 'rate-limit').covered, false);
  assert.ok(r.coverage < 100);
});

test('checkContracts: agent-product — tool-allowlist + isolation + budget all covered → 100%', () => {
  const txt = 'tool allowlist restricts unsafe tools; enforces cross-user session isolation; caps agent loop at max turns to prevent runaway budget';
  const r = checkContracts('agent-product', txt);
  assert.equal(r.covered, 3);
  assert.equal(r.coverage, 100);
});

test('checkContracts: commerce — idempotent payment + webhook signature + refund flow covered', () => {
  const txt = 'duplicate charge rejected (idempotent); invalid stripe signature rejected; refund flow issues a credit';
  const r = checkContracts('commerce', txt);
  assert.equal(r.covered, 3);
  assert.equal(r.coverage, 100);
});

test('checkContracts: commerce missing webhook-signature → flagged', () => {
  const txt = 'duplicate charge is idempotent; refund flow tested'; // no webhook signature check
  const r = checkContracts('commerce', txt);
  assert.equal(r.results.find(c => c.id === 'webhook-signature').covered, false);
  assert.ok(r.coverage < 100);
});

test('checkContracts: web3 — reentrancy + access-control + oracle-staleness covered', () => {
  const txt = 'reentrancy guard blocks recursive call; onlyOwner reverts for unauthorized caller; stale price from oracle feed rejected';
  const r = checkContracts('web3', txt);
  assert.equal(r.covered, 3);
  assert.equal(r.coverage, 100);
});

test('checkContracts: iot-embedded — OTA signature + watchdog covered', () => {
  const txt = 'OTA update rejects invalid firmware signature; watchdog reboot recovers from hang';
  const r = checkContracts('iot-embedded', txt);
  assert.equal(r.total, 2);
  assert.equal(r.covered, 2);
  assert.equal(r.coverage, 100);
});

test('checkContracts: data-platform — schema drift + idempotent pipeline + PII covered', () => {
  const txt = 'detects schema drift as a breaking change; backfill re-run is idempotent (safe to run twice); PII columns are masked';
  const r = checkContracts('data-platform', txt);
  assert.equal(r.covered, 3);
  assert.equal(r.coverage, 100);
});

test('checkContracts: browser-extension — CSP + permission scope covered', () => {
  const txt = 'content security policy blocks unsafe-eval; host permission scope is minimal, extra origins denied';
  const r = checkContracts('browser-extension', txt);
  assert.equal(r.total, 2);
  assert.equal(r.covered, 2);
  assert.equal(r.coverage, 100);
});

test('checkContracts: mobile-app — deep link validation + offline handling covered', () => {
  const txt = 'deep link payload is validated before navigation; offline mode falls back to cached data';
  const r = checkContracts('mobile-app', txt);
  assert.equal(r.total, 2);
  assert.equal(r.covered, 2);
  assert.equal(r.coverage, 100);
});

test('checkContracts: mobile-app missing offline handling → flagged', () => {
  const txt = 'deep link payload validated on open'; // no offline/no-connectivity path
  const r = checkContracts('mobile-app', txt);
  assert.equal(r.results.find(c => c.id === 'offline-handling').covered, false);
  assert.ok(r.coverage < 100);
});

test('every new F3a archetype has ≥2 invariants with a rubric-documented rationale', () => {
  const newFamilies = ['ai-system', 'agent-product', 'commerce', 'web3', 'iot-embedded', 'data-platform', 'browser-extension', 'mobile-app'];
  for (const fam of newFamilies) {
    assert.ok(CONTRACTS[fam].length >= 2, `${fam} needs ≥2 invariants`);
    for (const item of CONTRACTS[fam]) {
      assert.ok(item.desc && item.desc.length > 0, `${fam}/${item.id} needs a non-empty rationale (desc)`);
    }
  }
});
