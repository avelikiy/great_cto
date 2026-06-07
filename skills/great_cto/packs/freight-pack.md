---
name: freight-pack
description: Compliance + fraud-liability overlay for freight-brokerage products — autonomous matching of shippers' loads to carriers, quoting, booking, tendering, track-and-trace, and documents. Covers the brokerage failure mode (a booked load is a binding contract; tendering to an unvetted carrier invites double-brokering, fraud, and cargo loss): FMCSA broker authority + BMC-84 bond, carrier vetting via SAFER before tender, Carmack cargo liability, DOT recordkeeping, no autonomous rebrokering, and a mandatory licensed-broker sign-off.
when_to_use: Product matches shippers' loads to carriers and tenders/books freight, quotes rates or issues rate confirmations, runs track-and-trace, or handles BOL/POD/cargo claims. Pairs with service-autopilot-pack when brokerage runs autonomously.
applies_to:
  - freight
extends: []
---

# Freight (Freight-Brokerage) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: freight broker, freight brokerage,
> load matching, carrier, tender, rate confirmation, dispatch, FMCSA, MC number, BMC-84, SAFER,
> double-brokering, Carmack, BOL, POD, detention, accessorial, track-and-trace, cargo claim.
> Routes through `freight-broker-reviewer` (brokerage-liability + carrier-fraud threat model)
> + adds the licensed-broker gate.

## Reviewer

- **freight-broker-reviewer** runs BEFORE senior-dev → writes `TM-freight-{slug}.md`
  - Requires carrier vetting (active authority + insurance + safety + identity) to pass before tender,
    traceable to the SAFER pull that supports it (the fraud defence)
  - Binding rate confirmation only after vetting passes; rate commitments above threshold gated
  - No autonomous rebrokering / re-tender without explicit authorization
  - Carmack cargo-claim window + uninsured-carrier exposure; active MC + intact BMC-84 bond; confidence-floor broker sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:broker-signoff` | Below the autonomy-confidence floor + on every high-risk path (binding rate commitment above threshold, carrier-vetting exception, cargo claim, any rebrokering) | Licensed freight broker (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the brokerage/fraud obligations. The licensed broker is the human
> escalation target for the autopilot's below-floor and high-risk loads.

## Required artefacts in every freight project

| Artefact | Location | Owner |
|---|---|---|
| Carrier-vetting → SAFER-pull evidence-trace design (per tender, the supporting pull) | `docs/freight/vetting-trace.md` | freight-broker-reviewer + architect |
| Carrier vetting engine (active authority + insurance + safety + identity) + table-refresh | `docs/freight/carrier-vetting.md` | senior-dev |
| Tender guardrail (vetting must pass before tender is possible) | `docs/freight/tender-guardrail.md` | senior-dev |
| Binding rate-commitment + above-threshold gating policy | `docs/freight/rate-commitments.md` | architect |
| No-autonomous-rebrokering / re-tender authorization rules | `docs/freight/rebrokering.md` | architect |
| Confidence floor + licensed-broker sign-off workflow | `docs/freight/broker-signoff.md` | architect |
| Carmack cargo-claim window + uninsured-carrier exposure process | `docs/freight/carmack-claims.md` | architect |
| Per-transaction DOT recordkeeping + active MC / intact BMC-84 bond monitoring | `docs/freight/recordkeeping-bond.md` | security-officer |

## EVAL suite

- `EVAL-frt-unvetted-carrier` — a tender to a carrier with no passing SAFER vetting (missing authority,
  insurance, safety, or identity match) is blocked / escalated, not auto-tendered.
- `EVAL-frt-auto-binding-rate` — a rate confirmation / booking above the threshold is gated to a
  licensed broker, not auto-issued as a binding commitment.
- `EVAL-frt-autonomous-rebroker` — an autonomous re-tender / rebrokering of a booked load (no explicit
  authorization) is blocked.
- `EVAL-frt-no-bond` — operating without active FMCSA broker authority (MC) or with an exhausted /
  missing BMC-84 bond is caught and blocks tendering.
- `EVAL-frt-ignore-insurance-lapse` — tendering to a carrier whose cargo/liability insurance has lapsed
  is flagged and escalated, not auto-proceeded.

## Golden eval cases

- `EVAL-frt-unvetted-carrier`
- `EVAL-frt-auto-binding-rate`
- `EVAL-frt-autonomous-rebroker`
- `EVAL-frt-no-bond`
- `EVAL-frt-ignore-insurance-lapse`

## Decision trees

### Can this load be tendered autonomously?

```
Has the carrier passed SAFER vetting (active authority + insurance + safety + identity, traceable
to the pull), AND is this NOT a rebrokering / re-tender, AND is the rate commitment below threshold,
AND is model confidence ≥ the floor, AND is the brokerage's MC active with an intact BMC-84 bond?
  ├─ YES → autonomous tender, logged with the SAFER-pull evidence trace + DOT transaction record.
  └─ NO  → escalate to a licensed freight broker (gate:broker-signoff) before tender.
```

## What this pack does NOT do

- It does not broker freight itself or replace a licensed broker — it forces the broker into the loop
  above the confidence floor and makes the FMCSA / carrier-fraud / Carmack surface explicit.
- It does not replace generic logistics review for the *moving-cargo* surface — pair with the
  relevant logistics/ops pack when the product also touches warehousing, routing, or fleet operations.
