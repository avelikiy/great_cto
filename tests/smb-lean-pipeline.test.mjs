// Phase 4 (great_cto-7y5) regression guard: the default build path for the 6 SMB
// Product-Builder archetypes must stay LEAN — no regulated domain reviewer fires for a
// clean SMB product. The substantive prune happened with the pivot (great_cto-9it); this
// test locks it so a future edit can't reintroduce fda/cmmc/oracle/… into the SMB path.
//
// Two firing paths exist (verified in flow.ts): REVIEWERS_BY_ARCHETYPE + suggestPacks.
// `applies_to` is NOT a firing path (board-only display), so it is not asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWERS_BY_ARCHETYPE } from '../packages/cli/dist/archetypes.js';
import { suggestPacks } from '../packages/cli/dist/packs.js';

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
