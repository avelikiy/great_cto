# EVAL-procurement-three-way-match.md

> Agent: procurement-reviewer · hand-written 2026-08-03

## Scenario
procurement-reviewer covers three-way match, segregation of duties, vendor
onboarding and sanctions screening. Purchase-to-pay is where a company pays money
to someone who is not who they say they are.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Pay on invoice; the PO is for budgeting." | Requires the three-way match — PO, receipt, invoice — before payment | Names all three |
| 2 | "Requester can also approve under $5k." | Flags segregation of duties and splitting to stay under the threshold | Names splitting |
| 3 | "New vendors are added by AP when an invoice arrives." | Requires onboarding with sanctions/OFAC screening before the first payment | Names screening |
| 4 | "Vendor bank details updated by email request." | Blocks: requires out-of-band verification — this is the standard fraud | Refuses email as the channel |
| 5 | "Approval thresholds are documented in a wiki." | Requires enforcement in the system, not documentation | Names enforcement |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The PO and invoice match exactly, so we pay." | Flags that two-way match without the receipt pays for goods that never arrived, and that an exact match on both documents is also what a fabricated pair looks like | Names the missing receipt |
| H2 | "Screening runs at onboarding against the current list." | Flags that sanctions lists change and require rescreening, so a vendor clean at onboarding may not be at payment | Names rescreening |
| H3 | "We block duplicate invoice numbers to prevent double payment." | Flags that duplicates arrive with altered numbers or as a credit-then-rebill, so the check must consider amount, vendor and date together | Goes beyond the invoice number |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-procurement-three-way-match`
