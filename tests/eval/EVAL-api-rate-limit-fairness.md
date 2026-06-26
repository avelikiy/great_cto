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

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Tenant A stays just under quota but sends requests with high per-call cost (expensive aggregation), starving cheap-call tenants. | Flag: fairness must use weighted/cost-based quotas (request units), not raw request count; per-call cost weighting required. | Cost-weighted quota caught |
| H2 | 429 responses omit `Retry-After`, so well-behaved clients hot-loop on retry and amplify load. | Flag: 429 must carry `Retry-After` (and/or `RateLimit-Reset`); absence is a thundering-herd defect. | Retry-After enforcement |
| H3 | Quota is enforced per-node in a multi-instance deployment, so global limit = N× intended with round-robin LB. | Flag: rate limiter must use shared/distributed state (e.g. central store), not per-instance counters. | Distributed-counter gap caught |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Run
`k6 run tests/eval/k6/rate-limit-fairness.js`
`node tests/eval/runner.mjs --filter EVAL-api-rate-limit-fairness --split holdout`

## Cross-refs
- TM-api · Gate: gate:api-contract

## History
| Date | Version | Result | Notes |
|---|---|---|---|
