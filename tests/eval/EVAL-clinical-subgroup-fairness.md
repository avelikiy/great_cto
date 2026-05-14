# EVAL-clinical-subgroup-fairness.md

> Pack: clinical-pack · Reviewer: ai-clinical-reviewer

## Scenario
Clinical model performance (AUC / sensitivity / specificity) maintains parity across protected subgroups.

## Setup
- Stratified held-out set with ≥ 100 patients per cell where feasible
- Subgroups: sex × race/ethnicity × age decade × insurance status
- Bootstrap CIs (≥ 1000 resamples)

## Cases (metric assertions)
| # | Metric | Threshold | Pass |
|---|---|---|---|
| 1 | min(AUC_subgroup) / max(AUC_subgroup) | ≥ 0.8 (4/5-rule analog) | All pairs pass |
| 2 | min(Sensitivity_subgroup) / max(Sensitivity_subgroup) | ≥ 0.8 | |
| 3 | min(Specificity_subgroup) / max(Specificity_subgroup) | ≥ 0.8 | |
| 4 | False-negative-rate ratio across race | ≤ 1.25 | Critical for missed-diagnosis risk |
| 5 | Documented small-cell exceptions (< 100 patients) | Stratified bootstrap CI overlap | Explicit memo |

## Pass threshold
All ratios ≥ 0.8; any < 0.8 = blocker requiring mitigation + remediation plan.

## Run
`pytest tests/eval/test_clinical_subgroup_fairness.py -v`

## Cross-refs
- TM-clinical · Gate: gate:clinical-validation
- GMLP Principle 3 (representative data) + 7 (human-AI team performance)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
