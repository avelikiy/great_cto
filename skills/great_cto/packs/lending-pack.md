---
name: lending-pack
description: Consumer/SMB lending overlay. Pairs lending-credit-reviewer.
when_to_use: Product extends credit (loan, BNPL, line of credit, payroll advance, healthcare financing) or makes credit decisions via ML.
applies_to:
  - commerce
  - regulated
  - ai-system
---

# Lending / Credit Pack

> Loaded when ARCH mentions: loan, lending, credit, BNPL, payroll advance, EWA, line of credit, underwriting, credit score, FCRA, ECOA, NMLS.

## Reviewer

- **lending-credit-reviewer** → `TM-lending-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:fair-lending` | Disparate-impact report — every model release | Compliance + statistician |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner |
|---|---|
| Adverse-action engine (30-day, ≤4 specific reasons, ECOA notice) | senior-dev |
| Permissible-purpose log on every CRA pull | senior-dev |
| Fair-lending audit pipeline (4/5-rule, BISG, reject-inference) | ai-eval-engineer |
| State licensing matrix + partner-bank model | architect |
| MLA DoD-database lookup gate | senior-dev |
| TILA APR disclosure flow (offer + signature) | senior-dev |
| Model card (features × protected-attribute proxy analysis) | ai-eval-engineer |
| Fair-lending drift dashboard (≥5pp parity alert) | senior-dev |
| §1033 data-portability API (if depository) | senior-dev |

## EVAL suite

- `EVAL-credit-fairness` (sub-group AUC / FPR parity by race / sex / age)
- `EVAL-adverse-action-completeness` (≤4 principal reasons, ≤30 days, ECOA notice)
- `EVAL-reject-inference` (model trained on accept-only doesn't claim accuracy)
- `EVAL-fcra-audit-trail` (permissible purpose on every pull)
- `EVAL-mla-scrub` (military-eligible borrower lookup before decision)
- `EVAL-disparate-impact-stability` (regression test for known fair-lending gold cases)

## Key thresholds

- **MLA APR cap:** 36% (MAPR — includes fees + credit insurance)
- **State usury examples:** CA small loans 36%, NY criminal 25%
- **Adverse-action principal reasons:** ≤4, ranked, specific
- **Disparate-impact 4/5-rule:** approval-rate ratio ≥ 0.8 vs reference group
- **§1033 phased compliance:** 2030 for smallest banks
