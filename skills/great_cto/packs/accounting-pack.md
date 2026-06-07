---
name: accounting-pack
description: Controls + financial-reporting overlay for accounting / bookkeeping / close products — autonomous journal entries, reconciliations, revenue recognition, and period close. Covers GAAP / IFRS, ASC 606 / IFRS 15 revenue recognition, SOX ICFR + ITGC, segregation of duties (post vs approve), an immutable balanced ledger + audit trail, and a mandatory controller close sign-off.
when_to_use: Product posts journal entries, reconciles accounts, recognises revenue, or runs the period close. Pairs with service-autopilot-pack when bookkeeping / close runs autonomously.
applies_to:
  - accounting
extends: []
---

# Accounting / Financial-Close Pack

> Loaded automatically when ARCH or PROJECT.md mentions: accounting, bookkeeping, journal entry,
> general ledger, \bgl\b, sub-ledger, reconciliation, revenue recognition, asc 606, ifrs 15,
> period close, month-end, accrual, sox, icfr, audit trail, controller, trial balance, gaap.
> Routes through `accounting-reviewer` (ICFR + SoD + ledger-integrity threat model) + adds the close gate.

## Reviewer

- **accounting-reviewer** runs BEFORE senior-dev → writes `TM-accounting-{slug}.md`
  - Segregation of duties (post ≠ approve, prepare ≠ review) as enforced roles
  - Append-only, always-balanced double-entry ledger; corrections via reversing entries
  - ASC 606 / IFRS 15 five-step revenue recognition; non-standard → accountant review
  - Cutoff + accrual + reconciliation controls; ICFR/ITGC if SEC issuer

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:financial-close` | For non-standard / above-materiality entries, non-standard revenue, and the period-close lock | Controller / accountant (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the GAAP/ICFR/SoD obligations. The controller is the escalation
> target for the autopilot's above-materiality and non-standard entries.

## Required artefacts in every accounting project

| Artefact | Location | Owner |
|---|---|---|
| Segregation-of-duties role matrix (post ≠ approve, prepare ≠ review) | `docs/accounting/sod-matrix.md` | architect |
| Ledger-integrity design (append-only, always-balanced, reversing corrections) | `docs/accounting/ledger-integrity.md` | senior-dev |
| Entry-level audit trail spec (who/what/source/timestamp + evidence) | `docs/accounting/audit-trail.md` | architect |
| ASC 606 / IFRS 15 five-step revenue policy + escalation rules | `docs/accounting/rev-rec.md` | architect |
| Close calendar — cutoff, accruals, reconciliation review (preparer ≠ reviewer) | `docs/accounting/close-controls.md` | architect |
| Materiality threshold + auto-post ceiling | `docs/accounting/materiality.md` | architect |
| ICFR control matrix + ITGC + auditor-reperformable evidence export (SEC issuers) | `docs/accounting/icfr.md` | architect + security-officer |

## EVAL suite

- `EVAL-ledger-always-balances` — every posted entry has debits = credits; an unbalanced entry is
  rejected, not posted.
- `EVAL-no-silent-edit` — a posted entry cannot be edited or deleted; a correction is a reversing
  entry with its own evidence + audit-trail link.
- `EVAL-sod-post-approve-blocked` — the same actor cannot both post and approve a journal entry
  (or prepare and review a reconciliation).
- `EVAL-asc606-non-standard-escalates` — a non-standard / multi-element / variable-consideration
  contract escalates to a human accountant rather than auto-recognising revenue.
- `EVAL-period-lock-requires-signoff` — closing/locking a period requires controller sign-off
  (`gate:financial-close`); no autonomous close.

## Decision trees

### Can this journal entry be posted autonomously?

```
Is the entry standard/recurring, balanced (debits = credits), ≤ materiality, SoD-satisfied
(the agent is not also the approver), AND not a non-standard revenue-recognition judgment?
  ├─ YES → autonomous post, append-only, logged with source + evidence.
  └─ NO  → escalate to a human approver / accountant (gate:financial-close). Period close/lock
            is never autonomous.
```

## What this pack does NOT do

- It does not replace a controller / external auditor — it forces SoD, an immutable balanced
  ledger, and a close sign-off, and makes the GAAP / ASC 606 / ICFR surface explicit.
- For payment movement (AP / treasury) pair with `procurement-reviewer` / `pci-reviewer`; this
  pack is the books of record, not the money rails.
