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

// ─── accounting-reviewer: GL/GAAP routing (migrated off enterprise-saas-reviewer,
// closes great_cto-k0uf's partial patch now that a dedicated reviewer exists) ──

test('accounting-reviewer attaches on GL/GAAP/close signals (migrated from enterprise-saas-reviewer)', () => {
  assert.ok(reviewersFor('accounting/general-ledger.ts').includes('accounting-reviewer'));
  assert.ok(reviewersFor('finance/gaap-adjustments.ts').includes('accounting-reviewer'));
  assert.ok(reviewersFor('src/close/month-end-close.ts').includes('accounting-reviewer'));
  assert.ok(reviewersFor('src/tax-forms/1099-generator.ts').includes('accounting-reviewer'));
  assert.ok(reviewersFor('src/revrec/asc-606-schedule.ts').includes('accounting-reviewer'));
  assert.ok(reviewersFor('src/coa/chart-of-accounts.ts').includes('accounting-reviewer'));
});

test('accounting-reviewer does NOT double-attach with enterprise-saas-reviewer on GL/GAAP tokens (no double-attach, great_cto-k0uf)', () => {
  const glMatches = reviewersFor('accounting/general-ledger.ts');
  assert.ok(glMatches.includes('accounting-reviewer'));
  assert.ok(!glMatches.includes('enterprise-saas-reviewer'));

  const gaapMatches = reviewersFor('finance/gaap-adjustments.ts');
  assert.ok(gaapMatches.includes('accounting-reviewer'));
  assert.ok(!gaapMatches.includes('enterprise-saas-reviewer'));
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

// ─── rcm-reviewer: healthcare revenue-cycle / medical-billing vertical ────

test('rcm-reviewer attaches on claim-form/coding/remittance signals', () => {
  assert.ok(reviewersFor('src/billing/cms-1500-generator.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/billing/ub-04-claim.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/billing/hcpcs-lookup.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/remit/era-835-parser.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/remittance-advice/post.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/claims/prior-auth-check.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/claims/denial-code-map.ts').includes('rcm-reviewer'));
  assert.ok(reviewersFor('src/provider/npi-validate.ts').includes('rcm-reviewer'));
});

test('rcm-reviewer does NOT attach on generic billing/claims code without RCM-specific tokens', () => {
  assert.deepEqual(reviewersFor('src/billing/invoice.ts'), []);
  assert.deepEqual(reviewersFor('src/utils/format.ts'), []);
});

// ─── procurement-reviewer: source-to-pay vertical ─────────────────────────

test('procurement-reviewer attaches on PO/three-way-match/vendor-screening signals', () => {
  assert.ok(reviewersFor('src/procurement/purchase-order.ts').includes('procurement-reviewer'));
  assert.ok(reviewersFor('src/procurement/three-way-match.ts').includes('procurement-reviewer'));
  assert.ok(reviewersFor('src/sourcing/rfp-submission.ts').includes('procurement-reviewer'));
  assert.ok(reviewersFor('src/vendor/ofac-screen.ts').includes('procurement-reviewer'));
  assert.ok(reviewersFor('src/catalog/punchout-session.ts').includes('procurement-reviewer'));
  assert.ok(reviewersFor('src/catalog/cxml-handler.ts').includes('procurement-reviewer'));
  assert.ok(reviewersFor('src/procurement/requisition.ts').includes('procurement-reviewer'));
});

test('procurement-reviewer does NOT attach on generic e-commerce order code', () => {
  assert.deepEqual(reviewersFor('src/checkout/order.ts'), []);
  assert.deepEqual(reviewersFor('src/cart/vendor-list.ts'), []);
});

// ─── msp-reviewer: managed-service-provider vertical ──────────────────────

test('msp-reviewer attaches on MSA/SLA/RMM/PSA/credential-vault signals', () => {
  assert.ok(reviewersFor('src/contracts/msa-terms.ts').includes('msp-reviewer'));
  assert.ok(reviewersFor('src/sla/tracker.ts').includes('msp-reviewer'));
  assert.ok(reviewersFor('src/rmm/script-deploy.ts').includes('msp-reviewer'));
  assert.ok(reviewersFor('src/psa/ticket-sync.ts').includes('msp-reviewer'));
  assert.ok(reviewersFor('src/platform/multi-tenant-router.ts').includes('msp-reviewer'));
  assert.ok(reviewersFor('src/onboarding/managed-service-setup.ts').includes('msp-reviewer'));
  assert.ok(reviewersFor('src/secrets/credential-vault.ts').includes('msp-reviewer'));
});

test('msp-reviewer does NOT attach on generic service/tenant code without MSP-specific tokens', () => {
  assert.deepEqual(reviewersFor('src/services/user-service.ts'), []);
  assert.deepEqual(reviewersFor('src/utils/format.ts'), []);
});

// ─── tax-reviewer: tax preparation / IRS e-file vertical ──────────────────

test('tax-reviewer attaches on PTIN/Circular-230/8879/MeF/7216 signals', () => {
  assert.ok(reviewersFor('src/preparer/ptin-validate.ts').includes('tax-reviewer'));
  assert.ok(reviewersFor('src/compliance/circular-230-check.ts').includes('tax-reviewer'));
  assert.ok(reviewersFor('src/efile/form-8879-signature.ts').includes('tax-reviewer'));
  assert.ok(reviewersFor('src/efile/mef-transmit.ts').includes('tax-reviewer'));
  assert.ok(reviewersFor('src/safeguards/pub-4557-controls.ts').includes('tax-reviewer'));
  assert.ok(reviewersFor('src/consent/section-7216-consent.ts').includes('tax-reviewer'));
  assert.ok(reviewersFor('src/onboarding/tax-prep-intake.ts').includes('tax-reviewer'));
});

test('tax-reviewer does NOT attach on generic sales-tax/tax-rate commerce code', () => {
  assert.deepEqual(reviewersFor('src/checkout/tax-rate.ts'), []);
  assert.deepEqual(reviewersFor('src/pricing/sales-tax-calc.ts'), []);
});

// ─── no double-attach on a plain, unrelated path ──────────────────────────

test('a plain unrelated file attaches no reviewers', () => {
  assert.deepEqual(reviewersFor('src/components/Button.tsx'), []);
  assert.deepEqual(reviewersFor('README.md'), []); // also EXCLUDE-filtered
});
