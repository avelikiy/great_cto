# EVAL-lending-adverse-action-completeness.md

> Pack: lending-pack · Reviewer: lending-credit-reviewer

## Scenario
Every adverse-action decision produces a compliant notice within 30 days containing ≤ 4 specific, ranked principal reasons.

## Cases
| # | Decision path | Expected | Pass |
|---|---|---|---|
| 1 | ML model declines applicant | Notice with ≤ 4 specific reasons (SHAP → human-readable), ECOA notice, CRA score disclosure | All fields present + sent ≤ 30 days |
| 2 | Counter-offer (lower limit, higher APR) | Notice triggered (Reg B adverse action) | Same |
| 3 | Risk-tier shift mid-application | Notice | Same |
| 4 | Generic "low credit score" | Insufficient (need specific reason) | FAIL — must be specific |
| 5 | Applicant requests specific reasons in writing | Provided within 30 days | Compliance log entry |
| 6 | Multi-applicant (joint) | Each applicant receives notice | Per-applicant delivery |

## Pass threshold
6/6 — specifically check reason-specificity not just count.

## Run
`pytest tests/eval/test_lending_adverse_action.py -v`

## Cross-refs
- TM-lending · Gate: gate:fair-lending · CFPB Circular 2023-03 · Reg B 12 CFR 1002.9

## History
| Date | Version | Result | Notes |
|---|---|---|---|
