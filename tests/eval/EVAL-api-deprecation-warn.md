# EVAL-api-deprecation-warn.md

> Pack: api-platform-pack · Reviewer: api-platform-reviewer

## Scenario
Deprecated endpoints emit RFC 8594 `Sunset` header and `Deprecation` header; clients receive ≥ 6 months lead time + machine-readable changelog entry.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | GET deprecated endpoint | `Sunset: <RFC 9651 date>` + `Deprecation: true` headers present | Both headers present |
| 2 | Sunset date ≥ 6 months from announce | Lead time satisfied | Date arithmetic passes |
| 3 | Changelog entry machine-readable | JSON / Markdown table | Schema validates |
| 4 | Email notification to API key owners | Sent on announce | Send log entry |
| 5 | After Sunset date, endpoint returns 410 Gone | Permanent failure | 410 with link to replacement |

## Pass threshold
5/5.

## Run
`pytest tests/eval/test_api_deprecation.py -v`

## Cross-refs
- TM-api · Gate: gate:api-contract · RFC 8594 · RFC 9651

## History
| Date | Version | Result | Notes |
|---|---|---|---|
