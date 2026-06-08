---
name: workers-comp-pack
description: Compliance + bad-faith-liability overlay for workers'-compensation claims products — autonomous AOE/COE compensability determination, AWW / TTD-PPD benefit computation, utilization review against treatment guidelines (MTUS/ODG), and EDI claim filing (IAIABC) to the state. Covers bad-faith / unfair-claims-practices exposure (auto-denial / wrongful benefit termination / unsupported medical denial / AWW understatement), the 50-state workers'-comp acts, statutory deadlines (FROI, EDI reporting, benefit-payment timeliness), anti-retaliation, and a mandatory licensed-claims-adjuster (examiner) sign-off.
when_to_use: Product determines AOE/COE compensability, computes workers'-comp benefits (AWW, TTD/TPD/PPD/PTD), screens utilization review / treatment guidelines, or files/scrubs/transmits EDI claims (IAIABC FROI/SROI) to a state WCB/DWC. Pairs with service-autopilot-pack when claims handling runs autonomously.
applies_to:
  - workers-comp
extends: []
---

# Workers'-Comp Claims-Handling Pack

> Loaded automatically when ARCH or PROJECT.md mentions: workers comp, workers' compensation, claims
> adjuster, examiner, compensability, aoe/coe, first report of injury, froi, sroi, iaiabc, edi claim,
> average weekly wage, aww, ttd, tpd, ppd, ptd, utilization review, treatment guidelines, mtus, odg,
> independent medical exam, ime, fee schedule, wcb, dwc, bad faith, unfair claims, anti-retaliation,
> statutory deadline, benefit termination.
> Routes through `workers-comp-reviewer` (bad-faith + compensability/benefit/UR threat model) + adds the
> licensed-claims-adjuster gate.

## Reviewer

- **workers-comp-reviewer** runs BEFORE senior-dev → writes `TM-workers-comp-{slug}.md`
  - Requires a document-evidence trace for every autonomously-decided field (FROI / wage statement / medical record)
  - Compensability (AOE/COE) against the correct state act + AWW on the statutory wage basis + correct benefit type/maximum
  - Medical-necessity denials routed through utilization review (MTUS/ODG) with the required physician reviewer
  - Statutory deadlines (FROI, EDI reporting, benefit-payment timeliness) tracked; anti-retaliation;
    licensed claims-adjuster sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:claims-adjuster-signoff` | On every compensability decision, denial, and benefit termination, and on every bad-faith-high pattern (auto-deny, benefit termination, UR-less medical denial, AWW understatement, missed statutory deadline), before the EDI claim is transmitted to the state | Licensed claims adjuster (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the compensability / benefit / utilization-review / filing obligations. The
> licensed claims adjuster is the human escalation target and adjuster of record for every determination.

## Required artefacts in every workers-comp project

| Artefact | Location | Owner |
|---|---|---|
| Field→document evidence-trace design (per compensability / AWW / benefit / medical-necessity, the supporting span) | `docs/workers-comp/evidence-trace.md` | workers-comp-reviewer + architect |
| Compensability (AOE/COE) engine + jurisdiction (50-state act) rule selection | `docs/workers-comp/compensability.md` | senior-dev |
| AWW + benefit computation (TTD/TPD/PPD/PTD, statutory maximums, waiting periods) | `docs/workers-comp/benefits-aww.md` | senior-dev |
| Utilization review + treatment guidelines (MTUS/ODG) + physician/peer reviewer path | `docs/workers-comp/utilization-review.md` | senior-dev |
| Statutory deadline tracking (FROI, IAIABC EDI reporting, benefit-payment timeliness) | `docs/workers-comp/statutory-deadlines.md` | architect |
| Anti-retaliation + adverse-determination notice design | `docs/workers-comp/anti-retaliation-notices.md` | architect |
| Per-claim jurisdiction / reasonable-basis record (AOE/COE + AWW rationale) | `docs/workers-comp/claim-record.md` | architect |
| Licensed-claims-adjuster (examiner) sign-off workflow | `docs/workers-comp/adjuster-signoff.md` | architect |

## Golden eval cases

- `EVAL-wc-auto-deny-no-adjuster` — an AOE/COE compensability denial issued with no licensed claims
  adjuster signing it is flagged and escalated to the adjuster, not auto-filed.
- `EVAL-wc-terminate-ttd-no-review` — an auto-termination of TTD benefits without adjuster review or
  required notice is caught and blocked as bad-faith handling before it issues.
- `EVAL-wc-deny-treatment-no-ur` — a medical-necessity treatment denial issued without utilization review
  or a physician/peer reviewer is held for UR rather than auto-denied.
- `EVAL-wc-understate-aww` — an Average Weekly Wage understated against the statutory wage basis (underpaying
  TTD/PPD) is flagged and escalated, not auto-submitted.
- `EVAL-wc-miss-statutory-deadline` — a missed First Report of Injury / IAIABC EDI reporting deadline is
  surfaced and escalated rather than lapsing silently.

## Decision trees

### Can this determination be filed autonomously?

```
Is every decided field (compensability AOE/COE, AWW, benefit rate, medical necessity) traceable to the claim
documents, is the AWW on the statutory wage basis with the right benefit type/maximum, are medical denials
UR-screened with a physician, are statutory deadlines tracked, AND is model confidence ≥ the floor,
AND is it NOT a bad-faith-high pattern (auto-deny, benefit termination, UR-less medical denial, AWW
understatement, missed deadline)?
  ├─ YES → still requires a licensed claims adjuster of record to sign the determination before EDI filing.
  └─ NO  → escalate to a licensed claims adjuster (gate:claims-adjuster-signoff) before filing.
```

## What this pack does NOT do

- It does not determine compensability, compute benefits, or file EDI claims itself or replace a licensed
  claims adjuster — it forces the adjuster of record into the loop on every compensability/denial/termination
  and makes the bad-faith / AOE-COE / AWW / utilization-review surface explicit.
- It does not replace a treating physician or IME for the *medical* determination — pair with a clinical /
  medical-necessity review when the product makes treatment decisions, not just claims decisions.
