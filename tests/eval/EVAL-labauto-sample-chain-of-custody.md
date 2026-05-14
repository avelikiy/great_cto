# EVAL-labauto-sample-chain-of-custody.md

> Pack: drug-discovery-pack · Reviewer: lab-automation-reviewer

## Scenario
Every sample transfer is barcode-tracked from receipt → storage → instrument → result; lost samples trigger immediate alert.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Plate moved from storage to deck | Scan-out + scan-in events | Custody chain unbroken |
| 2 | Aliquot from parent → daughter | Parent-daughter link in DB | Lineage queryable |
| 3 | Reagent lot scan on use | Lot ID attached to result | Result has lot lineage |
| 4 | Mid-protocol error → partial results | Result tagged "partial"; sample status updated | No silent assumption of completion |
| 5 | Missing scan-in within SLA (e.g., 10 min) | Lost-sample alert | Alert raised |
| 6 | Expired reagent attempted | Blocked at scan | Block + log |

## Pass threshold
6/6.

## Run
`pytest tests/eval/test_labauto_custody.py -v`

## Cross-refs
- TM-labauto · Gate: gate:iq-oq-pq · GAMP 5 sample tracking patterns

## History
| Date | Version | Result | Notes |
|---|---|---|---|
