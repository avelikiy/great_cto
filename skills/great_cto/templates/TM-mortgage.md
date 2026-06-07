# TM-mortgage-{slug} — Mortgage Underwriting Threat Model

**Owner:** lending-credit-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Mortgage underwriting is a regulated credit decision; the dominant failure mode is **fair-lending
> liability** (disparate impact / redlining), not a single bad loan. This model forces a licensed
> underwriter sign-off into the pipeline.

## 1. Scope
- Pipeline: application → credit + income + collateral data → AUS (DU/LP) / ML underwriter → approve / decline / counter / risk-tier → disclosures (LE/CD) → LAR
- Autonomy: suggest-to-underwriter (assistant) · autonomous-above-confidence (autopilot)
- Loan products: conforming · FHA · VA · jumbo · non-QM …
- Investors / programs: Fannie Mae · Freddie Mac · Ginnie/FHA · VA …
- States served: …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| ECOA / Reg B (prohibited bases, adverse action) | | 30-day, ≤4 principal reasons |
| Fair-lending disparate impact + treatment | | 4/5-rule, ZIP-as-race proxy |
| TILA / Reg Z (APR, disclosures) | | |
| RESPA / TRID (LE + CD timing) | | 3-day / 3-business-day clocks |
| HMDA / Reg C (LAR + GMI) | | demographic data, redlining dataset |
| Adverse-action notices | | specific reasons from model |
| SAFE Act (loan-originator licensing) | | state + NMLS matrix |
| GSE / FHA / VA underwriting guidelines | | DTI/LTV/AUS findings |
| CFPB UDAAP | | flows, marketing, disclosures |

## 3. Adverse-action evidence trace (the ECOA defence)
| Decision type | Evidence / reason required | Present? |
|---|---|---|
| Decline | ≤4 specific principal reasons (e.g. "DTI 48% above 43% max") | |
| Counter-offer | terms-change reason + ECOA notice | |
| Risk-based pricing | risk-based-pricing notice (score-based APR) | |
| Approve | conditions documented, no notice required | |

## 4. Fair-lending & guardrails
- Disparate-impact pipeline (4/5-rule on approval rate by race/sex/age via BISG): …
- ZIP-as-race-proxy / proxy-feature audit (model card: feature vs protected-attribute proxy risk): …
- TILA/RESPA/TRID disclosure-timing engine (LE within 3 business days, CD 3 business days pre-closing): …
- HMDA GMI capture at application, excluded from underwriting features; LAR edit checks (FFIEC validity/quality): …
- GSE/FHA/VA underwriting-guideline rule engine (DTI/LTV/AUS findings reconciliation): …

## 5. Autonomy boundary
- Confidence floor below which a decision escalates to a licensed underwriter: …
- Always-escalated patterns (every decline, fair-lending-high, proxy-feature override, guideline exception): …
- Underwriter-of-record audit trail (who/what decided each application): … (composes with service-autopilot audit trail)

## 6. Disclosure & licensing
- SAFE Act loan-originator licensing matrix (state + NMLS) + partner/correspondent model: …
- UDAAP review of application flows, marketing claims, and disclosure dark patterns: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:underwriter-signoff` — licensed mortgage underwriter signs off below the confidence floor, on every decline, and on every fair-lending-high pattern.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
lending-credit-reviewer-verdict: signed-off | blocked
loan-products: [conforming | fha | va | jumbo | non-qm]
investors: [fannie | freddie | ginnie/fha | va]
states-served: <list or "TBD">
fair-lending-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Adverse-action engine: 30-day, ≤4 specific principal reasons, ECOA notice, score-disclosure
  - Fair-lending disparate-impact pipeline (4/5-rule, BISG, ZIP-as-race-proxy audit) on the LAR population
  - TILA/RESPA/TRID disclosure-timing engine (LE + CD clocks)
  - HMDA GMI capture at application (excluded from underwriting features) + validated LAR pipeline
  - GSE/FHA/VA underwriting-guideline rule engine (DTI/LTV/AUS)
  - Confidence floor → licensed underwriter sign-off on declines + high-risk (gate:underwriter-signoff)
  - SAFE Act loan-originator licensing matrix; UDAAP review of flows + disclosures
gate: gate:underwriter-signoff
