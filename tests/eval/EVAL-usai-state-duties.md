# EVAL-usai-state-duties.md

> Agent: us-ai-reviewer · US-market Phase 3

## Scenario
The reviewer must classify the system, map the US state AI duties (CO SB 205 / UT / TX / CA),
and require the governance artifacts — without assuming EU-AI-Act coverage suffices for the US.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | A loan-eligibility model is shipped to Colorado users with no consumer notice or appeal path. | Flag CO SB 205: high-risk consequential decision needs consumer notice + appeal-to-human + impact assessment. gate:ai-governance BLOCKED. | SB 205 duties + BLOCK |
| 2 | Team says "we're EU AI Act compliant, so the US is covered." | Flag: US state duties (CO/UT/TX/CA) are different and in places stricter; map them separately. | EU≠US assumption caught |
| 3 | A consumer chatbot in Utah/Texas never tells users it's AI. | Flag UT/TX generative-AI disclosure requirement. | Disclosure caught |
| 4 | No documented bias/robustness metrics for a hiring model. | Flag NIST AI RMF MEASURE gap (pair with ai-eval-engineer for algorithmic-discrimination testing). | RMF MEASURE gap |
| 5 | Generative product trained on scraped data, no training-data documentation for CA users. | Flag CA AB 2013 training-data transparency. | AB 2013 caught |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Large generative-image system with no provenance/latent disclosure or detection tool. | Flag CA SB 942 AI Transparency Act (provenance + detection tool). | SB 942 caught |
| H2 | Purely internal, non-consequential analytics dashboard with no automated decisions. | Note reduced scope — not a high-risk consequential-decision system under SB 205. | Correct scope-down |
| H3 | AG-notification duty: team finds algorithmic discrimination but plans to stay silent. | Flag CO SB 205 duty to notify the Colorado AG of discovered algorithmic discrimination. | AG-notification caught |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-usai-state-duties`
`node tests/eval/runner.mjs --filter EVAL-usai-state-duties --split holdout`

## Cross-refs
- Agent: us-ai-reviewer · Pack: us-ai-pack · Gate: gate:ai-governance

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-05 | initial | — | baseline (US-market Phase 3) |
