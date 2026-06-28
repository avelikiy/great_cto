# ADR-005: Mid-build spec re-entry (the CTO gate is reversible-with-cost)

**Status:** Accepted (v2.75.0)
**Date:** 2026-06-28
**Related:** ADR-003 (two-axis build-gate model)
**Closes:** [#107](https://github.com/avelikiy/great_cto/issues/107)

## Context

The build flow documents exactly one human gate — the CTO approving the
spec/architecture (`gate:plan`) — and `docs/strategy/BUILD-PIPELINES.md` states
"everything after it is automated build." Issue #107 found the gap: there is no
documented path for when the spec turns out to be structurally wrong *after*
approval but *before* the build finishes (wrong data model, wrong integration
surface, invalidated assumption).

The code confirms the gap:

- **No re-enter-from-spec protocol.** State that *would* enable cheap re-entry
  already persists — `docs/architecture/ARCH-{slug}.md`, `.great_cto/HANDOFF.md`
  (PreCompact hook), the Beads task graph, `.great_cto/PROJECT.md` — but nothing
  wires it to a STOP. "Phases" (`references/phases.md`) are SessionStart context
  filters, not checkpoints you can rewind to.
- **No spec-level objection channel mid-build.** `/review` (`commands/review.md`)
  is a *code* reviewer — it diffs vs `main` and creates `gate:code`; it cannot
  re-open `gate:plan`. senior-dev's "Phase 0 — argue with the spec"
  (`agents/senior-dev.md:31`) resolves disagreements **inline** and "proceeds on
  the resolved spec" — it never halts or escalates a structural error.
- **The gate reads as irreversible.** The CTO experiences approval as a
  checkpoint; the system treats it as a commit. Nothing records "approved, then
  reversed, here's why."

The cost of the two ad-hoc options is real: finish on a bad spec (waste + rework)
or abort and restart from scratch (the full $3+ build, as in the proof run).

## Decision

1. **`gate:plan` is reversible-with-cost, not a hard commit.** A mid-build
   spec-level STOP is a first-class, documented operation — see
   `docs/strategy/MID-BUILD-RECOVERY.md`.
2. **The persisted state IS the checkpoint.** `ARCH-{slug}.md` + `HANDOFF.md` +
   the Beads graph + `PROJECT.md` are sufficient to re-enter from the spec phase
   without re-running the whole pipeline. We do not add a new snapshot store; we
   document the re-entry that this existing state already permits.
3. **`SPEC-OBJECTION` escalation.** Any agent that discovers a *structural* spec
   error mid-build emits a `SPEC-OBJECTION` verdict that re-opens `gate:plan`
   instead of absorbing it inline:
   - senior-dev Phase 0: a *structural* disagreement (not a slice nit) → STOP +
     `SPEC-OBJECTION`, surfaced in `/inbox` via HANDOFF.
   - `/review`: a P0 finding on the *spec/architecture* angle → `SPEC-OBJECTION`,
     not just a `gate:code` finding.
   The CTO decides; agents only *raise* the objection.
4. **Re-entry re-runs the delta, not the world.** Re-open `gate:plan`, architect
   re-runs with the existing ARCH doc as input, only spec→scaffold-delta re-runs,
   and Beads tasks downstream of the changed surface are re-opened — not the whole
   graph.
5. **Reversals are logged.** A Decision-Log entry with the existing
   `Reversible:` field (`references/decision-log.md`) records the reversal + cost.

## Consequences

- **+** A long build is no longer a one-way door; a discovered spec error has a
  bounded recovery instead of finish-bad or restart-from-zero.
- **+** Zero new infrastructure — the escape hatch rides on state that already
  persists.
- **−** Re-entry is only *cheap*, not *free*: scaffold is not yet idempotent
  (`agents/app-scaffolder.md` lacks the guarantee `infra-provisioner.md` has), so
  scaffold-delta re-runs may need manual cleanup until that is hardened (deferred
  to its own change — it touches build behavior).
- **−** `SPEC-OBJECTION` adds a path agents can over-use; scoped to *structural*
  errors (data model / integration surface / invalidated assumption / cost
  overrun), not slice-level nits, which Phase 0 still resolves inline.
