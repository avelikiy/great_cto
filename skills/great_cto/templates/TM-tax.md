# TM-tax-{slug} — Tax Preparation / Advisory Threat Model

**Owner:** tax-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> **Not tax advice.** The failure mode is **preparer penalties (§6694/§6695) + Circular 230
> sanctions** and the criminal §7216 disclosure rule. This model forces a credentialed-preparer
> sign-off before filing and §7216 consent before any non-preparation use of taxpayer data.

## 1. Scope
- Pipeline: intake → compute → take positions → review → e-file
- Autonomy: suggest-to-preparer (assistant) · autonomous-below-threshold (autopilot)
- Return types: 1040 · 1120 · 1065 · state · intl
- Jurisdictions: federal · us-<st> · intl (FBAR/FATCA)

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Circular 230 (practice before IRS) | | competence + due diligence |
| §6694 (unreasonable position) | | authority ladder |
| §6695 (sign / copy / PTIN) | | signature required |
| §6713 / §7216 (disclosure & use) | | consent; criminal |
| §6662 (accuracy) | | taxpayer-side, same ladder |
| E-file (PTIN/EFIN/Form 8879) | | signed authorization |
| Multi-jurisdiction (state/FBAR/FATCA) | | nexus, conformity |

## 3. Position-authority classification
| Authority | Action |
|---|---|
| Substantial authority | may take; document authority |
| Reasonable basis | take only **with** Form 8275 disclosure |
| Below reasonable basis | do NOT take; escalate |
| Tax shelter / reportable | needs MLTN; escalate to preparer |

## 4. Penalty controls
- §6694: every position classified; below-standard → disclose (8275) or escalate: …
- §6695: credentialed-preparer signature + PTIN; copy to taxpayer; no auto-file unsigned: …
- §7216: taxpayer-data use limited to preparation; any other use (incl. model training) has consent: …
- Position + preparer audit trail (who/what/authority): … (composes with service-autopilot audit trail)

## 5. E-file & jurisdiction
- PTIN/EFIN present; Form 8879 signed before transmission: …
- In-scope jurisdiction set; out-of-scope (extra state / FBAR / FATCA) → escalate: …

## 6. Circular 230 due diligence
- Reliance on taxpayer information reasonable; known-fact implications not ignored: …
- Conflicts + fee handling: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:preparer-signoff` — credentialed preparer (PTIN / EA / CPA / attorney) signs the return before filing; below-standard positions reviewed.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
tax-reviewer-verdict: signed-off | blocked
return-types: [1040 | 1120 | 1065 | state | intl]
jurisdictions: [federal | us-<st> | intl]
below-standard-positions: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Position-authority classification (substantial authority / reasonable basis + Form 8275)
  - §6695 credentialed-preparer signature + PTIN; copy to taxpayer; no auto-file unsigned
  - §7216 consent before any non-preparation use of taxpayer data (incl. model training)
  - E-file PTIN/EFIN + signed Form 8879 before transmission
  - Multi-jurisdiction scope + out-of-scope (extra state / FBAR / FATCA) escalation
  - Credentialed-preparer sign-off before filing (gate:preparer-signoff)
gate: gate:preparer-signoff
