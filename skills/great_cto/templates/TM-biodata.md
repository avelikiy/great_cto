# TM-biodata-{slug} — Biomedical Data Platform Threat Model

**Owner:** bio-data-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Formats in scope
| Format | Profile/version | Use |
|---|---|---|
| FHIR | R5 / R4 + US Core ___ | |
| HL7 v2 | | |
| OMOP CDM | v5.4 / vocab build ___ | |
| DICOM | SR / WG-22 | |
| Genomics | VCF / BAM / CRAM / FASTQ | |

## 2. De-identification
- Method: Safe Harbor | Expert Determination (target ≤ 0.04)
- Quasi-identifier risk analysis: …
- DICOM burned-in PHI detector: implemented? yes / no
- Genomic data — additional restrictions: …

## 3. Consent + access
- Consent codes (GA4GH DUO): NRES / GRU / HMB / DS-X / IRB / PUB / COL / GSO / NPU / NCU
- Access-policy engine matches DUO to data
- Subject withdrawal propagation to derivatives: …

## 4. Cross-border
- GDPR Art. 9 SCC route?
- China HGRAC for genomics egress?
- India DPDP / EHDS?

## 5. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 6. Required artefacts
- [ ] Format profile + version pinning documented
- [ ] SMART-on-FHIR scope enforcement
- [ ] De-id method + risk bound
- [ ] DICOM burned-in PHI detector
- [ ] Reference-genome assembly tag per variant
- [ ] DUO → access-policy engine
- [ ] Subject-withdrawal propagation job
- [ ] Cross-border egress controls

## 7. EVAL required
- EVAL-deid-reidentification-risk · EVAL-fhir-conformance · EVAL-dicom-phi-burn · EVAL-consent-policy-enforcement

## 8. Gates
- gate:deidentification (if Expert Determination) · gate:ship

<!-- HANDOFF -->
bio-data-reviewer-verdict: signed-off
critical-findings: 0
