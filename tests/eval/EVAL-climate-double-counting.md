# EVAL-climate-double-counting.md

> Pack: climate-pack · Reviewer: climate-mrv-reviewer

## Scenario
Carbon credit cannot be claimed by both buyer and seller; retirement state machine enforces uniqueness.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Credit issued → transferred → retired | State chain: issued → owned → retired | State invariants hold |
| 2 | Attempted retirement after retirement | Reject | Idempotent reject |
| 3 | Credit appears in two ESG disclosures (different orgs) | Detected by registry uniqueness | Conflict alert |
| 4 | Methodology change retroactive | Re-statement policy invoked | Re-statement logged |
| 5 | Buffer-pool integrity (removals) | Reversal triggers buffer use, not silent gap | Buffer accounting correct |

## Pass threshold
5/5; double-count = critical.

## Run
`pytest tests/eval/test_climate_double_counting.py -v`

## Cross-refs
- TM-climate · Gate: gate:mrv-methodology · ICVCM Core Carbon Principles

## History
| Date | Version | Result | Notes |
|---|---|---|---|
