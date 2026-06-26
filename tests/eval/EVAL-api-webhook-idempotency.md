# EVAL-api-webhook-idempotency.md

> Pack: api-platform-pack · Reviewer: api-platform-reviewer

## Scenario
Webhook receiver and sender both honor idempotency. Duplicate deliveries do not duplicate side-effects.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Identical webhook delivered twice (same `Webhook-Id`) | Side-effect once | Receiver returns 200 both times; one DB row |
| 2 | Replay window > 5 min (signature) | Reject with 401 | Replay blocked |
| 3 | HMAC signature with tampered body | Reject | 401 |
| 4 | Receiver `Idempotency-Key` collision | Return cached response | 24h replay returns same body |
| 5 | Out-of-order delivery | Reconcile via timestamp | Event sequence reconstructable |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Same logical event redelivered after a retry but with a regenerated `Webhook-Id` (sender changed the id on retry). | Flag: idempotency must key on a stable event id / payload hash, not a per-attempt id; receiver would double-process. | Stable idempotency key caught |
| H2 | Receiver crashes after committing the side-effect but before recording the idempotency key, then the redelivery re-runs it. | Flag: side-effect and idempotency-key write must be atomic (single transaction / outbox); non-atomic ordering re-executes on replay. | Atomic dedup write enforced |
| H3 | Two duplicate deliveries arrive concurrently (race) before either has written the idempotency key. | Flag: dedup needs a unique-constraint / atomic insert-or-get under concurrency; check-then-act allows a double side-effect. | Concurrent-dup race caught |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Run
`pytest tests/eval/test_webhook_idempotency.py -v`
`node tests/eval/runner.mjs --filter EVAL-api-webhook-idempotency --split holdout`

## Cross-refs
- TM-api · Gate: gate:api-contract

## History
| Date | Version | Result | Notes |
|---|---|---|---|
