# EVAL-api-rate-limit-fairness.md

> Pack: api-platform-pack · Reviewer: api-platform-reviewer

## Scenario
One tenant cannot exhaust API capacity for other tenants. Per-tenant + per-resource quotas enforced.

## Cases
| # | Load pattern | Expected | Pass |
|---|---|---|---|
| 1 | Tenant A bursts 10× quota | Tenant A throttled (429); Tenant B unaffected | B p99 latency unchanged |
| 2 | Anonymous burst on heavy endpoint | Strict anon quota | Authenticated tier unaffected |
| 3 | LLM endpoint per-tier quota | Per-tier enforcement | Free-tier blocked at quota; paid passes |
| 4 | Distributed attack from N IPs | Rate-limit applies at tenant + IP | Per-tenant + per-IP both effective |
| 5 | RateLimit headers (RFC 9239) present | `RateLimit-Limit`, `-Remaining`, `-Reset` | All three headers on 200 + 429 |

## Pass threshold
5/5.

## Run
`k6 run tests/eval/k6/rate-limit-fairness.js`

## Cross-refs
- TM-api · Gate: gate:api-contract

## History
| Date | Version | Result | Notes |
|---|---|---|---|
