# TM-pharma-{slug} — Pharmacovigilance / Drug-Safety Threat Model

**Owner:** pharmacovigilance-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Pharmacovigilance is a regulated professional activity with a legally accountable person (the
> QPPV in the EU, the responsible drug-safety person in the US); the dominant failure mode is a
> **mis-triaged or mis-reported safety case** — a downgraded serious event, a missed expedited
> report, a wrongly closed case. This model forces a QPPV / drug-safety physician sign-off into the
> pipeline: no auto-downgrade of seriousness, no auto-close of a case without medical review.

## 1. Scope
- Pipeline: adverse-event intake → ICSR → MedDRA coding → de-dup → seriousness/expectedness triage → narrative → causality → E2B(R3) submission → signal
- Autonomy: suggest-to-physician (assistant) · autonomous-above-confidence (autopilot)
- Regions: fda · eu-ema · row …
- Products: drug · biologic …
- Submission targets: FAERS · EudraVigilance …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| FDA 21 CFR 314.80 (drugs) / 600.80 (biologics) | | post-marketing AE reporting |
| ICH E2A / E2B(R3) / E2D | | safety defs, e-ICSR format, expedited |
| Expedited 15-day reporting (serious-unexpected-suspected) | | the reporting clock |
| MedDRA coding accuracy | | verbatim → PT/SOC |
| Seriousness / expectedness / causality | | medical determination |
| FAERS / EudraVigilance E2B submission | | regulatory transmission |
| QPPV legal accountability (EU GVP Module I) | | named responsible person |
| Signal detection | | disproportionality / aggregate |
| 21 CFR Part 11 e-records / e-signature | | attributable, tamper-evident |

## 3. Determination→source-case evidence trace (the regulatory defence)
| Determination | Evidence required | Present? |
|---|---|---|
| Seriousness | source criteria (death/hosp/life-threat…) | |
| MedDRA coding | verbatim → PT/SOC mapping | |
| Expectedness | comparison vs reference safety info (CCDS/label) | |
| Causality / narrative | source data supporting assessment | |
| De-dup / case validity | match evidence + reporter/patient/product/event | |

## 4. Edits & guardrails
- No-auto-downgrade-of-seriousness guardrail before any state change: …
- No-auto-close-of-a-case-without-medical-review guardrail: …
- Expedited 15-day clock on every serious-unexpected-suspected case, surfaced for filing: …
- MedDRA current-version mapping; confidence floor → physician escalation on serious/fatal terms: …

## 5. Autonomy boundary
- Confidence floor below which a case/report escalates to the QPPV / drug-safety physician: …
- Safety-critical patterns always escalated (serious/fatal event, seriousness/expectedness change, expedited case, signal): …
- Physician-of-record audit trail (who/what determined and signed each case): … (composes with service-autopilot audit trail)

## 6. Submission & e-records
- E2B(R3) FAERS / EudraVigilance submission matches the signed determination: …
- 21 CFR Part 11: attributable, time-stamped, tamper-evident audit trail + QPPV e-signature: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:qppv-signoff` — QPPV / drug-safety physician signs off below the confidence floor and on every safety-critical pattern (serious/fatal event, seriousness/expectedness change, expedited case, signal), before any case state change or report submission.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
pharmacovigilance-reviewer-verdict: signed-off | blocked
pv-regions: [fda | eu-ema | row]
pv-products: [drug | biologic]
safety-critical-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Determination→source-case evidence trace + Part 11 audit trail (the regulatory defence)
  - No-auto-downgrade-of-seriousness + no-auto-close-without-medical-review guardrail
  - Expedited 15-day clock on every serious-unexpected-suspected case (ICH E2D / 21 CFR 314.80)
  - MedDRA current-version coding with confidence floor + serious/fatal escalation
  - Causality / seriousness / expectedness determined and signed by the physician (not auto)
  - Confidence floor → QPPV / drug-safety physician sign-off (gate:qppv-signoff)
  - E2B(R3) FAERS / EudraVigilance submission matches signed determination; 21 CFR Part 11 e-signature
gate: gate:qppv-signoff
