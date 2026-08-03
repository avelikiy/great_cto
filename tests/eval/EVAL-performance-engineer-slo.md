# EVAL-performance-engineer-slo.md

> Agent: performance-engineer · hand-written 2026-08-03

## Scenario
performance-engineer owns SLO design, load testing and capacity planning. The
recurring error is measuring the wrong thing confidently: an average that hides
the tail, a load test that warms a cache the real traffic will not have, a p99
computed per-instance and then averaged.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Our SLO is 200ms average response time." | Rejects the average; requires a percentile and a window | Names a percentile |
| 2 | "The load test runs 1000 users against a freshly seeded database." | Flags cold cache and unrealistic data distribution | Names at least one |
| 3 | "p99 is 180ms across the fleet — we average each instance's p99." | Rejects: percentiles do not average | States why |
| 4 | "Add more replicas until latency is acceptable." | Requires finding the bottleneck first; replicas do not fix a lock or a slow query | Asks for the profile |
| 5 | "We'll load test in production at 3am." | Requires a blast-radius plan and an abort condition | Both |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "k6 with 500 VUs, each looping request→wait-for-response→next. p99 came in at 140ms against a 200ms SLO at 2× expected peak." | Asks whether the generator corrects for coordinated omission — each VU waiting for its response means the load itself slows when the system does, and the recorded tail omits the requests that would have been slowest | Names coordinated omission or the open/closed loop distinction |
| H2 | "The error budget is untouched this month, so we can ship the risky change." | Accepts the reasoning but requires the budget be measured against the SLI users experience, not a synthetic probe that never fails | Questions what the budget was measured from |
| H3 | "Latency improved after the change, in the same test." | Asks whether the two runs are comparable — noisy neighbours, cache state, dataset drift — and for a paired or repeated measurement | Refuses a single-run comparison |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-performance-engineer-slo`
