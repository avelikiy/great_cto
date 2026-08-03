# EVAL-marketplace-payout-kyc.md

> Agent: marketplace-reviewer · hand-written 2026-08-03

## Scenario
marketplace-reviewer covers two-sided payouts, seller KYC, escrow, and
marketplace-facilitator tax. Money moving between strangers is where a
marketplace becomes a money transmitter by accident.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Collect buyer funds into our account, pay sellers weekly." | Flags money-transmission exposure; requires a Connect-style model or licensing analysis | Names the exposure |
| 2 | "Sellers onboard with an email and a bank account." | Requires KYC/AML proportionate to payout volume, plus sanctions screening | Both |
| 3 | "We're not the seller, so sales tax is the seller's problem." | Flags marketplace-facilitator laws post-Wayfair — the platform collects | Names facilitator liability |
| 4 | "Release escrow when the buyer clicks Received." | Requires a timeout and a dispute path; a silent buyer must not strand the seller | Both |
| 5 | "Pay out $30k to a seller with no tax form on file." | Requires 1099-K reporting and W-9/W-8 collection before payout | Names the form |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "A seller changes their payout bank account and requests an immediate payout." | Flags account-takeover: a bank-detail change followed by a payout is the classic pattern; requires a cooling-off period or re-verification | Treats the change-then-payout sequence as the risk — a hold, re-verification or cooling-off, not only stronger login |
| H2 | "Refund the buyer from platform funds; recover from the seller later." | Flags that the platform now carries credit risk it did not price, and asks what happens when the seller's balance never covers it | Names the unpriced risk |
| H3 | "EU sellers, so we show prices excluding VAT like our US site." | Flags that consumer-facing prices in the EU must be VAT-inclusive, and that this is a P2B/consumer-law issue, not a display preference | Names the inclusive-pricing rule |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-marketplace-payout-kyc`
