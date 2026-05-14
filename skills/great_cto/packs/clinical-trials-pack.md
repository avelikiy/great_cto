---
name: clinical-trials-pack
description: Clinical-trial platform + biomedical data overlay. Pairs clinical-trials-reviewer + bio-data-reviewer.
when_to_use: Product runs/supports clinical trials, is eCOA/ePRO/eConsent/eSource, or handles regulated health-data exchange (FHIR/HL7/OMOP/DICOM/genomics).
applies_to:
  - regulated
  - ai-system
  - data-platform
---

# Clinical-Trials + Bio-Data Pack

> Loaded when ARCH mentions: clinical trial, CTMS, EDC, eCOA, ePRO, eConsent, eSource, IND, FHIR, HL7, OMOP, DICOM, genomic, sequencing.

## Reviewers

1. **clinical-trials-reviewer** → `TM-trial-{slug}.md`
2. **bio-data-reviewer** (paired if FHIR/HL7/OMOP/DICOM/genomics) → `TM-biodata-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:irb-ready` | IRB submission package complete | Clinical-lead + Regulatory |
| `gate:part11-validation` | Validated system before production go-live | QA-lead (independent) |
| `gate:deidentification` | If Expert Determination used | Statistical expert |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner |
|---|---|
| Append-only Part 11 audit trail (signed + exportable) | senior-dev |
| E-signature manifestation (name + datetime + meaning) | senior-dev |
| System validation plan (IQ/OQ/PQ) + change-control SOP | qa-engineer |
| Consent versioning schema + re-consent workflow | senior-dev |
| AE/SAE auto-flag + 24h escalation path | senior-dev |
| CDISC SDTM mapping documented per domain | data-engineer |
| Subject-withdrawal flow (ICH + Part 11 retention) | architect |
| IRB submission package generator | clinical-lead |
| FHIR / HL7 / DICOM / OMOP profile pinning | architect |
| SMART-on-FHIR scope enforcement | senior-dev |
| De-id method (Safe Harbor or Expert Determination) + risk bound | architect |
| DICOM burned-in PHI detector | senior-dev |
| Reference-genome assembly tag per variant | data-engineer |
| DUO consent-code → access-policy engine | senior-dev |

## EVAL suite

- `EVAL-audit-trail-immutability` (append-only verified, no silent edits)
- `EVAL-deid-reidentification-risk` (≤ 0.04 for Expert Determination)
- `EVAL-consent-versioning` (subject sees correct version)
- `EVAL-ae-reporting-latency` (≤ 24h to sponsor)
- `EVAL-fhir-conformance` (Inferno test suite passes)
- `EVAL-dicom-phi-burn` (no PHI in pixel data on export)
- `EVAL-consent-policy-enforcement` (DUO codes correctly gate access)

## Key timelines

- **SAE reporting:** investigator → sponsor 24h; sponsor → FDA 7 days (fatal) / 15 days (serious + unexpected)
- **IRB continuing review:** annual minimum
- **Subject withdrawal:** stop new data collection; retain Part 11 records per protocol
- **Audit-trail review SOP:** typically monthly or per-batch
