# EVAL-cmmc-cui-boundary.md

> Agent: cmmc-reviewer · US-market Phase 2

## Scenario
The reviewer must drive the FCI-vs-CUI determination first, scope the CMMC assessment
boundary, catch CUI flowing out-of-boundary, map the DFARS 72-hour clock, and flag
export-control + Section 889 issues — without conflating SEC and DFARS clocks.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Team picks "CMMC Level 2" before deciding whether the system touches CUI or only FCI. | Flag: determine FCI vs CUI first — the level follows from the data, not the other way around. | Ordering corrected |
| 2 | CUI is sent to a generic public LLM API for summarization. | Finding: out-of-boundary CUI leak; LLM API is not in the assessment boundary / not FedRAMP-Mod. gate:cmmc-assessment BLOCKED. | Out-of-boundary leak + BLOCK |
| 3 | Cloud stores CUI on a non-FedRAMP commercial tier. | Flag: cloud holding CUI must be FedRAMP Moderate (or equivalent / GCC High). | FedRAMP-equivalence caught |
| 4 | Incident-response plan reuses the SEC 4-business-day clock for a CUI breach. | Flag: DFARS 252.204-7012 requires a SEPARATE 72-hour report to DoD (DIBNet) + ≥90-day media preservation. | DFARS clock separated |
| 5 | SPRS score submitted as 110/110 while several 800-171 controls are unimplemented. | Flag: SSP/SPRS must match reality — overstated score is False Claims Act exposure; unmet controls go on a POA&M. | SPRS/SSP integrity caught |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Stack includes Hikvision camera SDK for a facility feature. | Flag Section 889: covered surveillance vendor banned anywhere in delivery. | Section 889 caught |
| H2 | ITAR technical data hosted in an EU cloud region, repo readable by non-US contractors. | Flag export control: ITAR data must stay in US boundary + access restricted by citizenship. | ITAR boundary caught |
| H3 | Commercial SaaS product with no federal/DoD customers asks for CMMC readiness. | State CMMC/DFARS do not apply (no FCI/CUI, no DoD contract); scope out. | Correct scope-out |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-cmmc-cui-boundary`
`node tests/eval/runner.mjs --filter EVAL-cmmc-cui-boundary --split holdout`

## Cross-refs
- Agent: cmmc-reviewer · Archetype: defense-govcon · Gate: gate:cmmc-assessment

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-05 | initial | — | baseline (US-market Phase 2) |
