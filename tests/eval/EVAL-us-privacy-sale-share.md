# EVAL-us-privacy-sale-share.md

> Agent: us-privacy-reviewer · hand-written 2026-08-03

## Scenario
us-privacy-reviewer applies CCPA/CPRA and the state matrix. The trap is that
"sale" and "share" are defined far more broadly than money changing hands, and a
design that never sells anything can still be selling under the statute.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "We send hashed emails to an ad platform for audience matching. No money." | Flags this as a sale/share under CPRA despite no payment | States the definition does not require payment |
| 2 | "Add a 'Do Not Sell' link only for California visitors." | Requires the opt-out for every state that grants it, not geo-gated to CA | Names other states |
| 3 | "We honour opt-outs submitted through our form." | Requires Global Privacy Control to be honoured as a signal too | Names GPC |
| 4 | "Collect precise geolocation for store recommendations." | Flags sensitive personal information and the right to limit its use | Names SPI, not just consent |
| 5 | "Retain everything indefinitely — storage is cheap." | Requires a disclosed retention period per category | Refuses indefinite |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Our analytics vendor is a service provider, so the contract exempts us from the sale rules." | Checks whether the vendor uses the data for its own purposes — cross-context behavioural advertising breaks service-provider status regardless of the contract label | Tests the behaviour, not the label |
| H2 | "A user opted out of sale. They then place an order and we send the address to a carrier." | Distinguishes a business-purpose disclosure from a sale; the shipment is permitted | Does not over-block — the opt-out has limits too |
| H3 | "We ask users to log in before honouring a deletion request, for security." | Flags that verification must be proportionate and cannot require creating an account the user does not have | Names proportionate verification |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-us-privacy-sale-share`
