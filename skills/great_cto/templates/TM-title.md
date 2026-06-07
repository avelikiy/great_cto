# TM-title-{slug} — Title & Escrow Threat Model

**Owner:** title-escrow-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Title and escrow are regulated, fiduciary activities; the dominant failure modes are
> **irreversible loss of funds** (wire fraud / BEC) and a **title-insurance liability the
> underwriter never agreed to**. This model forces a licensed title/escrow-officer sign-off into the pipeline.

## 1. Scope
- Pipeline: order → title search → exam → curative → commitment → escrow → closing → disbursement → recording
- Autonomy: suggest-to-officer (assistant) · autonomous-above-confidence (autopilot)
- Products: title commitment · title policy · escrow/settlement · closing coordination · recording
- States: tx · ca · fl … (attorney-closing states noted)
- Underwriters: …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| ALTA standards + Best Practices | | insurable-title + escrow controls |
| Wire fraud / BEC (escrow funds) | | #1 real-estate target; irreversible |
| TILA/RESPA + TRID | | LE/CD content, 3-day CD timing, tolerances |
| RESPA Section 8 (kickbacks/referral) | | fee math + disbursement |
| CFPB oversight | | vendor mgmt + infosec over closing |
| State title-agent / escrow-officer licensing | | who may sign, per state |
| Good-funds rules | | collected + cleared before disbursement |
| Title curative / lien clearance | | clear or properly except each item |
| Per-state recording | | format, transfer tax, recording sequence |

## 3. Commitment item → title-evidence trace (the underwriter defence)
| Item | Evidence span required | Present? |
|---|---|---|
| Requirement (Schedule B-I) | chain-of-title / plant search span | |
| Exception (Schedule B-II) | recorded encumbrance reference | |
| Waiver of requirement | officer-approved basis | |
| Disbursement line | verified payoff / CD figure | |

## 4. Edits & guardrails
- Out-of-band verification of payoffs + wire instructions before any disbursement (known-good callback): …
- No autonomous path originates, alters, or releases a wire; change-of-instructions re-triggers verification: …
- Good-funds check (collected + cleared per state law) before disbursement eligibility: …
- TRID: CD content + 3-business-day waiting period + fee tolerances (zero / 10% / unlimited): …
- Title curative / lien clearance: each item cleared or properly excepted before policy issues: …

## 5. Autonomy boundary
- Confidence floor below which a transaction escalates to a licensed title/escrow officer: …
- Always-escalated patterns (insurable-title decision, exception waiver, curative clearance, any disbursement): …
- Officer-of-record audit trail (who signed each insurable-title decision and disbursement): … (composes with service-autopilot audit trail)

## 6. Recording & jurisdiction
- Per-state recording format + transfer tax + correct recording sequence to perfect priority: …
- State licensing scope (permissible duties, attorney-closing states) for the officer of record: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:title-officer-signoff` — licensed title/escrow officer signs the insurable-title decision (commitment / exception waiver / curative clearance) and authorizes every irreversible disbursement.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
title-escrow-reviewer-verdict: signed-off | blocked
states: [tx | ca | fl | ...]
underwriters: [<underwriter(s)>]
officer-signoff-paths: <count requiring title/escrow-officer sign-off>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Commitment item → title-evidence trace (the underwriter defence)
  - Out-of-band payoff + wire-instruction verification; no autonomous wire origination/alteration
  - Good-funds check (collected + cleared per state) before disbursement eligibility
  - TRID: CD content + 3-day waiting period + fee tolerances
  - Insurable-title decision + every disbursement → licensed officer sign-off (gate:title-officer-signoff)
  - Title curative / lien clearance bounded to officer; per-state recording format + sequence
gate: gate:title-officer-signoff
