# TM-payroll-{slug} — Payroll / Payroll-Tax Threat Model

**Owner:** payroll-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Funding net pay by ACH and remitting withheld taxes are irreversible by nature; the dominant failure
> mode is **personal liability for unremitted trust-fund taxes (IRC 6672)** plus **FLSA wage violations**,
> not a bad onboarding flow. This model forces a payroll-manager (CPP) sign-off before any funds move.

## 1. Scope
- Pipeline: timesheets / hours → gross-to-net + withholding → FLSA / garnishment screen → ACH funding of net pay + federal tax deposit / Form 941 → reconcile
- Autonomy: suggest-to-manager (assistant) · autonomous-above-confidence (autopilot)
- Pay jurisdictions: federal · state · local …
- Deposit schedule: monthly · semiweekly (EFTPS) …
- Setting: employer-of-record · co-employment / PEO · self-run

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| FLSA (minimum wage / overtime / exempt-non-exempt) | | higher of federal/state; OT 1.5× over 40h |
| IRS Form 941 + EFTPS deposit schedule | | monthly / semiweekly; on-schedule remittance |
| Trust-fund withholding + IRC 6672 | | 100% penalty, personal, responsible person |
| Form 940 / FUTA + state SUTA | | employer unemployment taxes |
| State/local withholding + new-hire reporting | | by work/residence jurisdiction |
| CCPA Title III garnishment | | disposable-earnings caps; child-support priority |
| Worker classification (common-law / ABC test) | | misclassification risk (employee vs 1099) |
| Final pay / pay-stub / recordkeeping (29 CFR 516) | | state-specific timing; retained records |

## 3. Field→record evidence trace (the FLSA / 6672 defence)
| Field | Evidence span required | Present? |
|---|---|---|
| Hours / overtime | timesheet (worked, OT, off-the-clock) | |
| Gross-to-net + withholding | rate + W-4 / state cert + FICA | |
| Federal tax deposit | 941 liability + EFTPS schedule (monthly/semiweekly) | |
| Garnishment | court / agency order + CCPA disposable-earnings cap | |
| Classification | common-law / ABC-test basis | |

## 4. Edits & guardrails
- Minimum wage at the higher of federal/state + overtime 1.5× over 40h for non-exempt: …
- Full withholding stack computed (federal + state/local + FICA + SUTA/FUTA): …
- Garnishments honoured + CCPA Title III caps + child-support priority + multi-order ordering: …
- EFTPS deposit on the assigned monthly/semiweekly schedule, never skipped or late: …

## 5. Autonomy boundary
- Confidence floor below which a run escalates to a payroll manager (CPP): …
- High-risk patterns always escalated (sub-min-wage / missing OT, missed/late EFTPS deposit, ignored garnishment, employee→1099 reclassification): …
- Payroll-manager audit trail (who/what computed, withheld, screened, and signed each run before funds moved): … (composes with service-autopilot audit trail)

## 6. Classification, recordkeeping & trust-fund record
- Worker classification basis (common-law / ABC test) recorded; no auto-reclassification to cut tax: …
- Final-pay timing + pay-stub disclosure + 29 CFR 516 recordkeeping enforced: …
- Per-run trust-fund record (deposit liability + EFTPS schedule evidence, the 6672 defence): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:payroll-officer-signoff` — payroll manager (CPP) signs off on every payroll run and on every high-risk pattern, before ACH funding of net pay and the 941 deposit.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
payroll-reviewer-verdict: signed-off | blocked
pay-jurisdictions: [federal | state | local]
deposit-schedule: [monthly | semiweekly]
money-movement-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Field→record evidence trace (hours, withholding, deposit, garnishment, classification)
  - FLSA minimum wage (higher of federal/state) + overtime 1.5× over 40h for non-exempt
  - Full withholding stack (federal + state/local + FICA + SUTA/FUTA)
  - EFTPS deposit on the assigned monthly/semiweekly schedule (trust-fund / 6672 defence)
  - Garnishments honoured + CCPA Title III caps + child-support priority + multi-order ordering
  - Worker classification basis (common-law / ABC test); no auto-reclassification to cut tax
  - Every payroll run → payroll-manager (CPP) sign-off before ACH funding + 941 filing (gate:payroll-officer-signoff)
gate: gate:payroll-officer-signoff
