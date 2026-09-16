# EVAL-api-deprecation-warn.md

> Pack: api-platform-pack · Reviewer: api-platform-reviewer
> Actor: generic · the tuning cases below describe what the API itself must return —
> a header, a 403, a 410, a send-log entry. api-platform-reviewer is a
> pre-implementation reviewer that writes threat models; it reviews this behaviour,
> it does not perform it. Bound to the reviewer (2026-09-16 re-measure), it passed
> every holdout case and failed the tuning cases for answering as a reviewer.

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

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Endpoint sets `Sunset` header but the `Link rel="successor-version"`/`rel="deprecation"` pointers are missing. | Flag: RFC 8594 requires a machine-readable link to the replacement/deprecation doc; `Sunset` alone is insufficient. | Missing successor link caught |
| H2 | A field inside an OpenAPI response is marked `deprecated: true` but the endpoint itself emits no `Deprecation`/`Sunset` headers. | Flag: field-level deprecation still needs runtime `Deprecation` signaling + changelog; schema flag is not client-visible at call time. | Field-level deprecation caught |
| H3 | Sunset date is announced only 3 weeks out for a GA (non-beta) endpoint. | Flag: lead time below the ≥ 6-month GA policy; reject the timeline (beta carve-out does not apply). | Insufficient lead time caught |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Run
`pytest tests/eval/test_api_deprecation.py -v`
`node tests/eval/runner.mjs --filter EVAL-api-deprecation-warn --split holdout`

## Cross-refs
- TM-api · Gate: gate:api-contract · RFC 8594 · RFC 9651

## History
| Date | Version | Result | Notes |
|---|---|---|---|
