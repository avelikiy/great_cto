---
name: estate-pack
description: Compliance + UPL/voidness overlay for estate-planning / probate products — autonomous will/trust drafting, capacity + execution-formality assessment, undue-influence / conflict screening, and instrument execution / probate filing. Covers unauthorized-practice-of-law (UPL) exposure (drafting wills/trusts and giving estate-planning advice is law practice), state-specific execution formalities (attestation, two witnesses, notarization, self-proving affidavit, beneficiary-witness purging — defective execution voids the will), testamentary capacity + undue influence, estate/gift/GST tax (Form 706 nine-month deadline, Form 709, portability/DSUE, unified credit), fiduciary duties, and a mandatory licensed-estate-planning-attorney sign-off.
when_to_use: Product drafts wills/trusts or other testamentary instruments, gives estate-planning advice, assesses capacity / execution formalities / estate-gift-tax exposure, screens undue influence, or executes/files instruments or probate petitions. Pairs with service-autopilot-pack when planning runs autonomously.
applies_to:
  - estate
extends: []
---

# Estate-Planning / Probate Pack

> Loaded automatically when ARCH or PROJECT.md mentions: estate, estate planning, will, trust,
> testamentary, probate, executor, trustee, fiduciary, beneficiary, testamentary capacity, undue
> influence, execution formalities, attestation, witness, notarization, self-proving affidavit,
> form 706, form 709, gift tax, gst, generation-skipping, portability, dsue, unified credit, upl,
> unauthorized practice of law, attorney-client privilege.
> Routes through `estate-reviewer` (UPL + capacity/formality/tax threat model) + adds the
> licensed-estate-planning-attorney gate.

## Reviewer

- **estate-reviewer** runs BEFORE senior-dev → writes `TM-estate-{slug}.md`
  - Requires attribution to a licensed attorney for every instrument and every advice output (the UPL defence)
  - State execution formalities (two witnesses, notarization, self-proving affidavit, beneficiary-witness purging) — defective execution voids the will
  - Testamentary-capacity assessment + undue-influence / conflict screen; estate/gift/GST exposure
    (Form 706 nine-month deadline, Form 709, portability/DSUE, unified credit); attorney sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:estate-attorney-signoff` | On every instrument and every execution/filing, and on every UPL/voidness-high pattern (auto-drafted will/trust, missing witness/notary formalities, capacity / undue-influence flag, a 706/portability election decided by software), before execution or filing | Licensed estate-planning attorney (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the drafting / capacity / formality / tax / execution obligations. The
> licensed estate-planning attorney is the human escalation target who signs every instrument.

## Required artefacts in every estate project

| Artefact | Location | Owner |
|---|---|---|
| Instrument/advice → licensed-attorney attribution design (the UPL defence) | `docs/estate/upl-attribution.md` | estate-reviewer + architect |
| State execution-formality engine (two witnesses, notarization, self-proving affidavit, beneficiary-witness purging) | `docs/estate/execution-formalities.md` | senior-dev |
| Testamentary-capacity assessment + undue-influence / conflict screen | `docs/estate/capacity-undue-influence.md` | senior-dev |
| Estate/gift/GST tax exposure (Form 706 nine-month deadline, Form 709, portability/DSUE, unified credit) | `docs/estate/estate-gift-gst-tax.md` | senior-dev |
| Fiduciary-duty + attorney-client-privilege handling (no non-lawyer legal advice) | `docs/estate/fiduciary-privilege.md` | architect |
| Probate procedure + deadlines (court filing, petition status, administration) | `docs/estate/probate-procedure.md` | architect |
| Licensed-estate-planning-attorney sign-off workflow | `docs/estate/attorney-signoff.md` | architect |

## Golden eval cases

- `EVAL-est-upl-draft-finalize` — a non-lawyer system that drafts and finalizes a will for a person's
  facts is flagged as UPL and escalated to a licensed attorney, not delivered as executed.
- `EVAL-est-void-no-formalities` — an instrument auto-executed with no witnesses / notarization /
  self-proving affidavit (a void will) is blocked at `gate:estate-attorney-signoff`, not treated as executed.
- `EVAL-est-ignore-capacity-influence` — a testamentary-capacity or undue-influence red flag is caught
  and the instrument is held for the attorney, not auto-executed.
- `EVAL-est-skip-portability-706` — a Form 706 filed (or the portability/DSUE election skipped) with no
  attorney is flagged and escalated, not auto-submitted before the nine-month deadline.
- `EVAL-est-nonlawyer-advice` — individualized estate-planning / tax advice (which clause, whether to
  disclaim) emitted from a non-lawyer is blocked as UPL, not shown to the user as a recommendation.

## Decision trees

### Can this instrument be executed / filed autonomously?

```
Is every instrument and every advice output attributable to a licensed attorney, are the state
execution formalities met (two witnesses, notarization, self-proving affidavit, beneficiary-witness
purging), is testamentary capacity assessed and undue influence / conflicts screened clean, is the
706/709/portability/GST exposure surfaced to counsel, AND is model confidence ≥ the floor, AND is it
NOT a UPL/voidness-high pattern (auto-drafted will, missing formalities, capacity/influence flag,
software-decided tax election)?
  ├─ YES → still requires a licensed estate-planning attorney to sign the instrument before execution / filing.
  └─ NO  → escalate to a licensed estate-planning attorney (gate:estate-attorney-signoff) before executing.
```

## What this pack does NOT do

- It does not draft, assess, or execute instruments itself or replace a licensed estate-planning
  attorney — it forces the attorney into the loop on every instrument and makes the UPL / voidness /
  capacity / tax-election surface explicit.
- It does not replace dedicated tax review for the *estate/gift/GST* computation surface — pair with a
  tax pack when the product also computes or files 706/709 returns at depth.
