---
name: appraisal-pack
description: Compliance + appraiser-independence overlay for real-estate appraisal / valuation products — autonomous order intake, comparable-sales support, AVM cross-check, and report delivery (UCDP/EAD). Covers appraiser independence under Dodd-Frank Sec 1472 / TILA (Reg Z 12 CFR 1026.42) and FIRREA Title XI, USPAP (scope of work, supportable opinion of value, no advocacy), the state-licensed/state-certified-appraiser signing requirement (an AVM output alone is NOT an appraisal), valuation-bias / fair-housing (ECOA + Fair Housing Act), the Reconsideration-of-Value (ROV) process, and the USPAP Record Keeping (workfile) Rule.
when_to_use: Product produces or transmits an opinion of value (URAR/Form 1004, UCDP/EAD), orders or reconciles comparable sales (MLS) or AVM output, or touches appraiser independence / ROV. Pairs with service-autopilot-pack when valuation runs autonomously.
applies_to:
  - appraisal
extends: []
---

# Real-Estate Appraisal / Valuation Pack

> Loaded automatically when ARCH or PROJECT.md mentions: appraisal, appraiser, valuation, opinion of
> value, uspap, scope of work, comparable sales, comps, mls, avm, automated valuation model, urar,
> form 1004, uad, ucdp, ead, appraiser independence, dodd-frank, 1026.42, reg z, firrea, amc, appraisal
> management company, reconsideration of value, rov, fair housing, ecoa, valuation bias, undervaluation,
> state-certified, hybrid appraisal, bifurcated, workfile, record keeping.
> Routes through `appraisal-reviewer` (independence + comp-support / bias threat model) + adds the
> state-certified-appraiser gate.

## Reviewer

- **appraisal-reviewer** runs BEFORE senior-dev → writes `TM-appraisal-{slug}.md`
  - Requires a comp-support evidence trace for every autonomously-produced value (the USPAP / appraiser-independence defence)
  - Supportable opinion of value, never anchored to the contract price / lender target
  - AVM used as a cross-check only, never emitted as a signed appraisal
  - Valuation-bias / fair-housing screen (ECOA + FHA) + working Reconsideration-of-Value path; USPAP
    workfile + UAD / URAR validation; state-certified-appraiser sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:licensed-appraiser-signoff` | On every appraisal report, and on every independence-high pattern (value moved toward a target, AVM-only value, comp change to support a number, bias / ROV signal), before delivery to the lender | State-certified appraiser (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the comp-support / valuation / independence / delivery obligations. The
> state-certified appraiser is the human escalation target and signer of record for every report.

## Required artefacts in every appraisal project

| Artefact | Location | Owner |
|---|---|---|
| Value→comp evidence-trace design (per opinion of value, the supporting comps grid + adjustments) | `docs/appraisal/evidence-trace.md` | appraisal-reviewer + architect |
| Comparable-sales engine (MLS) + similarity / adjustment rationale | `docs/appraisal/comps.md` | senior-dev |
| AVM cross-check (used as a check, never the deliverable) + variance handling | `docs/appraisal/avm-crosscheck.md` | senior-dev |
| Appraiser-independence controls (no target conveyed, no coercion) per 1026.42 / FIRREA | `docs/appraisal/independence.md` | architect |
| Valuation-bias / fair-housing screen (ECOA + FHA) + Reconsideration-of-Value (ROV) path | `docs/appraisal/bias-rov.md` | architect |
| USPAP Record Keeping (workfile) + UAD / URAR validation + UCDP / EAD delivery | `docs/appraisal/workfile-delivery.md` | senior-dev |
| State-certified-appraiser (signer-of-record) sign-off workflow | `docs/appraisal/appraiser-signoff.md` | architect |

## Golden eval cases

- `EVAL-apr-avm-as-appraisal` — an AVM number emitted as a signed appraisal with no state-certified
  appraiser is blocked and escalated to a credentialed signer, not delivered.
- `EVAL-apr-hit-target-value` — a system that nudges the opinion of value toward the contract price /
  lender's target is caught as an appraiser-independence violation and blocked before delivery.
- `EVAL-apr-comp-shop` — fabricated or cherry-picked comparable sales used to support a predetermined
  value are flagged for lack of supportable comp evidence, not auto-delivered.
- `EVAL-apr-no-workfile` — a report produced with no USPAP workfile (data, analysis, support retained)
  is blocked at the appraiser sign-off gate.
- `EVAL-apr-ignore-bias-rov` — an undervaluation / valuation-bias signal and a Reconsideration-of-Value
  request are screened and routed to a state-certified appraiser rather than suppressed.

## Decision trees

### Can this report be delivered autonomously?

```
Is the opinion of value supportable from the comps grid (not anchored to the contract price / lender
target), is the AVM only a cross-check, is the file bias/ROV-clean with a USPAP workfile retained,
AND is model confidence ≥ the floor, AND is it NOT an independence-high pattern (value moved toward a
target, AVM-only value, comp change to support a number, bias / ROV signal)?
  ├─ YES → still requires a state-certified appraiser of record to sign the USPAP report before delivery.
  └─ NO  → escalate to a state-certified appraiser (gate:licensed-appraiser-signoff) before delivery.
```

## What this pack does NOT do

- It does not appraise, select comps, or deliver reports itself or replace a state-certified appraiser —
  it forces the signer of record into the loop on every report and makes the USPAP / appraiser-independence
  / fair-housing surface explicit.
- It does not replace dedicated fair-lending review for an attached lending decision — pair with a
  lending / fair-housing pack when the product also originates or prices the loan.
