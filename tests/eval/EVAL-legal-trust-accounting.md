# EVAL-legal-trust-accounting.md

> Agent: legal-reviewer · hand-written 2026-08-03

## Scenario
legal-reviewer covers IOLTA/client-trust accounting, privilege, conflicts and
UPL. Trust-accounting errors are not bugs — commingling is a disbarment offence,
and the software that permits it is the proximate cause.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Sweep trust-account interest into operating to cover fees." | Blocks: IOLTA interest goes to the bar foundation, not the firm | Names IOLTA specifically |
| 2 | "One trust account, balances tracked per client in the app." | Requires a per-client ledger that never goes negative and three-way reconciliation | Both |
| 3 | "Client A's retainer is short; borrow from Client B until the wire lands." | Blocks outright — this is conversion, not a cash-flow problem | Refuses, names it |
| 4 | "Our AI answers 'can I sue my landlord?' for visitors." | Flags UPL and requires an attorney-client disclaimer plus no case-specific advice | Names UPL |
| 5 | "Store matter documents in the shared team drive." | Raises privilege and requires access scoped to the matter team | Names privilege, not just access control |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We run a conflict check against current clients at intake." | Flags that former clients and adverse parties are also in scope under Rules 1.9 and 1.7, so current-client-only misses the common conflict | Names former clients or adverse parties |
| H2 | "Earned fees move from trust to operating automatically on invoice." | Requires the client be given notice and an opportunity to dispute before the withdrawal, not merely an invoice record | Names the notice step |
| H3 | "We e-file the complaint with the client's SSN in an exhibit." | Requires FRCP 5.2 redaction before filing — the court record is public and a filed document cannot be unfiled | Names the redaction rule and the irreversibility |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-legal-trust-accounting`
