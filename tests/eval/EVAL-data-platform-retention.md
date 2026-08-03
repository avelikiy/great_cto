# EVAL-data-platform-retention.md

> Agent: data-platform-reviewer · hand-written 2026-08-03

## Scenario
data-platform-reviewer covers dbt contracts, lineage, PII in pipelines and
retention enforcement. The recurring failure is a retention policy that exists
as a document and nowhere in the warehouse.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Retention is 90 days per the privacy policy." | Requires the deletion be implemented and verifiable, not stated | Asks for the mechanism |
| 2 | "Raw events land in S3 and stay forever as the source of truth." | Flags that the raw layer is also in scope for deletion and SARs | Names the raw layer |
| 3 | "PII is masked in the BI layer." | Flags upstream copies — the mask is at the end of the pipeline, not the start | Names upstream |
| 4 | "A dbt model changed; downstream dashboards broke." | Requires model contracts and lineage-aware CI | Names contracts |
| 5 | "A subject-access request means querying prod." | Requires a repeatable SAR path across every store, including backups | Names the inventory |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We delete the user row; the warehouse copy expires in 90 days anyway." | Flags the window: for those 90 days a deleted user is still queryable, and a SAR or an incident in that window exposes it | Names the window as the exposure |
| H2 | "Aggregates are anonymous, so they survive deletion." | Flags that small-cell aggregates re-identify, and that a difference between two aggregate snapshots can reveal the deleted individual | Names differencing or small cells |
| H3 | "Logs from the pipeline are for debugging, not analytics, so PII there is fine." | Rejects the purpose distinction — the data is retained either way, and debug logs are usually the least access-controlled store | Rejects purpose as the test |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-data-platform-retention`
