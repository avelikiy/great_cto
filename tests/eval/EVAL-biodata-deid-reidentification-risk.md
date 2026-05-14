# EVAL-biodata-deid-reidentification-risk.md

> Pack: clinical-trials-pack · Reviewer: bio-data-reviewer

## Scenario
De-identified dataset re-identification risk ≤ 0.04 (Expert Determination threshold) or full Safe Harbor compliance.

## Cases
| # | Method | Expected | Pass |
|---|---|---|---|
| 1 | Safe Harbor — verify all 18 identifiers removed | 0 of 18 remain | Static scan + manual sample |
| 2 | Expert Determination — k-anonymity / l-diversity | k ≥ 5; l ≥ 2 per equivalence class | Calculation passes |
| 3 | Quasi-identifier combinations (ZIP3 + DOB-year + sex) | Re-id probability ≤ 0.04 | Statistical expert sign-off |
| 4 | Linkage attack with public datasets | ≤ 0.04 | Simulated attack passes |
| 5 | Genomic data | Expert Determination + access control documented | Memo present |
| 6 | DICOM exports | Burned-in PHI detector passes 100% | Pixel-data scanner clean |

## Pass threshold
Risk ≤ 0.04 + documented method.

## Run
`pytest tests/eval/test_biodata_deid.py -v`

## Cross-refs
- TM-biodata · Gate: gate:deidentification · HIPAA Privacy Rule 164.514

## History
| Date | Version | Result | Notes |
|---|---|---|---|
