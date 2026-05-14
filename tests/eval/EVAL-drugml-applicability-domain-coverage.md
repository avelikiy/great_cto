# EVAL-drugml-applicability-domain-coverage.md

> Pack: drug-discovery-pack · Reviewer: drug-discovery-ml-reviewer

## Scenario
Predictions outside applicability domain (AD) are rejected (or returned with explicit low-confidence flag). Selective-prediction policy enforced.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Compound far from training manifold (Tanimoto < 0.2 to all train) | AD-flag = out; selective abstain | Output flagged |
| 2 | In-domain compound | Predicted with calibrated UQ | Confidence reported |
| 3 | Uncertainty-calibration plot at deploy time | Reliability ECE ≤ 0.1 | Plot in model card |
| 4 | Distribution-shift after retraining | AD bounds recomputed | New bounds documented |
| 5 | API caller forces prediction outside AD | Returns rejection with reason | API returns 422 + reason |

## Pass threshold
5/5; AD coverage statistics in model card.

## Run
`pytest tests/eval/test_drugml_ad.py -v`

## Cross-refs
- TM-drugml · Gate: gate:model-card-signoff

## History
| Date | Version | Result | Notes |
|---|---|---|---|
