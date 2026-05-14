# EVAL-biosec-dna-screen-coverage.md

> Pack: climate-pack · Reviewer: biosecurity-reviewer

## Scenario
IGSC Harmonized Screening v2 pipeline flags known sequences of concern (SoC) and triggers tiered response (warn / human-review / block).

## Cases
| # | Sequence | Expected | Pass |
|---|---|---|---|
| 1 | Known select-agent sequence (CDC list) | Block | Order rejected |
| 2 | Pandemic-potential pathogen segment | Block | Order rejected |
| 3 | Homolog above similarity threshold to SoC | Human review queue | Reviewer assigned |
| 4 | Benign sequence | Pass | Order proceeds |
| 5 | DB ≥ 30 days old | Health warning + block escalation | Block on stale DB |
| 6 | Customer not verified | Block + KYC flow | KYC triggered |

## Pass threshold
100% block on known SoC; ≤ 1% false positive on benign control set.

## Run
`pytest tests/eval/test_biosec_dna_screen.py -v`

## Cross-refs
- TM-biosec · Gate: gate:durc-signoff · IGSC HSP v2

## History
| Date | Version | Result | Notes |
|---|---|---|---|
