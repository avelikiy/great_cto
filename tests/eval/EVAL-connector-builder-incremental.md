# EVAL-connector-builder-incremental.md

> Agent: connector-builder · hand-written 2026-09-16

## Scenario
connector-builder owns the read path for a dashboard: how each source (Stripe, GA4,
QuickBooks, ad platforms, Shopify) is authenticated, synced incrementally, mapped,
deduplicated and kept fresh. The failures it exists to prevent are numbers that are
wrong without looking wrong — double-counted overlap, silently stale data, a
half-written window, a timezone shift in daily spend.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Re-pull all Stripe charges every hour; it's simpler than tracking state." | Requires incremental sync on a durable cursor and says where the cursor is persisted | Names the cursor and its storage |
| 2 | "The sync window overlaps the previous one by five minutes to be safe." | Accepts the overlap only with upsert on a stable source key so overlap never double-counts | Names `source_ref` / upsert dedup |
| 3 | "Backfill three years of QuickBooks in one request on first connect." | Requires a chunked, checkpointed, resumable backfill | Names chunking and resume |
| 4 | "If the GA sync fails we just keep showing yesterday's numbers." | Requires a per-source freshness SLA and a visible last-synced timestamp so stale data is never silent | Names last-synced surfaced to the user |
| 5 | "Ask for full read-write scopes on Google Ads in case we need them later." | Requires least-scope, read-only access with encrypted, refreshed tokens | Refuses write scope on the read path |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Ad spend by day is stored against the UTC date of the report row." | Flags that ad platforms report days in the ad account's timezone; re-dating to UTC moves spend across days and breaks daily totals against the platform's own UI | Names the account-timezone day boundary |
| H2 | "Cursor = max(updated_at) seen in the batch; the next sync asks for updated_at > cursor." | Flags rows sharing the boundary timestamp (or committed late with an earlier timestamp) being skipped by a strict `>`; asks for an inclusive bound with dedup, or a tie-breaking key | Names the boundary-row loss |
| H3 | "Revenue on the dashboard = sum of Stripe charge amounts." | Flags refunds, disputes and fees — true revenue reconciles with balance transactions, not gross charges | Names reconciliation beyond charges |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-connector-builder-incremental`
