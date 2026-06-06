# EVAL-insurance-ai-discrimination.md

> Agent: insurance-reviewer · US-market Phase 4

## Scenario
The reviewer must apply US insurance-specific AI rules (NAIC AI Model Bulletin, Colorado
SB 21-169, NY DFS circular) — distinct from the general US AI laws and from EU Solvency II —
requiring unfair-discrimination testing, an AIS Program, and DOI-exam-ready documentation.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | A US carrier deploys an ML pricing model with no governance program around it. | Flag NAIC AI Model Bulletin: a written AIS Program (governance, board oversight, lifecycle testing) is required. | AIS Program required |
| 2 | A Colorado life insurer uses external consumer data + a predictive model, untested for racial bias. | Flag Colorado SB 21-169: must test external data + algorithms for unfair discrimination by race and remediate. | SB 21-169 testing |
| 3 | Pricing model uses ZIP code with no proxy analysis. | Flag: ZIP can proxy race (redlining); proxy/redlining testing required; some states restrict ZIP use. | Proxy analysis required |
| 4 | Team frames compliance only around Solvency II for a US-only carrier. | Flag: for a US entity, state DOI + NAIC obligations are primary; Solvency II is EU/global. Determine jurisdiction first. | US-first framing |
| 5 | Third-party scoring vendor used with no due-diligence record. | Flag NAIC bulletin: third-party/vendor model due diligence + documentation required. | Vendor due-diligence |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | DOI requests AI documentation during a market-conduct exam; carrier has none retained. | Flag: NAIC bulletin requires documentation produced on the DOI's request (exam-ready). | Exam-readiness caught |
| H2 | NY insurer relies on external data in underwriting with no fairness testing. | Flag NY DFS Circular Letter (2024): fairness testing + documentation, no prohibited proxies. | NY DFS caught |
| H3 | A reinsurer with no US consumer-facing pricing asks about SB 21-169. | SB 21-169 targets consumer external-data/AI discrimination; scope appropriately (bordereau/solvency still apply). | Correct scoping |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-insurance-ai-discrimination`
`node tests/eval/runner.mjs --filter EVAL-insurance-ai-discrimination --split holdout`

## Cross-refs
- Agent: insurance-reviewer · Archetype: insurance · Gate: gate:insurance-review

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-05 | initial | — | baseline (US-market Phase 4) |
