// Tests for scripts/hooks/auto-attach-reviewers.mjs — RULES pattern matching.
//
// Covers the catalog compliance-promise gap: healthcare-allied / insurance-agency /
// accounting-tax verticals claim "great_cto auto-attaches the right compliance
// reviewer" — these tests verify that claim is actually true for the reviewer
// patterns, not just that the reviewer agent files exist.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/auto-attach-reviewers.mjs');

const { RULES, shouldExclude } = await import(HOOK);

function reviewersFor(path) {
  if (shouldExclude(path)) return [];
  return RULES.filter(r => r.pattern.test(path)).map(r => r.reviewer);
}

// ─── healthcare-reviewer: the gap this change closes ─────────────────────

test('healthcare-reviewer attaches on HIPAA/PHI/clinical-transport signals', () => {
  assert.ok(reviewersFor('src/hipaa/audit-log.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('src/phi_redaction.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('integrations/hl7/parser.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('integrations/fhir/client.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('ehr/epic-sync.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('billing/superbill-generator.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('claims/icd10-mapper.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('clinical/soap_note.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('legal/BAA-vendor.ts').includes('healthcare-reviewer'));
});

test('healthcare-reviewer does NOT attach on unrelated or near-miss paths', () => {
  // Generic wellness/support code that happens to contain "health"/"care"/"claim" —
  // must NOT fire; these are deliberately excluded from the token list.
  assert.deepEqual(reviewersFor('src/health-check.ts'), []);
  assert.deepEqual(reviewersFor('src/care-team.ts'), []);
  assert.deepEqual(reviewersFor('src/insurance/claims.ts'), []);
  // Substring false-positive guard: "ehr" inside an unrelated word must not fire.
  assert.deepEqual(reviewersFor('src/behr/thing.ts'), []);
  assert.deepEqual(reviewersFor('src/utils/format.ts'), []);
});

// ─── legal-reviewer: legal-smb vertical (matches insurance-reviewer's shape) ──

test('legal-reviewer attaches on IOLTA/matter/conflict-check/e-filing signals', () => {
  assert.ok(reviewersFor('src/iolta/trust-ledger.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('src/trust-account/reconcile.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('intake/matter-number.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('intake/conflict-check.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('efile/pacer-client.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('efile/ecf-submit.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('src/retainer-agreement.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('src/attorney-client-log.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('src/upl-guard.ts').includes('legal-reviewer'));
  assert.ok(reviewersFor('src/docket-sync.ts').includes('legal-reviewer'));
});

test('legal-reviewer does NOT attach on generic code containing bare legal/law/case/trust tokens', () => {
  // Deliberately excluded bare tokens — must not collide with license headers,
  // unrelated "law" words, switch/test "case" terminology, or crypto "trust" code.
  assert.deepEqual(reviewersFor('src/LICENSE-checker.ts'), []);
  assert.deepEqual(reviewersFor('src/law-of-large-numbers.ts'), []);
  assert.deepEqual(reviewersFor('src/test/case-runner.ts'), []);
  assert.deepEqual(reviewersFor('src/security/trust-boundary.ts'), []);
  assert.deepEqual(reviewersFor('src/utils/legal-notice.ts'), []);
});

// ─── regression: reviewers that already had patterns keep working ────────

test('insurance-reviewer still attaches on NAIC/actuarial signals (regression)', () => {
  assert.ok(reviewersFor('src/naic-filing.ts').includes('insurance-reviewer'));
  assert.ok(reviewersFor('actuarial/model.ts').includes('insurance-reviewer'));
});

test('healthcare-reviewer attaches on dental tokens (dental vertical reuses healthcare archetype)', () => {
  assert.ok(reviewersFor('src/dental/cdt-code.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('src/dental/odontogram.tsx').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('src/dental/perio-chart.ts').includes('healthcare-reviewer'));
  assert.ok(reviewersFor('billing/dental-claim.ts').includes('healthcare-reviewer'));
});

test('pci-reviewer still attaches on payment signals (regression)', () => {
  assert.ok(reviewersFor('src/payments/stripe-webhook.ts').includes('pci-reviewer'));
});

// ─── enterprise-saas-reviewer: accounting routing (no dedicated reviewer exists) ──

test('enterprise-saas-reviewer attaches on accounting-controls signals (GL/GAAP)', () => {
  assert.ok(reviewersFor('accounting/general-ledger.ts').includes('enterprise-saas-reviewer'));
  assert.ok(reviewersFor('finance/gaap-adjustments.ts').includes('enterprise-saas-reviewer'));
});

test('enterprise-saas-reviewer still attaches on SSO/SCIM/tenant signals (regression)', () => {
  assert.ok(reviewersFor('src/sso/saml-handler.ts').includes('enterprise-saas-reviewer'));
});

// ─── regulated-reviewer: DORA/NIS2/ISO27001 only, no double-attach ────────

test('regulated-reviewer attaches on its exclusive DORA/NIS2/ISO27001 surface', () => {
  assert.ok(reviewersFor('src/compliance/dora-incident-classifier.ts').includes('regulated-reviewer'));
  assert.ok(reviewersFor('src/nis2-vuln-disclosure.ts').includes('regulated-reviewer'));
  assert.ok(reviewersFor('config/iso27001-controls.json').includes('regulated-reviewer'));
});

test('regulated-reviewer does NOT double-attach alongside healthcare/enterprise-saas on their exclusive tokens', () => {
  // HIPAA/PHI tokens belong to healthcare-reviewer only — regulated-reviewer's
  // pattern deliberately excludes hipaa/sox tokens to avoid noisy double-attach.
  const hipaaMatches = reviewersFor('src/hipaa/audit-log.ts');
  assert.ok(hipaaMatches.includes('healthcare-reviewer'));
  assert.ok(!hipaaMatches.includes('regulated-reviewer'));

  const soxMatches = reviewersFor('src/sox.itgc/access-review.ts');
  assert.ok(soxMatches.includes('enterprise-saas-reviewer'));
  assert.ok(!soxMatches.includes('regulated-reviewer'));
});

// ─── no double-attach on a plain, unrelated path ──────────────────────────

test('a plain unrelated file attaches no reviewers', () => {
  assert.deepEqual(reviewersFor('src/components/Button.tsx'), []);
  assert.deepEqual(reviewersFor('README.md'), []); // also EXCLUDE-filtered
});
