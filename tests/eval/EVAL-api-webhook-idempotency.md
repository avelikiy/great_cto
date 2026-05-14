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

## Pass threshold
5/5.

## Run
`pytest tests/eval/test_webhook_idempotency.py -v`

## Cross-refs
- TM-api · Gate: gate:api-contract

## History
| Date | Version | Result | Notes |
|---|---|---|---|
