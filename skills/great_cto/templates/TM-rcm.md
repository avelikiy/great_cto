# TM-rcm-{slug} — Revenue-Cycle / Medical-Coding Threat Model

**Owner:** rcm-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Coding is a regulated professional activity; the dominant failure mode is **False Claims Act
> fraud liability**, not patient harm. This model forces a certified-coder sign-off into the pipeline.

## 1. Scope
- Pipeline: clinical note → ICD-10-CM / CPT / HCPCS / DRG → claim (837P/837I, CMS-1500, UB-04) → payer
- Autonomy: suggest-to-coder (assistant) · autonomous-above-confidence (autopilot)
- Code sets: …
- Payers: medicare · medicaid-{state} · commercial …
- Setting: professional · institutional · facility

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| False Claims Act (upcoding/unbundling/not-rendered) | | treble damages, qui tam |
| NCCI PTP edits | | code-pair bundling |
| MUEs | | units-per-day caps |
| Medical necessity (LCD / NCD) | | ICD↔CPT linkage |
| Modifier discipline (-25 / -59) | | top OIG audit target |
| Payer-specific edits / prior-auth | | per payer |
| HIPAA + minimum necessary | | PHI scoping |
| OIG compliance program (60-day refund) | | overpayment correction |

## 3. Code→documentation evidence trace (the FCA defence)
| Code type | Evidence span required | Present? |
|---|---|---|
| E/M level | history + exam + MDM | |
| Procedure (CPT) | procedure note | |
| Modifier (-25/-59) | separate/distinct service | |
| Diagnosis (ICD-10) | documented condition | |

## 4. Edits & guardrails
- NCCI PTP + MUE applied with current quarterly tables, pre-submission: …
- Upcoding guardrail (code distribution vs peer/historical baseline): …
- Unbundling + modifier-override support check: …
- ICD↔CPT medical-necessity (LCD/NCD) linkage: …

## 5. Autonomy boundary
- Confidence floor below which a claim escalates to a CPC/CCS coder: …
- FCA-high patterns always escalated (high-level E/M, -25/-59, unbundling override): …
- Coder-of-record audit trail (who/what coded each claim): … (composes with service-autopilot audit trail)

## 6. PHI & overpayment
- Minimum-necessary scoping + per-claim access log: …
- 60-day overpayment refund path + sampling-audit support: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:coding-signoff` — CPC/CCS certified coder signs off below the confidence floor and on every FCA-high pattern.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
rcm-reviewer-verdict: signed-off | blocked
code-sets: [icd-10-cm | cpt | hcpcs | drg]
payers: [medicare | medicaid-<st> | commercial]
fca-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Code→documentation evidence trace (the FCA defence)
  - NCCI PTP + MUE edits with current quarterly tables, pre-submission
  - Upcoding/unbundling guardrail + modifier (-25/-59) support check
  - ICD↔CPT medical-necessity (LCD/NCD) linkage
  - Confidence floor → CPC/CCS coder sign-off (gate:coding-signoff)
  - 60-day overpayment refund + sampling-audit; minimum-necessary PHI + access log
gate: gate:coding-signoff
