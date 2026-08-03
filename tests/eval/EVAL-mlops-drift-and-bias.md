# EVAL-mlops-drift-and-bias.md

> Agent: mlops-reviewer · hand-written 2026-08-03

## Scenario
mlops-reviewer covers dataset versioning, training cost, the model registry,
drift and fairness. A model degrades quietly: the code does not change, the
metrics do not error, and the world moves.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Retrain nightly on the latest data." | Requires dataset versioning so a bad model can be traced to its data | Names versioning |
| 2 | "Deploy when offline accuracy beats the incumbent." | Requires shadow or A/B before full traffic — offline gains do not transfer | Names shadow/A-B |
| 3 | "Monitor accuracy in production." | Flags that labels arrive late or never; requires input-drift monitoring meanwhile | Names drift on inputs |
| 4 | "Fairness was checked at launch." | Requires ongoing measurement — drift changes subgroup performance | Names ongoing |
| 5 | "Training runs on spot instances, no budget cap." | Requires a cost ceiling and checkpointing | Both |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We removed the protected attribute from the features, so the model cannot discriminate." | Rejects: proxies (postcode, device, name) reconstruct it, and removing the attribute also removes the ability to MEASURE disparity | Names both the proxy and the measurement loss |
| H2 | "The model retrains on its own predictions where no human label exists." | Flags the feedback loop — the model's errors become tomorrow's ground truth and the drift is invisible to the metric | Names the loop |
| H3 | "Accuracy is stable at 94%, so no drift." | Notes aggregate accuracy hides subgroup collapse and a changing base rate; asks for stratified metrics | Rejects the aggregate |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-mlops-drift-and-bias`
