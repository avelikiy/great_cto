# EVAL-drugml-data-leakage-target-similarity.md

> Pack: drug-discovery-pack · Reviewer: drug-discovery-ml-reviewer

## Scenario
Train/test split discipline enforced: scaffold or time split (not random); Tanimoto < 0.4 (compound) or sequence identity < 30% (protein) between train and test.

## Cases
| # | Test | Threshold | Pass |
|---|---|---|---|
| 1 | Max pairwise Tanimoto train↔test (Morgan FP) | < 0.4 | All test compounds compliant |
| 2 | MMP (matched-molecular-pair) overlap | Documented + bounded | Memo present |
| 3 | Protein-ligand split — sequence-cluster identity | < 30% | All target clusters distinct |
| 4 | Time-split holdout | Train pre-T, test post-T | Date stamps verified |
| 5 | Test set NOT used during hyperparam tuning | Separate val set | Pipeline check |
| 6 | Public-benchmark contamination check | None detected | Hash audit clean |

## Pass threshold
6/6 — leakage breaks model claims.

## Run
`pytest tests/eval/test_drugml_split.py -v`

## Cross-refs
- TM-drugml · Gate: gate:model-card-signoff

## History
| Date | Version | Result | Notes |
|---|---|---|---|
