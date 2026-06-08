# TM-appraisal-{slug} — Real-Estate Appraisal / Valuation Threat Model

**Owner:** appraisal-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Signing a USPAP appraisal report is a regulated professional act reserved to a **state-licensed or
> state-certified appraiser**; the dominant failure mode is **a non-independent or non-credentialed
> opinion of value reaching a federally related transaction**, not a stale data point. This model forces
> a state-certified-appraiser sign-off into the pipeline.

## 1. Scope
- Pipeline: order intake → comparable-sales support (MLS) + AVM cross-check → USPAP report (Scope of Work, supportable opinion of value) → state-certified-appraiser sign-off → delivery (UAD / URAR, UCDP / EAD)
- Autonomy: suggest-to-appraiser (assistant) · autonomous-above-confidence (autopilot)
- Products: full · hybrid · desktop · avm …
- Setting: amc · lender-direct · gse …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Appraiser independence (Dodd-Frank Sec 1472 / TILA Reg Z 12 CFR 1026.42) | | no coercion to hit a target value |
| FIRREA Title XI | | federally related transactions, credentialed appraiser |
| USPAP (Scope of Work, supportable opinion, no advocacy) | | binding standard for a credentialed report |
| State licensing / certification | | only a state-certified appraiser may sign; AVM alone is NOT an appraisal |
| Hybrid / bifurcated appraisal | | still needs a credentialed signer of record |
| Valuation bias / fair housing (ECOA + Fair Housing Act) | | CFPB / HUD / PAVE enforcement on undervaluation |
| Reconsideration of Value (ROV) | | must be honoured, not suppressed |
| USPAP Record Keeping (workfile) Rule | | data, analysis, support retained per report |
| GSE delivery (Fannie / Freddie UAD / URAR Form 1004, UCDP / EAD) | | format + transmission rules |

## 3. Value→comp evidence trace (the USPAP / appraiser-independence defence)
| Field | Evidence span required | Present? |
|---|---|---|
| Opinion of value | comparable-sales grid + adjustments | |
| Comparable sales | MLS records + similarity rationale | |
| AVM cross-check | AVM run shown as a check, not the deliverable | |
| Signer | state-certified appraiser credential on the report | |

## 4. Edits & guardrails
- Opinion of value supportable from the comps grid, never anchored to the contract price / lender target: …
- AVM used as a cross-check only, never emitted as the signed appraisal: …
- Prohibited-basis / proxy signals (neighborhood demographics) kept out of the value; ROV path honoured: …
- USPAP workfile (data, analysis, support) retained + UAD / URAR validated pre-delivery: …

## 5. Autonomy boundary
- Confidence floor below which a report escalates to a state-certified appraiser: …
- Independence-high patterns always escalated (value moved toward a target, AVM-only value, comp change to support a number, bias / ROV signal): …
- Signer-of-record audit trail (who/what intaked, pulled comps, reconciled, and signed each report): … (composes with service-autopilot audit trail)

## 6. Fair housing, ROV & independence record
- Valuation-bias / fair-housing screen (ECOA + Fair Housing Act) enforced: …
- Reconsideration-of-Value (ROV) process honoured, not suppressed: …
- Per-report independence record (scope of work, comp support, proof no target value was conveyed): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:licensed-appraiser-signoff` — state-certified appraiser signs off on every appraisal report and on every independence-high pattern, before delivery to the lender.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
appraisal-reviewer-verdict: signed-off | blocked
appraisal-products: [full | hybrid | desktop | avm]
appraisal-setting: [amc | lender-direct | gse]
independence-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Value→comp evidence trace (the USPAP / appraiser-independence defence)
  - Supportable opinion of value, never anchored to the contract price / lender target
  - AVM used as a cross-check only, never emitted as a signed appraisal
  - State-certified appraiser signs every report (no AVM-as-appraisal, no uncredentialed signer)
  - Valuation-bias / fair-housing screen (ECOA + FHA) + working Reconsideration-of-Value (ROV) path
  - USPAP Record Keeping (workfile) + UAD / URAR validation before UCDP / EAD delivery
  - Every report → state-certified appraiser sign-off (gate:licensed-appraiser-signoff)
gate: gate:licensed-appraiser-signoff
