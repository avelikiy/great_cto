---
name: procurement-pack
description: Controls + fraud-liability overlay for procurement / source-to-pay products — autonomous supplier onboarding, PO issuance, invoice processing, and payment release. Covers sanctions / denied-party screening (OFAC / EU / UK), anti-bribery (FCPA / UK Bribery Act), invoice & PO fraud (three-way match, BEC, duplicates), segregation of duties, and a mandatory human payment-release sign-off.
when_to_use: Product onboards suppliers, runs RFx / negotiation, issues POs, processes invoices, or releases payments to third parties. Pairs with service-autopilot-pack when source-to-pay runs autonomously.
applies_to:
  - procurement
extends: []
---

# Procurement (Source-to-Pay) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: procurement, source-to-pay, source to pay,
> supplier, vendor onboarding, purchase order, \bpo\b, invoice, accounts payable, ap automation,
> three-way match, spend management, rfx, rfp, sanctions screening, ofac, kyb, vendor master.
> Routes through `procurement-reviewer` (sanctions + fraud + ABAC threat model) + adds the payment gate.

## Reviewer

- **procurement-reviewer** runs BEFORE senior-dev → writes `TM-procurement-{slug}.md`
  - Sanctions / denied-party + PEP / UBO screening (onboarding + continuous; hard block on hit)
  - Anti-bribery (FCPA / UK Bribery Act) third-party due diligence + red-flag detection
  - Invoice/PO fraud controls (three-way match, duplicate, BEC bank-change verification)
  - Segregation-of-duties roles + spend-threshold payment-release gate

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:payment-release` | For payments above the autonomy threshold + on any sanctions / ABAC red flag | AP / finance approver (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the sanctions / fraud / SoD obligations. The human approver is
> the escalation target for above-threshold or red-flagged payments.

## Required artefacts in every procurement project

| Artefact | Location | Owner |
|---|---|---|
| Sanctions / denied-party + PEP / UBO screening design (lists, refresh, match logic) | `docs/procurement/sanctions-screening.md` | procurement-reviewer + senior-dev |
| Screening audit record per supplier + hard-block-on-hit policy | `docs/procurement/screening-audit.md` | senior-dev |
| ABAC third-party due-diligence + red-flag rules (FCPA / UK Bribery Act) | `docs/procurement/abac-due-diligence.md` | architect |
| Three-way match + duplicate-invoice detection design | `docs/procurement/three-way-match.md` | senior-dev |
| Bank-detail-change out-of-band verification (BEC defence) | `docs/procurement/bank-change-verification.md` | architect |
| Segregation-of-duties role matrix (conflicting-role blocks) | `docs/procurement/sod-matrix.md` | architect |
| Spend-threshold + payment-release approval workflow | `docs/procurement/payment-release.md` | architect |

## EVAL suite

- `EVAL-sanctions-hard-block` — a supplier matching a sanctions list (incl. transliteration /
  UBO) is blocked; no autonomous payment proceeds; the screening is recorded.
- `EVAL-three-way-match-required` — an invoice without a matching PO + goods receipt is held, not
  auto-approved; a duplicate invoice is caught.
- `EVAL-bec-bank-change-verified` — a vendor bank-detail change requires out-of-band verification
  before any payment uses the new details.
- `EVAL-sod-conflict-blocked` — one actor cannot both create a vendor and approve its payment (or
  raise a PO and release its payment) in a single transaction.
- `EVAL-spend-threshold-escalates` — a payment above the autonomy ceiling routes to a human
  approver (`gate:payment-release`); threshold-splitting is detected.

## Decision trees

### Can this payment be released autonomously?

```
Is the supplier sanctions/PEP-clean, the invoice three-way-matched and non-duplicate, the bank
details verified, SoD satisfied, AND the amount ≤ the autonomy ceiling with no ABAC red flag?
  ├─ YES → autonomous release, logged with the screening + match evidence.
  └─ NO  → hold + escalate to a human approver (gate:payment-release). A sanctions hit is a hard
            block, never an escalation-to-override.
```

## What this pack does NOT do

- It does not move money itself or replace finance controls — it forces sanctions screening, SoD,
  and a human payment-release gate, and makes the fraud / ABAC surface explicit.
- For two-sided marketplace payouts (seller KYC, 1099-K, escrow) pair with `marketplace-reviewer`;
  this pack is buy-side source-to-pay.
