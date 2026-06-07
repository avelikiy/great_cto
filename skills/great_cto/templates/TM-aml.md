# TM-aml-{slug} — KYC/AML / BSA (Sanctions / SAR) Threat Model

**Owner:** aml-bsa-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> AML is a regulated program with a *named human owner of record*. The dominant failure mode is a
> **BSA/OFAC enforcement action and personal liability for the designated BSA/AML Officer**, not a
> chargeback. This model forces a BSA/AML Officer sign-off into the pipeline.

## 1. Scope
- Pipeline: onboarding (IDV + KYB + beneficial ownership) → sanctions/PEP/adverse-media screening →
  transaction monitoring → alert disposition → SAR
- Autonomy: suggest-to-analyst (assistant) · autonomous-above-confidence (autopilot)
- Screening lists: ofac-sdn · eu-consolidated · un · pep · adverse-media …
- Jurisdictions: us-fincen · mtl-{state} …
- Customer types: individual · legal-entity (with UBOs)

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Bank Secrecy Act / USA PATRIOT Act program (5 pillars) | | CMP + individual criminal exposure |
| OFAC sanctions (SDN / 50%-rule) | | strict liability — hard block |
| FinCEN CDD + beneficial-ownership rule | | 25% + control prong |
| EDD (PEP / high-risk geo / MSB / cash-intensive) | | enhanced due diligence |
| Transaction monitoring + alert disposition | | documented, explainable |
| SAR filing + confidentiality (no tipping-off) | | ~30-day deadline; tipping-off is a crime |
| State money-transmitter (MTL) | | per jurisdiction |
| Explainability / examiner audit trail | | no black-box AML |

## 3. Onboarding / CDD evidence trace
| Step | Evidence / control required | Present? |
|---|---|---|
| IDV (identity) | verified document + liveness/KYC result | |
| KYB + beneficial owners | entity verification + 25%/control UBOs screened | |
| Sanctions screen | OFAC/SDN + 50%-rule, fuzzy match, logged hit/clear | |
| PEP / adverse-media | hit surfaced with source evidence + EDD trigger | |
| Risk-rating | documented risk score → CDD vs EDD path | |

## 4. Screening & surveillance guardrails
- OFAC/sanctions screen at onboarding **and** ongoing, against current lists, logged decisions: …
- OFAC true positive = hard block (no auto-onboard / no fund release), routed to human: …
- Transaction-monitoring alerts → documented, explainable disposition (no silent auto-close): …
- Threshold/model tuning justified, back-tested, version-controlled: …

## 5. Autonomy boundary
- Confidence floor below which a case escalates to the BSA/AML Officer: …
- High-risk patterns always escalated (PEP, cleared sanctions near-match, EDD case, SAR-worthy): …
- Owner-of-record audit trail (who/what screened, disposed, filed): … (composes with service-autopilot audit trail)

## 6. SAR confidentiality & explainability
- SAR data segregation + access log; no tipping-off vector in any customer-facing channel: …
- SAR filing within deadline (generally 30 days of detection): …
- Examiner-reconstructable trail: every screen/alert/disposition + model versions + threshold rationale retained: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:bsa-officer-signoff` — designated BSA/AML Officer personally signs off on every SAR filing and every high-risk onboarding approval (PEP, cleared sanctions near-match, EDD case).
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
aml-bsa-reviewer-verdict: signed-off | blocked
screening-lists: [ofac-sdn | eu-consolidated | un | pep | adverse-media]
jurisdictions: [us-fincen | mtl-<st> | ...]
high-risk-approval-paths: <count requiring BSA/AML Officer sign-off>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - OFAC/sanctions screen at onboarding + ongoing; true positive = hard block to human
  - CDD + beneficial-ownership (25%/control) collection, verification, and screening
  - Customer risk-rating → CDD/EDD path; PEP + adverse-media with source evidence
  - Transaction-monitoring alerts with documented, explainable disposition (no silent auto-close)
  - SAR filing discipline + confidentiality (no tipping-off); SAR access controls + audit trail
  - BSA/AML Officer personal sign-off on SAR filings + high-risk onboarding (gate:bsa-officer-signoff)
gate: gate:bsa-officer-signoff
