# TM-lending-{slug} — Lending / Credit Threat Model

**Owner:** lending-credit-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Scope
- Product type: term loan · BNPL · LOC · payroll-advance · EWA · healthcare-financing · SMB
- Decision engine: rule · ML · hybrid
- Borrower: consumer · SMB · cross-border
- States served: …
- CRA integrated: Experian · Equifax · TransUnion · alt-data (e.g., Plaid) · other

## 2. Applicability matrix
| Regulation | In scope? | Notes |
|---|---|---|
| ECOA / Reg B | | |
| FCRA | | |
| MLA (military) | | |
| TILA / Reg Z | | |
| UDAAP | | |
| CFPB §1033 | | |
| State licensing (NMLS) | | |
| State APR caps | | |

## 3. Adverse-action design
- Trigger paths: decline · counter-offer · risk-tier shift
- Principal-reason mapping: SHAP/attribution → ≤4 human-readable
- Notice delivery channel + 30-day SLA enforcement

## 4. Fair-lending analysis
- Protected attributes proxy: BISG · self-attestation
- Split: train / OOT / OOS
- 4/5-rule on approval-rate by race × sex
- Bayes-corrected vs raw
- Reject-inference method: ignored · augmented · MICE · …

## 5. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 6. Required artefacts
- [ ] Adverse-action engine
- [ ] Permissible-purpose log on every CRA pull
- [ ] Fair-lending audit pipeline
- [ ] State licensing matrix + partner-bank model
- [ ] MLA DoD scrub
- [ ] TILA APR disclosure flow
- [ ] Model card with proxy-risk analysis
- [ ] Fair-lending drift dashboard

## 7. EVAL required
- EVAL-credit-fairness · EVAL-adverse-action-completeness · EVAL-reject-inference · EVAL-fcra-audit-trail · EVAL-mla-scrub · EVAL-disparate-impact-stability

## 8. Gates
- gate:fair-lending · gate:ship

<!-- HANDOFF -->
lending-credit-reviewer-verdict: signed-off
critical-findings: 0
states-served: …
licenses-required: …
