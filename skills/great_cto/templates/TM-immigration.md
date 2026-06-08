# TM-immigration-{slug} — Immigration / Legal-Services Threat Model

**Owner:** immigration-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Giving legal advice or appearing as the representative of record is a regulated activity reserved to a
> **licensed attorney** (or DOJ/EOIR (BIA)-accredited representative); the dominant failure mode is **the
> unauthorized practice of law and document fraud (18 USC 1546 / INA 274C)**, not a malformed form. This
> model forces an attorney-of-record (G-28) sign-off into the pipeline.

## 1. Scope
- Pipeline: applicant documents → visa/benefit eligibility + priority date + RFE risk → petition preparation → USCIS filing → adjudication
- Autonomy: suggest-to-attorney (assistant) · autonomous-above-confidence (autopilot)
- Benefit forms: i-130 · i-140 · i-129 · n-400 …
- Filing modes: uscis · eoir · consular …
- Setting: attorney-of-record · self-represented · accredited-representative

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Unauthorized practice of law (UPL) | | only licensed attorney / BIA-accredited rep gives advice or appears |
| 8 CFR 292.1 / 1003 (representation) | | representative of record restricted to licensed attorney |
| 18 USC 1546 (immigration document fraud) | | false/altered document material to a petition |
| INA 274C (civil document fraud) | | civil document-fraud penalties |
| 18 USC 1001 (false statements) | | material false statement to the government |
| INA 212(a)(6)(C) (misrepresentation) | | frivolous-filing / willful misrepresentation bar |
| Eligibility (INA + 8 CFR) | | applied to applicant's actual facts |
| DOS Visa Bulletin priority date | | no out-of-turn / premature filing |
| RFE sufficiency / response | | RFE response is a legal filing, attorney review |
| Licensed attorney-of-record (G-28) | | signs the petition before filing |

## 3. Asserted-fact → applicant-evidence trace (the 18 USC 1546 / INA 274C defence)
| Field | Evidence span required | Present? |
|---|---|---|
| Eligibility determination | named G-28 attorney's determination + 8 CFR basis | |
| Asserted facts / documents | applicant evidence span (no fabrication) | |
| Priority date | DOS Visa Bulletin current-date check | |
| Representative of record | signed Form G-28 by a licensed attorney | |

## 4. Edits & guardrails
- Eligibility basis attributable to a named licensed attorney (not software legal advice / UPL): …
- Every asserted fact / document traceable to applicant evidence, no fabricated/embellished evidence: …
- Priority-date (DOS Visa Bulletin) check before filing, no out-of-turn submission: …
- RFE responses routed to attorney review (never auto-submitted): …

## 5. Autonomy boundary
- Confidence floor below which a petition escalates to a licensed immigration attorney: …
- UPL/fraud-high patterns always escalated (autonomous legal advice, software-as-representative, fabricated eligibility, premature/out-of-turn filing, auto-submitted RFE): …
- Attorney-of-record audit trail (who determined eligibility, prepared, and signed each petition): … (composes with service-autopilot audit trail)

## 6. UPL boundary, misrepresentation & non-frivolous record
- UPL boundary enforced (relay attorney determination; no software legal advice; 8 CFR 292.1 / 1003): …
- No fraudulent/frivolous eligibility (INA 212(a)(6)(C) willful-misrepresentation bar): …
- Per-petition non-frivolous record (INA / 8 CFR basis cited, evidence index, attorney attribution): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:attorney-of-record-signoff` — licensed immigration attorney of record (G-28) signs off on every USCIS petition and on every UPL/fraud-high pattern, before transmission to USCIS.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
immigration-reviewer-verdict: signed-off | blocked
benefit-forms: [i-130 | i-140 | i-129 | n-400]
filing-modes: [uscis | eoir | consular]
upl-fraud-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Eligibility/representation attributed to a named licensed attorney of record (no UPL)
  - Asserted-fact → applicant-evidence trace (no fabricated evidence; 18 USC 1546 / INA 274C defence)
  - Priority-date (DOS Visa Bulletin) check before filing; no out-of-turn submission
  - RFE responses routed to attorney review (never auto-submitted)
  - No fraudulent/frivolous eligibility (INA 212(a)(6)(C) misrepresentation bar)
  - Representation of record restricted to a licensed attorney per 8 CFR 292.1 / 1003 (no software filer)
  - Every USCIS petition → licensed attorney of record (G-28) sign-off (gate:attorney-of-record-signoff)
gate: gate:attorney-of-record-signoff
