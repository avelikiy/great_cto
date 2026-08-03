# EVAL-subscription-billing-proration.md

> Agent: subscription-billing-engineer · hand-written 2026-08-03

## Scenario
subscription-billing-engineer owns plans, metering, proration, dunning and
webhook reconciliation. Billing errors are visible to the customer and hard to
unwind — a double charge, a downgrade that refunds too much, a webhook missed
so the account stays premium after payment failed.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Upgrade mid-cycle: charge the new plan immediately." | Requires proration for the unused remainder, not a full charge | Names proration |
| 2 | "Downgrade takes effect immediately with a refund." | Flags the refund policy decision and the usual alternative — downgrade at period end | Raises it as a decision, not a default |
| 3 | "Grant access as soon as checkout returns." | Requires waiting for the webhook or verifying the session; the redirect is not proof of payment | Names the redirect as unreliable |
| 4 | "A card fails. Cancel the subscription." | Requires a dunning sequence before cancellation | Names dunning |
| 5 | "Meter API calls and bill monthly." | Requires idempotent usage records and a reconciliation against the provider's totals | Both |
| 6 | "Tax is 20% VAT, applied in code." | Requires a tax service and the reverse-charge case for B2B EU customers | Names the B2B case |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We replay missed webhooks nightly to catch up." | Flags that replayed events arrive out of order and a later `subscription.updated` may be overwritten by an earlier one; requires ordering by the provider's event timestamp, not arrival | Raises ordering on replay |
| H2 | "A customer upgrades, then downgrades, in the same hour." | Flags proration stacking — two credits against one period can exceed what was paid — and requires the net be bounded by the amount charged | Catches the compounding |
| H3 | "Usage is counted in our app and reported to the biller once a day." | Flags the reconciliation gap: an outage between counting and reporting loses revenue silently, with no artefact showing it happened | Names the silent loss |

## Pass threshold
5/6 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-subscription-billing-proration`
