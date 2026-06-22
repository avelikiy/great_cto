// Phase 4 (great_cto-7y5) regression guard: the default build path for the 6 SMB
// Product-Builder archetypes must stay LEAN — no regulated domain reviewer fires for a
// clean SMB product. The substantive prune happened with the pivot (great_cto-9it); this
// test locks it so a future edit can't reintroduce fda/cmmc/oracle/… into the SMB path.
//
// Two firing paths exist (verified in flow.ts): REVIEWERS_BY_ARCHETYPE + suggestPacks.
// `applies_to` is NOT a firing path (board-only display), so it is not asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWERS_BY_ARCHETYPE, buildersFor } from '../packages/cli/dist/archetypes.js';
import { suggestPacks } from '../packages/cli/dist/packs.js';
import { compileFlow } from '../packages/cli/dist/flow.js';

const SMB_ARCHETYPES = [
  'vertical-saas', 'booking', 'crm', 'dashboard', 'content-platform', 'marketplace-lite',
];

// The only reviewers allowed in a default SMB build. security-officer = generic STRIDE;
// pci-reviewer = payments (booking/content/marketplace-lite legitimately take money).
const SMB_ALLOWED_REVIEWERS = new Set(['security-officer', 'pci-reviewer']);

test('each SMB archetype pulls only the lean allowed reviewers (no regulated reviewer)', () => {
  for (const a of SMB_ARCHETYPES) {
    const reviewers = REVIEWERS_BY_ARCHETYPE[a] ?? [];
    const leaked = reviewers.filter((r) => !SMB_ALLOWED_REVIEWERS.has(r));
    assert.deepEqual(
      leaked, [],
      `${a} must not pull a regulated/domain reviewer; leaked: ${leaked.join(', ')}`
    );
  }
});

test('a clean SMB detection (no signals) attaches ZERO packs → no pack reviewers', () => {
  const cleanDetection = { stack: [], readmeKeywords: [] };
  const packs = suggestPacks(cleanDetection);
  assert.equal(packs.length, 0,
    `clean SMB build must attach no packs; got: ${packs.map((p) => p.pack).join(', ')}`);
});

// ── Builder-agent wiring (the obвязка must actually be IN the pipeline) ──────
// Guards the gap found by "test all pipelines": builders existed as agent files with
// applies_to but were never added to the generated flow (applies_to is board-only).

const UNIVERSAL_BUILDERS = ['integrations-engineer', 'migration-import-engineer', 'subscription-billing-engineer'];

test('every SMB archetype pipeline includes the universal builder trio', () => {
  for (const a of SMB_ARCHETYPES) {
    const builders = buildersFor(a);
    for (const b of UNIVERSAL_BUILDERS) {
      assert.ok(builders.includes(b), `${a} pipeline must include ${b}; got: ${builders.join(', ')}`);
    }
  }
});

test('archetype-specific builders are wired (connector→dashboard, media→content-platform)', () => {
  assert.ok(buildersFor('dashboard').includes('connector-builder'), 'dashboard needs connector-builder');
  assert.ok(buildersFor('content-platform').includes('media-pipeline-engineer'), 'content-platform needs media-pipeline-engineer');
  // and they do NOT leak into archetypes that do not need them
  assert.ok(!buildersFor('crm').includes('connector-builder'), 'crm must not pull connector-builder');
  assert.ok(!buildersFor('crm').includes('media-pipeline-engineer'), 'crm must not pull media-pipeline-engineer');
});

test('builders actually appear in the compiled flow agent list', () => {
  const det = { stack: [], readmeKeywords: [], jurisdictions: [] };
  const flow = compileFlow('marketplace-lite', 'small', det, [], 'high');
  for (const b of UNIVERSAL_BUILDERS) {
    assert.ok(flow.agents.includes(b), `compiled marketplace-lite flow must list ${b}; got: ${flow.agents.join(', ')}`);
  }
});

test('geo-routing + mobile builders are signal-gated (absent clean, present on signal)', () => {
  const clean = { stack: [], readmeKeywords: [], jurisdictions: [] };
  const routing = { stack: [], readmeKeywords: ['routing', 'dispatch'], jurisdictions: [] };
  const mobile = { stack: [], readmeKeywords: ['mobile', 'field'], jurisdictions: [] };
  // clean booking → no geo, no mobile
  const cleanFlow = compileFlow('booking', 'small', clean, [], 'high');
  assert.ok(!cleanFlow.agents.includes('geo-routing-engineer'), 'clean booking must not pull geo-routing-engineer');
  assert.ok(!cleanFlow.agents.includes('mobile-app-builder'), 'clean booking must not pull mobile-app-builder');
  // routing signal → geo
  assert.ok(compileFlow('booking', 'small', routing, [], 'high').agents.includes('geo-routing-engineer'),
    'booking + routing signal must pull geo-routing-engineer');
  // mobile signal on a UI archetype → mobile builder
  assert.ok(compileFlow('vertical-saas', 'small', mobile, [], 'high').agents.includes('mobile-app-builder'),
    'vertical-saas + mobile signal must pull mobile-app-builder');
});

test('regulated archetypes are NOT over-pruned — they keep their domain reviewers', () => {
  // Guard the other direction: the prune must not have stripped reviewers that regulated
  // archetypes legitimately need.
  const mustHave = {
    fintech: 'regulated-reviewer',
    healthcare: 'healthcare-reviewer',
    'defense-govcon': 'cmmc-reviewer',
    web3: 'oracle-reviewer',
    insurance: 'insurance-reviewer',
  };
  for (const [archetype, reviewer] of Object.entries(mustHave)) {
    const reviewers = REVIEWERS_BY_ARCHETYPE[archetype] ?? [];
    assert.ok(reviewers.includes(reviewer),
      `${archetype} must still pull ${reviewer}; got: ${reviewers.join(', ')}`);
  }
});
