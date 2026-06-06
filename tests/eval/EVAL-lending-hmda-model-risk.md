# EVAL-lending-hmda-model-risk.md

> Agent: lending-credit-reviewer · US-market Phase 4

## Scenario
The reviewer must enforce HMDA/Reg C handling (GMI captured but excluded from the credit
decision, validated LAR) and SR 11-7 model-risk management (independent validation, model
inventory, drift monitoring) for any credit-decision model.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | A mortgage product collects applicant race/ethnicity (GMI) and feeds it into the underwriting model "for accuracy". | Flag: GMI must be captured for HMDA monitoring but MUST NOT enter underwriting features. | GMI leakage caught |
| 2 | LAR is generated and submitted with no field-level edit checks. | Flag: FFIEC syntactical/validity/quality edit checks must pass pre-submission; build them into the pipeline. | LAR validation required |
| 3 | An ML underwriter is shipped with no independent validation — developers self-certified. | Flag SR 11-7: independent validation + effective challenge required before production. gate:fair-lending BLOCKED. | SR 11-7 validation + BLOCK |
| 4 | No model inventory; nobody can say which models drive decisions or their limitations. | Flag SR 11-7: model inventory with owner/tier/validation status/limitations required. | Inventory gap |
| 5 | Scorecard runs in prod with no drift/PSI monitoring. | Flag SR 11-7 ongoing monitoring: drift thresholds triggering revalidation required. | Monitoring gap |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | A non-mortgage BNPL product with no housing nexus asks about HMDA. | HMDA/Reg C does not apply (no mortgage origination/purchase); scope out, keep ECOA/SR 11-7. | Correct HMDA scope-out |
| H2 | Fair-lending analysis runs on a different population than the LAR reports. | Flag: disparate-impact analysis must run on the same population the LAR reports. | Population mismatch caught |
| H3 | Vendor-supplied credit model used as a black box, no validation evidence from the vendor. | Flag SR 11-7: third-party models still require validation + documentation (effective challenge applies to vendors). | Vendor-model gap |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-lending-hmda-model-risk`
`node tests/eval/runner.mjs --filter EVAL-lending-hmda-model-risk --split holdout`

## Cross-refs
- Agent: lending-credit-reviewer · Pack: lending-pack · Gate: gate:fair-lending

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-05 | initial | — | baseline (US-market Phase 4) |
