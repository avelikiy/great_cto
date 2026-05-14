# EVAL-trial-consent-versioning.md

> Pack: clinical-trials-pack · Reviewer: clinical-trials-reviewer

## Scenario
Each subject is bound to a specific version of informed consent; material protocol changes trigger re-consent.

## Cases
| # | Operation | Expected | Pass |
|---|---|---|---|
| 1 | New consent version published | Re-consent campaign queued for all active subjects | Job scheduled within 24h |
| 2 | Subject signed v1, protocol amendment requires v2 | Subject must re-consent; v1 data flagged | Status: re-consent-pending |
| 3 | Subject refuses re-consent | Withdrawal flow; Part 11 retention rules followed | Data retained per protocol; no new collection |
| 4 | Display correct version at signature | Version-pinned UI | UI shows version-binding |
| 5 | Audit shows version mapping per subject | One-to-many subject↔consent versions | Audit query passes |

## Pass threshold
5/5.

## Run
`pytest tests/eval/test_trial_consent.py -v`

## Cross-refs
- TM-trial · Gate: gate:irb-ready · FDA eConsent guidance

## History
| Date | Version | Result | Notes |
|---|---|---|---|
