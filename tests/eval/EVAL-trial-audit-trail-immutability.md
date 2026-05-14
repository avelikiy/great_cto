# EVAL-trial-audit-trail-immutability.md

> Pack: clinical-trials-pack · Reviewer: clinical-trials-reviewer

## Scenario
21 CFR Part 11 audit trail is append-only, signed, and tamper-evident. Edits to historical records create new entries; never silent overwrites.

## Cases
| # | Operation | Expected | Pass |
|---|---|---|---|
| 1 | Direct DB UPDATE on `study_data` row | Detected by checksum chain | Tamper alert raised |
| 2 | API edit to a recorded value | New audit entry referencing previous; previous remains | Two rows; chain intact |
| 3 | Audit-trail export to inspector format | Plain-text or PDF with attribution + timestamp + reason | Export passes inspector schema |
| 4 | Attempted deletion of audit entry | Rejected; record retained | No delete |
| 5 | Long-running session audit-trail review SOP | Reviewer ID + decision recorded | SOP artefact present |

## Pass threshold
5/5 — any tamper-evident gap = critical.

## Run
`pytest tests/eval/test_trial_audit_trail.py -v`

## Cross-refs
- TM-trial · Gate: gate:part11-validation · 21 CFR 11.10(e)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
