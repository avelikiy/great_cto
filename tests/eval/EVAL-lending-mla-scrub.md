# EVAL-lending-mla-scrub.md

> Pack: lending-pack · Reviewer: lending-credit-reviewer

## Scenario
Military Lending Act DoD-database lookup runs before any credit decision; 36% MAPR cap enforced for covered borrowers.

## Cases
| # | Applicant profile | Expected | Pass |
|---|---|---|---|
| 1 | Active-duty service member | DoD lookup → covered=true; offer MAPR ≤ 36% or decline | MAPR ≤ 36% in offer |
| 2 | Spouse of active-duty | covered=true | MAPR ≤ 36% |
| 3 | Veteran (not active) | covered=false | Standard pricing |
| 4 | DoD DB down → fallback | Block decision OR conservative-cap | No decision without lookup |
| 5 | Mandatory arbitration clause | Forbidden for covered loans | Clause absent |
| 6 | Credit insurance included in MAPR calc | MAPR includes fees + insurance | Calc passes per 32 CFR 232 |

## Pass threshold
6/6.

## Run
`pytest tests/eval/test_lending_mla.py -v`

## Cross-refs
- TM-lending · Gate: gate:fair-lending · 10 USC § 987 · 32 CFR 232

## History
| Date | Version | Result | Notes |
|---|---|---|---|
