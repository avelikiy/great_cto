# Mid-build recovery — the spec-level escape hatch

> Status: active · Created 2026-06-28 · Decision: [ADR-005](../adr/ADR-005-mid-build-spec-reentry.md) · Closes [#107](https://github.com/avelikiy/great_cto/issues/107)

The build flow has one human gate: the CTO approves the spec, then the build runs
automated to `gate:ship`. **This doc is the missing path** for when the spec turns
out to be structurally wrong *after* approval but *before* the build finishes.

It exists because the two ad-hoc options are both bad: **finish on the bad spec**
(waste + rework) or **abort and restart from scratch** (the whole $3+ build). The
escape hatch makes a discovered spec error a bounded recovery instead.

## When to pull it — triggers (structural only)

A mid-build STOP is for **structural** spec errors, not slice-level nits (those
are still resolved inline by senior-dev Phase 0):

- wrong **data model** (entities/relations that won't support the requirements)
- wrong **integration surface** (the API/contract/3rd-party shape is mismatched)
- an **invalidated key assumption** the spec was built on
- **cost** projected to exceed the run's headroom

## Who can raise it

| Role | Authority |
|------|-----------|
| **CTO** | Raises and decides — authoritative. |
| **architect / senior-dev / `/review`** | **Recommend** via a `SPEC-OBJECTION` verdict. They never silently abort; they surface it (HANDOFF → `/inbox`) and the CTO decides. |

`SPEC-OBJECTION` re-opens `gate:plan` instead of being absorbed:
- **senior-dev Phase 0** — a *structural* disagreement (vs a slice nit) emits
  `SPEC-OBJECTION` and STOPs, rather than "proceed on the resolved spec".
- **`/review`** — a P0 finding on the *spec / architecture* angle writes
  `SPEC-OBJECTION`, not just a `gate:code` finding.

## The checkpoint already exists

No new snapshot store is added — re-entry rides on state that already persists:

| State | Written by | Enables |
|-------|-----------|---------|
| `docs/architecture/ARCH-{slug}.md` | architect | re-run spec with the prior design as input |
| `.great_cto/HANDOFF.md` | PreCompact hook | open gates / tasks / last verdict |
| Beads task graph (`.beads/`) | all agents | which tasks/phases completed |
| `.great_cto/PROJECT.md` | start/audit | archetype, phase, compliance |

## Re-entry — re-run the delta, not the world

```
SPEC-OBJECTION raised
        │
   👤 CTO reviews (/inbox)
        ├── reject objection → resume build unchanged
        └── accept → STOP build, re-open gate:plan
                 │
        architect re-runs WITH existing ARCH-{slug}.md as input
                 │
        diff the new spec vs old → changed surface only
                 │
        re-open ONLY Beads tasks downstream of the changed surface
                 │
        re-run spec → scaffold-delta → affected backend/frontend
                 │
        log a Decision-Log entry (Reversible: field) — what changed + cost
```

### Phase re-entry — honest cost table

| Phase | Re-enter without redoing earlier? | Cost |
|-------|-----------------------------------|------|
| Spec (`gate:plan`) | Yes — ARCH doc persists | low |
| Scaffold (S2) | Yes, but **not yet idempotent** — may need manual cleanup of duplicate resources (hardening deferred, ADR-005 §Consequences) | medium |
| Backend (S3) | Only tasks downstream of the changed surface re-open; merged PRs need new tasks | medium–high |
| Frontend (S4) | In-progress only; merged = fresh feature request | medium |

## Default behaviour (no founder round-trip needed)

Per great_cto's implementer-defaults rule, the escape hatch has safe defaults so it
never blocks waiting on the founder:

- **Default on objection:** STOP and surface (don't auto-resume, don't auto-abort).
  Reversible: yes (CTO can reject the objection and resume).
- **Default re-entry scope:** delta only (downstream-of-changed-surface tasks).
  Reversible: yes (CTO can widen to full re-plan).
- **Default logging:** every accepted objection writes a Decision-Log entry.

## Approval-gate clarity

The `gate:plan` approval is **hard-but-not-impossible to undo**: approving starts
an automated build, and reversing it costs the delta above. It is not a one-way
door — but it is not free. See ADR-005.
