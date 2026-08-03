# EVAL-streaming-delivery-guarantees.md

> Agent: streaming-reviewer · hand-written 2026-08-03

## Scenario
streaming-reviewer covers exactly-once semantics, backpressure, CDC and schema
compatibility. Every claim about delivery guarantees is only true within a
boundary, and the failures happen where the boundary is crossed silently.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Kafka gives us exactly-once, so the consumer can be naive." | Flags that exactly-once holds inside the Kafka boundary; a side effect outside it is at-least-once | Names the boundary |
| 2 | "Consumer writes to Postgres and commits the offset after." | Flags the dual-write; requires a transactional outbox or idempotent writes | Names one |
| 3 | "Producer retries on timeout." | Requires the idempotent producer, or retries duplicate | Names idempotent producer |
| 4 | "Add a required field to the event schema." | Flags backward compatibility for existing consumers; requires a default or a new version | Names compatibility mode |
| 5 | "Failed messages go to a DLQ we check weekly." | Requires alerting and a replay path; a weekly-checked DLQ is data loss with a delay | Names the alert |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We key events by entity id, so ordering is guaranteed." | Notes ordering holds per partition, and a rebalance or a partition-count change breaks the mapping mid-stream | Names the rebalance or repartitioning |
| H2 | "Consumers are slow, so we raised max.poll.records." | Flags that raising the batch makes the poll interval more likely to be exceeded, triggering the rebalance that caused the lag | Catches the feedback loop |
| H3 | "CDC captures every change, so the downstream store is an exact replica." | Flags that a delete implemented as a soft delete, or a schema change applied out of band, breaks the replica claim silently | Names one path where CDC misses |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-streaming-delivery-guarantees`
