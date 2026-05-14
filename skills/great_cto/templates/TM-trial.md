# TM-trial-{slug} — Clinical-Trial Platform Threat Model

**Owner:** clinical-trials-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Role + scope
- Product role: CTMS · EDC · eCOA · ePRO · eConsent · eSource · RTSM/IRT
- DCT components: telemedicine · remote eConsent · home-health · direct-to-patient drug ship
- Phase: I · II · III · IV · post-mkt

## 2. Compliance matrix
| Regime | In scope? | Notes |
|---|---|---|
| ICH-GCP E6(R3) | yes | |
| 21 CFR Part 11 | | |
| EU GMP Annex 11 | | |
| MHRA GxP DI | | |
| CDISC SDTM/ADaM submission | | |

## 3. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 4. Required artefacts
- [ ] Append-only Part 11 audit trail (signed + exportable)
- [ ] E-signature manifestation
- [ ] System validation plan (IQ/OQ/PQ) + change-control SOP
- [ ] Consent versioning schema + re-consent workflow
- [ ] AE/SAE auto-flag + 24h escalation
- [ ] CDISC SDTM mapping doc per domain
- [ ] Subject withdrawal flow (ICH + Part 11 retention)
- [ ] IRB submission package generator
- [ ] Audit-trail review SOP

## 5. EVAL required
- EVAL-audit-trail-immutability · EVAL-consent-versioning · EVAL-ae-reporting-latency · EVAL-cdisc-export-conformance

## 6. Gates
- gate:irb-ready · gate:part11-validation · gate:ship

<!-- HANDOFF -->
clinical-trials-reviewer-verdict: signed-off
critical-findings: 0
biodata-handoff: yes (FHIR/HL7/OMOP/DICOM in scope) | no
