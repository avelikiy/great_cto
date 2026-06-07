# TM-cro-{slug} — Clinical-Trial-Operations Threat Model

**Owner:** clinical-trials-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Trial operations are GxP-regulated; the dominant failure modes are **data-integrity / Part 11
> findings** and **patient-safety harm**, not revenue. This model forces a principal-investigator
> sign-off on every eligibility and safety determination into the pipeline.

## 1. Scope
- Pipeline: subject → eConsent → enrollment → eSource / eCOA / EDC → AE/SAE → sponsor → submission
- Trial role: sponsor · CRO · site · vendor (eCOA / EDC / lab)
- Autonomy: suggest-to-PI (assistant) · autonomous-above-confidence (autopilot)
- Regulators: FDA · EMA · MHRA · PMDA …
- Setting: on-site · decentralized / virtual (DCT)

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| FDA 21 CFR Part 11 (records + audit trail + e-sig) | | closed/open system defined |
| ICH-GCP E6 | | investigator + sponsor responsibilities |
| IRB / IEC approval + continuing review | | approval before enrollment |
| Informed consent versioning | | subject↔version; re-consent |
| HIPAA + minimum necessary | | PHI scoping |
| PI / medical-monitor eligibility + safety determinations | | kept human |
| Protocol-deviation handling | | minor/major + reporting |
| Adverse-event reporting (AE/SAE) | | 24h to sponsor; 7/15-day to FDA |
| Source-data verification / ALCOA+ | | no source-data overwrite |

## 3. Part 11 + ALCOA+ data integrity
| Record action | Control required | Present? |
|---|---|---|
| Operator entry / change | append-only, time-stamped, reason-coded; original not obscured | |
| Signed record | e-sig manifestation: printed name + date/time + meaning | |
| E-signature auth | identification component + ≥1 additional (pwd/biometric) | |
| Source-data correction | tracked change, never in-place overwrite (ALCOA+) | |

## 4. Consent, IRB & safety guardrails
- IRB approval before enrollment + continuing review: …
- Informed-consent versioning (subject↔version) + re-consent on material change: …
- AE/SAE auto-flagging + latency to reportable (≤24h to sponsor): …
- Protocol-deviation detection + classification + reporting: …

## 5. Autonomy boundary
- Confidence floor below which an action escalates to the PI / medical monitor: …
- Always-escalated patterns (eligibility / enrollment, AE causality+severity, continued-participation): …
- Coder/operator-of-record audit trail (who/what did each action): … (composes with service-autopilot audit trail)

## 6. PHI & cross-border
- Minimum-necessary PHI scoping + per-record access log: …
- Cross-border data (GDPR/SCCs, China HGRAC, India DPDP) for non-US subjects: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:pi-signoff` — principal investigator / medical monitor signs off on every eligibility / safety determination, AE disposition, and below the confidence floor, before the action is recorded.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
clinical-trials-reviewer-verdict: signed-off | blocked
trial-role: [sponsor | cro | site | vendor]
regulators: [fda | ema | mhra | pmda]
safety-eligibility-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Append-only Part 11 audit trail (operator + reason + timestamp; original never obscured)
  - E-signature manifestation (name + date/time + meaning) + second auth component on signed records
  - System validation plan (IQ/OQ/PQ) + change-control SOP
  - IRB submission + informed-consent versioning + re-consent workflow
  - AE/SAE auto-flagging + 24h escalation; PI / medical-monitor safety determinations kept human
  - Protocol-deviation detection + handling/reporting workflow
  - Source-data verification + ALCOA+ integrity (no source-data overwrite)
  - Minimum-necessary PHI scoping + per-record access log; PI sign-off (gate:pi-signoff)
gate: gate:pi-signoff
