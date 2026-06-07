# TM-prior-auth-{slug} — Prior-Authorization / Utilization-Management Threat Model

**Owner:** prior-auth-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Adjudication is a regulated coverage decision; the dominant failure mode is **a wrongful denial that
> delays or blocks medically necessary care** — patient-harm, regulatory, and reputational at once. An
> autopilot may approve/pend within criteria, but it may **never autonomously deny**: this model forces
> a plan-side medical-director sign-off into the pipeline.

## 1. Scope
- Pipeline: provider request + clinical chart → medical-necessity criteria match → determination (approve / pend / deny)
- Autonomy: suggest-to-reviewer (assistant) · autonomous-approve/pend-only (autopilot)
- Criteria sets: mcg · interqual · cms-ncd-lcd …
- Plan types: commercial · medicare-advantage · medicaid · self-funded-erisa …
- Review type: prospective · concurrent · retrospective · step-therapy · site-of-service · formulary

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Wrongful denial / bad-faith / algorithmic-denial liability | | deny is the gating action |
| CMS-0057-F turnaround + FHIR PARDD/Da Vinci | | 7-day / 72-hour, PAS/CRD/DTR |
| Medical necessity (MCG / InterQual / CMS NCD-LCD) | | current versioned criteria |
| Gold-card laws | | high-approval providers exempt |
| ERISA (self-funded plans) | | full-and-fair review + appeals |
| Appeals rights (internal + external/IRO) | | reason + criteria + how-to-appeal |
| URAC / NCQA UM accreditation | | physician-only adverse determination |
| HIPAA + minimum necessary | | PHI scoping per request |

## 3. Determination-path matrix
| Action | Allowed autonomously? | Evidence required |
|---|---|---|
| Approve (criteria met) | yes, within criteria | matched criteria version + chart spans |
| Pend (info needed) | yes | which criterion is unmet + what's missing |
| Deny (criteria not met) | **no — medical-director signoff** | criteria + chart + physician sign |
| Gold-card exempt | yes (skip review) | provider gold-card status check |

## 4. Criteria→chart evidence trace (the appeal defence)
- Criteria set + version recorded per determination (MCG / InterQual / CMS NCD-LCD): …
- Which clinical evidence in the chart satisfied (or failed) each criterion: …
- Stale-content guard — current versioned criteria applied, not a frozen snapshot: …

## 5. Adverse-determination gate
- Deny path *unreachable* without a recorded plan-side medical-director signoff: …
- Criteria + chart evidence fully traceable on every adverse determination (appeal/regulatory): …
- Coverage-decision audit trail (who/what determined each request): … (composes with service-autopilot audit trail)

## 6. Turnaround, interfaces & appeals
- CMS-0057-F clock (7-day standard / 72-hour expedited) tracked per request, with specific denial reason: …
- FHIR PARDD / Da Vinci (CRD/DTR/PAS) interfaces, not a proprietary format: …
- Gold-card exemption honored; ERISA full-and-fair review; appeal rights (internal + external/IRO): …

## 7. PHI
- Minimum-necessary scoping (only chart elements needed for the decision) + per-request access log: …

## 8. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 9. Required gates
- `gate:medical-director-signoff` — plan-side licensed physician signs every adverse determination; the deny path is unreachable without it.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
prior-auth-reviewer-verdict: signed-off | blocked
criteria-sets: [mcg | interqual | cms-ncd-lcd]
plan-types: [commercial | medicare-advantage | medicaid | self-funded-erisa]
adverse-determination-paths: <count requiring medical-director signoff>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Deny path unreachable without plan-side medical-director signoff (the mandatory gate)
  - Criteria→chart evidence trace with criteria set + version (the appeal/regulatory defence)
  - CMS-0057-F turnaround clock (7-day / 72-hour) + specific denial reason
  - FHIR PARDD / Da Vinci (CRD/DTR/PAS) interfaces, not a proprietary format
  - Gold-card exemption check + ERISA full-and-fair appeals (internal + external/IRO)
  - URAC/NCQA UM compliance; minimum-necessary PHI + per-request access log
gate: gate:medical-director-signoff
