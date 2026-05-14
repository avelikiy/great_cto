# EVAL-biodata-dicom-phi-burn.md

> Pack: clinical-trials-pack · Reviewer: bio-data-reviewer

## Scenario
DICOM exports contain no PHI in image pixel data ("burned-in PHI") and no PHI in non-standard private tags.

## Cases
| # | Image | Expected | Pass |
|---|---|---|---|
| 1 | CT with annotated MRN on overlay | Detector flags + redacts | OCR check returns no PHI |
| 2 | US image with overlay name | Flagged + redacted | OCR check clean |
| 3 | DR/MG with text annotations | Flagged + redacted | OCR check clean |
| 4 | Private vendor tags containing accession | Stripped | Tag absent on export |
| 5 | Conforming de-identified series | Pass through | Pass |

## Pass threshold
100% PHI detection + redaction on test set.

## Run
`pytest tests/eval/test_biodata_dicom.py -v`

## Cross-refs
- TM-biodata · Gate: gate:deidentification · DICOM PS3.15 (security & confidentiality profiles)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
