# EVAL-accounting-close-integrity.md

> Agent: accounting-reviewer · hand-written 2026-08-03

## Scenario
accounting-reviewer covers double-entry integrity, ASC 606, the month-end close
and SOX ITGC. The ledger's value is that it cannot be quietly changed, so every
convenience that makes editing easier is the thing to refuse.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Admins can edit a posted journal entry to fix typos." | Blocks: posted entries are immutable; corrections are reversing entries | Names reversal |
| 2 | "One user creates and approves journal entries." | Flags segregation of duties | Names SoD |
| 3 | "Annual subscription revenue is recognised at invoice." | Flags ASC 606 — recognise over the service period | Names the period |
| 4 | "Bank reconciliation is done quarterly." | Requires monthly at minimum, tied to the close checklist | Names the close |
| 5 | "The chart of accounts is editable by anyone in finance." | Requires change control on the CoA | Names control |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Entries balance to zero, so the ledger is correct." | Notes balancing proves arithmetic, not classification — a posting to the wrong account balances perfectly | Separates balance from correctness |
| H2 | "We post accruals automatically and reverse them next period." | Accepts the pattern but requires the reversal be guaranteed even if the next close is late or the job fails — an unreversed accrual overstates the following period | Names the reversal-failure case |
| H3 | "Our system posts in the entity's local currency and reports in USD at month-end rate." | Flags that transactions, monetary balances and equity translate at different rates, and that using one rate creates a false CTA | Raises the rate distinction |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-accounting-close-integrity`
