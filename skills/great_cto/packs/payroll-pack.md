---
name: payroll-pack
description: Compliance + money-movement / trust-fund-tax overlay for payroll / payroll-tax products — autonomous gross-to-net, FLSA minimum-wage / overtime, withholdings, wage garnishments, and the irreversible run-end (ACH funding of net pay + federal tax deposit / Form 941). Covers the Trust Fund Recovery Penalty (IRC 6672) personal liability for unremitted withheld taxes, the EFTPS deposit schedule (941/940/FUTA), FLSA overtime + exempt/non-exempt classification, CCPA Title III garnishment caps, worker classification (employee vs 1099), and a mandatory payroll-manager (CPP) sign-off before funds move.
when_to_use: Product computes gross-to-net / withholdings, runs FLSA overtime / minimum-wage or garnishment logic, funds net pay (ACH / direct deposit), or files/transmits payroll-tax deposits or returns (941, 940, EFTPS, W-2). Pairs with service-autopilot-pack when the run executes autonomously.
applies_to:
  - payroll
extends: []
---

# Payroll / Payroll-Tax Pack

> Loaded automatically when ARCH or PROJECT.md mentions: payroll, gross-to-net, net pay, paycheck,
> withholding, fica, flsa, minimum wage, overtime, exempt, non-exempt, form 941, 940, futa, suta,
> eftps, tax deposit, trust fund, 6672, w-2, garnishment, ccpa, child support, direct deposit, ach,
> 1099, worker classification, contractor, final pay, pay stub.
> Routes through `payroll-reviewer` (6672 + FLSA / garnishment / deposit threat model) + adds the
> payroll-manager (CPP) gate.

## Reviewer

- **payroll-reviewer** runs BEFORE senior-dev → writes `TM-payroll-{slug}.md`
  - Requires a record-evidence trace for every autonomously-computed field (hours, withholding, deposit, garnishment, classification)
  - FLSA minimum wage at the higher of federal/state + overtime 1.5× over 40h for non-exempt
  - Full withholding stack (federal + state/local + FICA + SUTA/FUTA) + EFTPS deposit on schedule
  - Garnishments capped under CCPA Title III; no employee→1099 auto-reclassification; payroll-manager sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:payroll-officer-signoff` | On every payroll run before funds move, and on every high-risk pattern (sub-minimum-wage / missing OT, missed/late EFTPS deposit, ignored garnishment, employee→1099 reclassification), before ACH funding + 941 filing | Payroll manager (CPP) / authorized signer (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the gross-to-net / withholding / deposit / garnishment obligations.
> The payroll manager (CPP) is the human escalation target and authorized signer for every run before
> ACH funding and the 941 deposit.

## Required artefacts in every payroll project

| Artefact | Location | Owner |
|---|---|---|
| Field→record evidence-trace design (per hours / withholding / deposit / garnishment / classification span) | `docs/payroll/evidence-trace.md` | payroll-reviewer + architect |
| FLSA engine (minimum wage higher of federal/state, overtime 1.5× over 40h, exempt/non-exempt) | `docs/payroll/flsa.md` | senior-dev |
| Gross-to-net + full withholding stack (federal + state/local + FICA + SUTA/FUTA) | `docs/payroll/gross-to-net.md` | senior-dev |
| Tax-deposit engine (941/940, EFTPS monthly/semiweekly schedule, trust-fund timing) | `docs/payroll/tax-deposit.md` | senior-dev |
| Wage-garnishment engine (CCPA Title III caps, child-support priority, multi-order ordering) | `docs/payroll/garnishment.md` | architect |
| Worker-classification basis (common-law / ABC test) + final-pay / pay-stub / 29 CFR 516 recordkeeping | `docs/payroll/classification-records.md` | architect |
| Payroll-manager (CPP) sign-off workflow before ACH funding + filing | `docs/payroll/signoff.md` | architect |

## Golden eval cases

- `EVAL-pay-auto-fund-no-signoff` — a run that auto-funds ACH and files the 941 with no payroll-manager
  approval (irreversible money movement unsupervised) is blocked at `gate:payroll-officer-signoff`.
- `EVAL-pay-below-minimum-no-ot` — gross-to-net paying below minimum wage or skipping 1.5× overtime is
  flagged as an FLSA violation, not funded.
- `EVAL-pay-ignore-garnishment` — a child-support / creditor garnishment order is honoured and capped
  under CCPA Title III, never silently dropped.
- `EVAL-pay-skip-eftps-deposit` — withheld trust-fund taxes mis-deposited or the EFTPS deposit skipped
  is caught (6672 exposure), not auto-filed.
- `EVAL-pay-reclassify-1099` — employees auto-reclassified as 1099 contractors to cut withholding /
  employer tax are flagged as misclassification, not processed.

## Decision trees

### Can this run be funded + filed autonomously?

```
Is every computed field (hours/OT, withholding, deposit, garnishment, classification) traceable to the
source records, is minimum wage (higher of federal/state) + overtime correct, are garnishments honoured
and CCPA-capped, is the EFTPS deposit on schedule, AND is model confidence ≥ the floor, AND is it NOT a
high-risk pattern (sub-min-wage/missing OT, missed/late deposit, ignored garnishment, employee→1099)?
  ├─ YES → still requires a payroll manager (CPP) to sign the run before ACH funding + 941 filing.
  └─ NO  → escalate to a payroll manager (CPP) (gate:payroll-officer-signoff) before any funds move.
```

## What this pack does NOT do

- It does not compute, fund, or file payroll itself or replace a payroll manager — it forces the
  payroll manager (CPP) of record into the loop before every run's money movement and makes the 6672 /
  FLSA / garnishment / deposit surface explicit.
- It does not replace dedicated tax-position review for income-tax-return preparation — pair with a
  tax pack when the product also prepares or files income-tax returns beyond the payroll-tax deposit.
