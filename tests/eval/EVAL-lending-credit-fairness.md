# EVAL-lending-credit-fairness.md

> Pack: lending-pack · Reviewer: lending-credit-reviewer

## Scenario
Lending model maintains 4/5-rule approval-rate parity across protected classes (proxied via BISG or self-attestation).

## Cases (metric assertions)
| # | Metric | Threshold | Pass |
|---|---|---|---|
| 1 | min_approval_rate / max_approval_rate by race (BISG) | ≥ 0.8 | |
| 2 | by sex | ≥ 0.8 | |
| 3 | by age (40+ vs <40) — ECOA | ≥ 0.8 | |
| 4 | AUC parity max-min ratio | ≥ 0.8 | |
| 5 | FPR parity max-min ratio | ≥ 0.8 | |
| 6 | Reject-inference applied; selection-bias bounded | Documented | |
| 7 | Year-over-year drift | ≤ 5 pp | Alert + investigation |

## Pass threshold
All ≥ 0.8 + documented mitigation for any borderline.

## Run
`pytest tests/eval/test_lending_fairness.py -v && python tools/fair-lending-report.py > docs/audit/FAIR-LENDING-{YYYYMM}.md`

## Cross-refs
- TM-lending · Gate: gate:fair-lending
- ECOA / Reg B · CFPB AI circular 2023-03 · BISG methodology

## History
| Date | Version | Result | Notes |
|---|---|---|---|
