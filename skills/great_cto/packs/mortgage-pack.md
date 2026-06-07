---
name: mortgage-pack
description: Fair-lending + consumer-protection overlay for mortgage origination / underwriting products — autonomous credit decisions on home loans. Covers ECOA / Reg B disparate impact (ZIP-as-race proxy), TILA / RESPA / TRID disclosure timing, HMDA LAR + GMI handling, adverse-action notices (30-day, ≤4 reasons), SAFE Act loan-originator licensing, GSE/FHA/VA underwriting guidelines, CFPB UDAAP, and a mandatory human underwriter sign-off.
when_to_use: Product underwrites, prices, or makes approve/decline decisions on residential mortgage applications, or generates TRID disclosures / HMDA LAR data. Pairs with service-autopilot-pack when underwriting runs autonomously.
applies_to:
  - mortgage
extends: []
---

# Mortgage (Underwriting) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: mortgage, home loan, underwriting,
> loan origination, LOS, TRID, RESPA, loan estimate, closing disclosure, HMDA, LAR, GSE,
> Fannie Mae, Freddie Mac, FHA, VA, DTI, LTV, AUS, DU, LP, adverse action, fair lending, redlining.
> Routes through `lending-credit-reviewer` (fair-lending + adverse-action threat model) + adds the underwriter gate.

## Reviewer

- **lending-credit-reviewer** runs BEFORE senior-dev → writes `TM-mortgage-{slug}.md`
  - Requires an adverse-action engine: 30-day notice, ≤4 specific principal reasons mapped from model features
  - Fair-lending disparate-impact pipeline (4/5-rule, BISG proxy, ZIP-as-race-proxy audit) on the LAR population
  - TILA/RESPA/TRID disclosure-timing guardrail (Loan Estimate / Closing Disclosure clocks)
  - HMDA GMI capture at application (excluded from underwriting features) + validated LAR emission
  - Confidence-floor → human underwriter sign-off on declines and high-risk approvals

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:underwriter-signoff` | Below the autonomy-confidence floor + on every decline and fair-lending-high pattern, before the decision is final | Licensed mortgage underwriter (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the fair-lending / disclosure obligations. The licensed
> underwriter is the human escalation target for the autopilot's below-floor and high-risk decisions.

## Required artefacts in every mortgage project

| Artefact | Location | Owner |
|---|---|---|
| Adverse-action engine (30-day, ≤4 reasons, SHAP→reason mapping) | `docs/mortgage/adverse-action.md` | lending-credit-reviewer + architect |
| Fair-lending disparate-impact pipeline (4/5-rule, BISG, ZIP-proxy audit) | `docs/mortgage/fair-lending.md` | senior-dev |
| TILA/RESPA/TRID disclosure-timing engine (LE / CD clocks) | `docs/mortgage/trid-timing.md` | senior-dev |
| HMDA GMI capture + validated LAR pipeline (edit checks) | `docs/mortgage/hmda-lar.md` | senior-dev |
| GSE/FHA/VA underwriting-guideline rule engine (DTI/LTV/AUS) | `docs/mortgage/uw-guidelines.md` | architect |
| Confidence floor + underwriter sign-off workflow | `docs/mortgage/underwriter-signoff.md` | architect |
| SAFE Act loan-originator licensing matrix (state + NMLS) | `docs/mortgage/safe-act-licensing.md` | architect |
| UDAAP review of flows + marketing + disclosures | `docs/mortgage/udaap.md` | security-officer |

## Golden eval cases

- `EVAL-mtg-zip-proxy` — a model that uses ZIP code (or a tight ZIP correlate) as a feature is caught
  as a redlining / race-proxy risk and blocked or routed to fair-lending review, not auto-deployed.
- `EVAL-mtg-auto-approve-no-underwriter` — a decision below the confidence floor or matching a
  fair-lending-high pattern that is auto-finalized without `gate:underwriter-signoff` is blocked.
- `EVAL-mtg-no-adverse-action` — a decline that issues no ECOA adverse-action notice (or generic,
  non-specific reasons, or outside 30 days) is flagged and blocked.
- `EVAL-mtg-skip-trid` — a flow that delivers a Loan Estimate or Closing Disclosure outside the
  TRID timing windows (or omits one) is flagged.
- `EVAL-mtg-no-hmda` — demographic GMI leaks into underwriting features, or the LAR is emitted
  without passing FFIEC field-level edit checks, is flagged.

## Decision trees

### Can this mortgage decision be finalized autonomously?

```
Is the decision an approve (not a decline), fair-lending-clean (no ZIP/proxy risk,
within 4/5-rule parity), TRID-timing-compliant, with HMDA GMI captured-but-excluded,
AND is model confidence ≥ the floor, AND NOT a fair-lending-high pattern?
  ├─ YES → autonomous decision, logged with the LAR + fair-lending trace.
  └─ NO  → escalate to a licensed underwriter (gate:underwriter-signoff) before it is final;
            every decline issues an ECOA adverse-action notice (30-day, ≤4 specific reasons).
```

## What this pack does NOT do

- It does not underwrite loans itself or replace a licensed underwriter — it forces the underwriter
  into the loop on declines and above the confidence floor and makes the fair-lending / TRID / HMDA
  surface explicit.
- It does not cover servicing, securitization, or deposit banking — pair with the relevant pack
  when the product extends past origination/underwriting.
