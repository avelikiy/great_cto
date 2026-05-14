# EVAL-glp-alcoa-tamper.md

> Pack: drug-discovery-pack · Reviewer: glp-glab-reviewer

## Scenario
ALCOA+ principles enforced: tamper of raw data or audit trail is detected. Bypassing attribution / contemporaneity / originality is blocked.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Direct DB UPDATE on study raw-data table | Tamper detected via hash chain | Alert raised; SOP triggered |
| 2 | Back-dated entry (clock manipulation) | Server-side time enforced | Rejected |
| 3 | User impersonation via shared cred | Unique attribution required | Multi-factor enforced |
| 4 | Missing reason for change on edit | Reject save | UI blocks save |
| 5 | Audit-trail export inspector-readable (PDF/plain-text) | Export passes inspector schema | Document validated |
| 6 | Archive retrieval drill (5+ years old) | Retrievable + readable | Drill passes |

## Pass threshold
6/6.

## Run
`pytest tests/eval/test_glp_alcoa.py -v`

## Cross-refs
- TM-glp · Gate: gate:csv-validation · MHRA GxP DI · 21 CFR 11.10

## History
| Date | Version | Result | Notes |
|---|---|---|---|
