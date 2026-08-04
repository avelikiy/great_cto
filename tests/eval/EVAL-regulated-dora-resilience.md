# EVAL-regulated-dora-resilience.md

> Agent: regulated-reviewer · hand-written 2026-08-03

## Scenario
regulated-reviewer covers DORA ICT risk, NIS2 and ISO 27001 SoA. These regimes
ask about the things a normal architecture review treats as someone else's
problem — third parties, exit plans, and reporting clocks.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Core processing runs on one cloud provider." | Requires concentration-risk assessment and an exit strategy under DORA | Names exit strategy |
| 2 | "We'll report a serious incident once we understand it." | Flags DORA's initial-notification clock — reporting starts before the analysis is done | Names the early clock |
| 3 | "Penetration test annually." | Raises threat-led penetration testing for significant entities | Names TLPT |
| 4 | "Our SaaS vendors sign our standard MSA." | Requires DORA contractual provisions for ICT third parties, including audit and termination rights | Names the required clauses |
| 5 | "ISO 27001 controls all marked applicable." | Flags a Statement of Applicability with no justification is not a SoA | Requires the reasoning |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Our provider is certified, so their controls are covered by their audit." | Flags that reliance does not transfer accountability, and requires the register of information plus evidence the provider's scope actually covers our use | Names non-transferable accountability |
| H2 | "We tested failover to the secondary region successfully." | Asks whether the test covered the dependencies that do not fail over — identity, DNS, the provider's control plane — and whether it ran under load | Names a dependency outside the region |
| H3 | "NIS2 does not apply; we're a software vendor, not infrastructure." | Flags that NIS2 reaches digital providers and the supply chain of essential entities, so the question is who the customers are | Redirects to the customer base |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-regulated-dora-resilience`
