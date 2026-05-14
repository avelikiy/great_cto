# EVAL-trial-ae-reporting-latency.md

> Pack: clinical-trials-pack · Reviewer: clinical-trials-reviewer

## Scenario
AE/SAE detection and reporting latencies meet ICH-GCP + 21 CFR 312 obligations.

## Cases
| # | Event | Expected | Pass |
|---|---|---|---|
| 1 | eCOA threshold breach indicates SAE | Auto-flag to investigator within 1h | Notification logged |
| 2 | Investigator → sponsor for SAE | ≤ 24h | Median p99 ≤ 24h |
| 3 | Sponsor → FDA fatal/life-threatening unexpected | ≤ 7 days | Audit timestamp passes |
| 4 | Sponsor → FDA serious + unexpected | ≤ 15 days | Audit timestamp passes |
| 5 | MedDRA coding correctness | ≥ 95% agreement with coder | Validation sample passes |

## Pass threshold
All latency SLAs met for 100% of events sampled.

## Run
`pytest tests/eval/test_trial_ae.py -v`

## Cross-refs
- TM-trial · Gate: gate:part11-validation · 21 CFR 312.32 · ICH E6(R3)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
