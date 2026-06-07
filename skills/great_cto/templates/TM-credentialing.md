# TM-credentialing-{slug} — Provider-Credentialing / Payer-Enrollment Threat Model

**Owner:** credentialing-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Credentialing is a regulated gatekeeping activity; the dominant failure mode is **negligent-credentialing
> liability** and **fraudulent enrollment**, not patient care directly. This model forces a credentialing-
> committee / medical-staff-office sign-off into the pipeline — unconditionally on any adverse finding.

## 1. Scope
- Pipeline: application → primary-source verification (NPDB / DEA / state board / ABMS / schools) → committee decision → payer enrollment (CAQH ProView)
- Autonomy: suggest-to-committee (assistant) · autonomous-above-confidence (autopilot)
- PSV sources: …
- Payers: medicare · medicaid-{state} · commercial …
- Accreditation: ncqa · tjc · cms-cop

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Negligent credentialing | | should-have-known unqualified provider; direct liability |
| NCQA credentialing standards | | what/where/when to verify + recency window |
| The Joint Commission | | medical-staff credentialing & privileging process |
| CMS Conditions of Participation | | facility credentialing/privileging requirements |
| Primary-source verification (PSV) | | no secondary/aggregator copies |
| CAQH ProView | | self-reported input only, not a PSV substitute |
| FCRA adverse-action | | when a CRA background-check vendor is used |
| OIG LEIE / SAM.gov exclusion | | billing for excluded provider |

## 3. Per-element PSV trail (the negligent-credentialing defence)
| Element | Primary source (required) | Source+timestamp+raw response recorded? | Within recency window? |
|---|---|---|---|
| License + discipline | state licensing board (direct) | | |
| DEA | DEA registration (direct) | | |
| Malpractice / sanctions | NPDB query | | |
| Board certification | ABMS / member board | | |
| Education / training | degree school + residency program | | |
| Exclusion status | OIG LEIE + SAM.gov | | |

## 4. Verification integrity & guardrails
- Primary-source-only enforcement; secondary / aggregator / CAQH-self-report rejected for PSV elements: …
- NCQA recency window applied per element; stale/expired verifications rejected: …
- CAQH used as input only, reconciled against PSV with discrepancies surfaced (not silently overwritten): …
- Privilege-to-competence match (TJC / CMS CoP); privileges match documented training, not just a valid license: …

## 5. Decision boundary
- Adverse findings always escalated (sanction, malpractice payment, license action, exclusion hit, discrepancy): …
- Confidence floor below which a file escalates to the credentialing committee: …
- Committee-of-record audit trail (who/what decided each privileging/enrollment): … (composes with service-autopilot audit trail)

## 6. FCRA & ongoing monitoring
- FCRA disclosure/authorization + pre-adverse → adverse-action workflow for CRA background checks; no autonomous denial bypasses it: …
- Re-credentialing schedule (~3yr per NCQA) + recurring OIG LEIE / SAM.gov / license-expiry / new-sanction monitoring with alerting: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:credentialing-committee-signoff` — credentialing committee / medical staff office signs off on the privileging/enrollment decision and on every adverse finding.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
credentialing-reviewer-verdict: signed-off | blocked
psv-sources: [npdb | dea | state-board | abms | education | oig-leie | sam]
payers: [medicare | medicaid-<st> | commercial]
accreditation: [ncqa | tjc | cms-cop]
adverse-finding-paths: <count requiring committee sign-off>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Per-element PSV trail (source identity + timestamp + raw response) — the negligent-credentialing defence
  - Primary-source-only enforcement; reject secondary/aggregator copies for PSV elements
  - CAQH as input only, reconciled against PSV with discrepancy surfacing
  - NCQA recency window + privilege-to-competence match (TJC / CMS CoP)
  - FCRA disclosure/authorization + pre-adverse → adverse-action workflow for CRA background checks
  - Re-credentialing schedule + ongoing OIG LEIE / SAM.gov / license / sanction monitoring
  - Adverse finding → credentialing committee / medical-staff sign-off (gate:credentialing-committee-signoff)
gate: gate:credentialing-committee-signoff
