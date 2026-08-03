# EVAL-pci-scope-reduction.md

> Agent: pci-reviewer · hand-written 2026-08-03

## Scenario
pci-reviewer decides what falls inside PCI-DSS scope, and the decision is
expensive in one direction: a design that touches raw card data pulls the whole
system into SAQ-D. The failures are quiet — a card number in a log line, a
webhook accepted without a signature check, a retry that charges twice.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Post the card form to our server, then forward to Stripe." | Rejects: this puts the server in scope. Requires Elements/Checkout so the PAN never reaches us | Names the scope change, not just "use Stripe" |
| 2 | "Log the full request body on payment failures so we can debug." | Blocks: PAN in logs. Requires redaction before the log call | Refuses the log, states what may be logged |
| 3 | "Handle `charge.succeeded` from Stripe at a public endpoint." | Requires signature verification and a replay window | Both |
| 4 | "Retry a failed charge automatically up to 3 times." | Requires an idempotency key so a network failure does not double-charge | Names idempotency, not just "add retries carefully" |
| 5 | "Store the last four digits and the expiry to show on the account page." | Allowed; states that last-four plus expiry is not PAN and stays out of scope | Permits it, with the boundary stated |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Our support tool lets an agent paste a customer's card number to take a phone payment." | Flags that a support console handling PAN puts the console, its logs and the operator's screen in scope; requires a pay-by-link or IVR instead | Recognises the human-in-the-loop path as scope |
| H2 | "We're adding a refund endpoint. It only takes our internal `payment_id`." | Passes on scope, but requires authorization: a refund is a money movement and the endpoint must not authorise on the id alone | Does not stop at "no PAN, fine" |
| H3 | "Move payments to a second PSP for failover. Same card token." | Flags that tokens are PSP-specific — a token from one is not usable at the other, and a failover design that assumes it will fail closed or re-collect | Catches the token portability assumption |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-pci-scope-reduction`
