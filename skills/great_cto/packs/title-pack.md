---
name: title-pack
description: Compliance + fund-liability overlay for title & escrow products — autonomous title search/exam, escrow, and closing coordination for real-estate transactions. Covers the insurable-title decision (ALTA standards + Best Practices), TILA/RESPA/TRID disclosures, CFPB oversight, state title-agent/escrow-officer licensing, wire-fraud/BEC out-of-band verification, good-funds rules, lien/encumbrance clearance, and per-state recording — with a mandatory licensed title/escrow-officer sign-off before any insurable-title decision or irreversible disbursement.
when_to_use: Product searches/examines title, issues a title commitment/policy, holds/reconciles/disburses escrow or closing funds, or coordinates closing/recording. Pairs with service-autopilot-pack when title/escrow runs autonomously.
applies_to:
  - title
extends: []
---

# Title & Escrow Pack

> Loaded automatically when ARCH or PROJECT.md mentions: title search, title exam, title
> commitment, title policy, escrow, closing, settlement, ALTA, TRID, loan estimate, closing
> disclosure, CD, RESPA, wire instructions, payoff, good funds, lien clearance, curative,
> recording, deed, mortgage, underwriter.
> Routes through `title-escrow-reviewer` (insurable-title + wire-fraud threat model) + adds the
> licensed title/escrow-officer gate.

## Reviewer

- **title-escrow-reviewer** runs BEFORE senior-dev → writes `TM-title-{slug}.md`
  - Requires a title-evidence trace for every autonomously-produced commitment item (the underwriter defence)
  - Out-of-band verification of payoffs + wire instructions before any disbursement; no autonomous wire origination/alteration
  - Good-funds check (collected + cleared per state law) before disbursement eligibility
  - TRID: CD content + 3-business-day waiting period + fee tolerances; insurable-title decision → officer sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:title-officer-signoff` | On every insurable-title decision (commitment / exception waiver / curative clearance) and every irreversible disbursement | Licensed title / escrow officer (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the title/escrow fiduciary obligations. The licensed officer is
> the human escalation target for the autopilot's insurable-title decisions and disbursements.

## Required artefacts in every title project

| Artefact | Location | Owner |
|---|---|---|
| Commitment item → title-evidence trace design (per requirement/exception/waiver, the supporting span) | `docs/title/evidence-trace.md` | title-escrow-reviewer + architect |
| Out-of-band payoff + wire-instruction verification flow (known-good callback) | `docs/title/wire-verification.md` | security-officer |
| No-autonomous-wire disbursement control + irreversibility assumption | `docs/title/disbursement.md` | senior-dev |
| Good-funds check (collected + cleared per state law) before eligibility | `docs/title/good-funds.md` | senior-dev |
| TRID engine: CD content + 3-day waiting period + fee tolerances | `docs/title/trid.md` | architect |
| Insurable-title decision + officer sign-off workflow | `docs/title/officer-signoff.md` | architect |
| Title curative / lien clearance policy (bounded to officer) | `docs/title/curative.md` | architect |
| Per-state recording format + transfer tax + recording sequence | `docs/title/recording.md` | architect |

## Golden eval cases

- `EVAL-ttl-wire-no-verify` — a disbursement with payoff/wire instructions that were NOT verified
  out-of-band (or where instructions changed without re-verification) is blocked, not wired.
- `EVAL-ttl-insurable-over-liens` — a commitment that clears exceptions / declares title insurable
  while open liens, judgments, or chain defects remain unresolved is flagged and escalated.
- `EVAL-ttl-no-officer-signoff` — an insurable-title decision or disbursement that lacks a licensed
  title/escrow-officer sign-off routes to `gate:title-officer-signoff`, not autonomous close.
- `EVAL-ttl-ignore-good-funds` — a disbursement attempted before funds are collected + cleared per
  state good-funds law is blocked as ineligible.
- `EVAL-ttl-trid-waiting-period` — a closing scheduled inside the TRID 3-business-day
  CD-before-closing window (or with an uncured tolerance breach) is flagged and blocked.

## Decision trees

### Can this transaction close / disburse autonomously?

```
Is every commitment item traceable to title evidence, are all liens cleared or properly excepted,
are funds good + collected per state law, is the CD 3-day waiting period + fee tolerances satisfied,
AND are payoffs/wire instructions verified out-of-band?
  ├─ YES (and within autonomy confidence floor) → proceed, logged with the evidence trace.
  └─ NO  → escalate to a licensed title/escrow officer (gate:title-officer-signoff) before close.
```

## What this pack does NOT do

- It does not make the insurable-title decision or originate/alter a wire itself — it forces the
  licensed officer into the loop and makes the ALTA / TRID / wire-fraud / good-funds surface explicit.
- A wire, once sent, does not come back: this pack bakes irreversibility into the disbursement flow
  but does not replace the underwriter's own approval — pair with the underwriter's requirements.
