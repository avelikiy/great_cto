---
name: aml-pack
description: KYC/AML / BSA compliance + regulatory-liability overlay for financial-onboarding and financial-crime service-autopilots — autonomous customer onboarding (IDV + KYB + beneficial-ownership), OFAC/sanctions + PEP/adverse-media screening, transaction monitoring, alert disposition, and SAR drafting. Covers Bank Secrecy Act / USA PATRIOT Act program obligations, FinCEN CDD + beneficial-ownership rule, OFAC strict-liability sanctions (a hit is a hard block), alert-disposition discipline, SAR filing + confidentiality (no tipping-off), state MTL — and a mandatory BSA/AML Officer personal sign-off.
when_to_use: Product onboards customers (IDV/KYB/beneficial ownership), screens against OFAC/sanctions/PEP/adverse-media lists, runs transaction monitoring/alert triage, or drafts/files SARs. Pairs with service-autopilot-pack when screening, monitoring, or filing runs autonomously.
applies_to:
  - aml
extends: []
---

# AML / BSA (KYC / Sanctions / SAR) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: kyc, kyb, aml, bsa, patriot act,
> onboarding, identity verification, idv, beneficial ownership, ubo, cdd, edd, ofac, sanctions,
> sdn, pep, adverse media, transaction monitoring, alert, disposition, sar, fincen, money
> transmitter, mtl, neobank, crypto on-ramp, off-ramp.
> Routes through `aml-bsa-reviewer` (BSA/OFAC + SAR threat model) + adds the BSA/AML Officer gate.

## Reviewer

- **aml-bsa-reviewer** runs BEFORE senior-dev → writes `TM-aml-{slug}.md`
  - OFAC/sanctions screen at onboarding + ongoing; a true positive is a hard block routed to a human
  - CDD + beneficial-ownership (25%/control) collection, verification, and screening
  - Customer risk-rating → CDD/EDD path; PEP + adverse-media surfaced with source evidence
  - Transaction-monitoring alerts with a documented, explainable disposition (no silent auto-close)
  - SAR filing discipline + confidentiality (no tipping-off); SAR access controls + audit trail

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:bsa-officer-signoff` | On every SAR filing + every high-risk onboarding approval (PEP, cleared sanctions near-match, EDD case) | designated BSA/AML Officer (human, of record) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the BSA/OFAC/SAR obligations. The BSA/AML Officer is the human
> escalation target — and the named owner of record carrying personal regulatory liability.

## Required artefacts in every aml project

| Artefact | Location | Owner |
|---|---|---|
| OFAC/sanctions screening design (onboarding + ongoing, 50%-rule, fuzzy match, logged hit/clear) | `docs/aml/sanctions-screening.md` | aml-bsa-reviewer + architect |
| CDD + beneficial-ownership (25%/control) collection + verification + screening | `docs/aml/cdd-beneficial-ownership.md` | senior-dev |
| Customer risk-rating → CDD/EDD routing; PEP + adverse-media with source evidence | `docs/aml/risk-rating-edd.md` | architect |
| Transaction-monitoring rules + alert-disposition workflow (documented, explainable) | `docs/aml/transaction-monitoring.md` | senior-dev |
| SAR drafting + filing-deadline + confidentiality (no-tipping-off) controls | `docs/aml/sar-filing.md` | architect |
| BSA/AML Officer sign-off workflow (SAR + high-risk onboarding) | `docs/aml/officer-signoff.md` | architect |
| Model/threshold explainability + examiner-reconstructable audit trail | `docs/aml/explainability-audit.md` | architect |
| State MTL / jurisdiction obligations matrix | `docs/aml/state-mtl.md` | security-officer |

## Golden eval cases

- `EVAL-aml-ofac-autoclear` — OFAC/SDN true positive hard-blocks and routes to a human; never auto-cleared.
- `EVAL-aml-sar-no-signoff` — SAR filed without BSA/AML Officer sign-off is blocked.
- `EVAL-aml-skip-ubo` — legal-entity onboarding skipping beneficial-ownership (25%/control) screening is flagged.
- `EVAL-aml-tipping-off` — leaking SAR existence into a customer-facing channel is caught and blocked.
- `EVAL-aml-pep-no-edd` — a PEP / adverse-media hit that fails to trigger EDD + analyst review is flagged.

## Decision trees

### Can this onboarding / disposition proceed autonomously?

```
Is the customer (and every 25%/control beneficial owner) sanctions-clean, risk-rated, and
NOT a high-risk pattern (PEP, cleared sanctions near-match, EDD case, SAR-worthy activity),
AND is model confidence ≥ the floor?
  ├─ YES → autonomous, logged with screening + disposition rationale (examiner-reconstructable).
  └─ NO  → escalate to the BSA/AML Officer (gate:bsa-officer-signoff). An OFAC true positive is a
           hard block regardless of confidence; SAR-worthy activity routes to the Officer to file.
```

## What this pack does NOT do

- It does not run the AML program or replace the BSA/AML Officer — it forces the Officer into the loop
  on SARs and high-risk approvals and makes the BSA / OFAC / FinCEN-CDD / SAR surface explicit.
- It does not cover *loss*-side fraud/chargeback risk — pair with a fraud/risk pack when the product
  also needs payment-loss controls. This pack owns *regulatory liability*, not loss.
