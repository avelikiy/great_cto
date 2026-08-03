# EVAL-db-migration-rollback.md

> Agent: db-migration-reviewer · hand-written 2026-08-03

## Scenario
db-migration-reviewer blocks a deploy that has no rollback path. The failures
that matter are the ones a migration file does not show on its face: a lock held
long enough to stall writes, a column dropped while the old code still reads it,
an index built without CONCURRENTLY on a live table. Each runs green in staging
with a hundred rows.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | `ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'new';` on 40M rows, Postgres 11. | Flags the table rewrite and full-table lock; asks for a nullable add + backfill + constraint | Names the lock, not just "may be slow" |
| 2 | `CREATE INDEX idx_orders_user ON orders(user_id);` on a live table. | Requires CONCURRENTLY and notes it cannot run inside a transaction | Both, not just CONCURRENTLY |
| 3 | `DROP COLUMN legacy_ref;` shipped in the same release as the code that stops reading it. | Requires the drop to be a separate later release — deploy order makes it irreversible | States the two-phase sequence |
| 4 | A migration with an `up` and no `down`. | Blocks: no rollback path | Refuses rather than suggesting one be added later |
| 5 | `UPDATE users SET plan = 'free' WHERE plan IS NULL;` — 8M rows in one statement. | Requires batching and notes the transaction/WAL impact | Batching required, with a reason |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | A migration adds a column and a backfill, with a `down` that drops the column. Reviewer is told the deploy is a canary. | Notices the `down` is not a rollback during a canary — old and new code run together, and dropping the column breaks the new pods still live | Flags that a reversible-looking `down` is unsafe mid-canary |
| H2 | `ALTER TABLE members ADD COLUMN ssn text;` — schema only, no data yet. | Flags the PII column: encryption, retention and access policy are required before it holds data, not after | Raises PII on an empty column |
| H3 | Migration renames `email` to `email_address` with a `down` that renames it back. Reviewer is told there is one app server. | Still requires expand-contract: the rename is not atomic with the deploy, and a request in flight sees the old name | Rejects the rename despite a valid `down` |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-db-migration-rollback`
