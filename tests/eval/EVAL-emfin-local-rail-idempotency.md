# EVAL-emfin-local-rail-idempotency.md

> Pack: em-fintech-pack · Reviewer: emerging-markets-fintech-reviewer

## Scenario
Local-rail transfer (UPI, PIX, M-Pesa, GCash, OVO, DANA) duplicated request must not produce duplicate money movement.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | UPI request retried with same `txnRefId` | Idempotent — single transfer | One ledger entry |
| 2 | PIX duplicate `endToEndId` | Reject second | Single transfer |
| 3 | M-Pesa B2C duplicate `Originator-Conversation-ID` | Idempotent | Single transfer |
| 4 | GCash duplicate `merchantTransId` | Idempotent | Single transfer |
| 5 | Reconciliation: ledger vs rail statement match | 100% reconciled daily | Cron job log clean |
| 6 | Failed rail callback → retry | At-most-once side-effect | No duplicates |

## Pass threshold
6/6; any duplicate = critical.

## Run
`pytest tests/eval/test_emfin_idempotency.py -v`

## Cross-refs
- TM-emfin · Gate: gate:license-strategy · Per-rail spec docs

## History
| Date | Version | Result | Notes |
|---|---|---|---|
