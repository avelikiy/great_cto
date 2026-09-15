# ADR-025 — A council of independent architecture drafts, merged into one

**Status:** Proposed — not implemented. Needs a CTO decision: it adds model spend to every run that opts in.
**Date:** 2026-09-15
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-009 — gates follow reversibility](ADR-009-gates-follow-reversibility.md) (why a new cost needs a decision) ·
[The borrowed-patterns plan](../plans/PLAN-2026-09-15-borrowed-patterns.md) (item 2) ·
`scripts/lib/second-opinion.mjs` (the divergence-is-the-signal rule this reuses) ·
`scripts/lib/cross-model-review.mjs` (the existing second model, on diffs)

## Context

One model drafts the architecture. `agents/architect.md` asks it to propose two
or three options, attack its own pick, and hand binding choices to
`decision-scorer` — all of which is one model arguing with itself. Its blind spots
reach `gate:arch`, the one checkpoint where a wrong design is still cheap to
change (ADR-009), with nothing positioned to show them.

A second model already exists in two places, and neither covers this:

- `cross-model-review.mjs` red-teams a **finished diff** — after the design has been built.
- `second-opinion.mjs` walks two judges through a DAG of closed questions and
  reports where they **diverge**. Its rule is the right one: agreement between
  correlated models is close to no information; divergence names something a
  human can settle.

claudexor (MIT) runs "council" planning: N harnesses draft a plan in parallel, one
merge pass produces a single plan whose open questions reach the human as one
set. The idea is taken here, not the code.

## Decision (proposed)

1. **Opt-in, per project.** `council: arch` in `.great_cto/PROJECT.md`. Absent
   means off. The declaration is the decision to spend; nothing turns it on by
   default.

2. **Independent drafts from the same inputs.** After the architect has read the
   brief and PROJECT.md — and before it writes — `scripts/lib/council.mjs` asks
   each declared member for its own draft of the same sections, from the same
   inputs. Members are the providers `resolveSecondOpinion` already knows
   (`codex`, `openrouter`), never a second call to the architect's own model. A
   member never sees the architect's draft or another member's: a second opinion
   that read the first is not a second opinion.

3. **Drafts are files, read by path.** `docs/architecture/council/<feature>/draft-<member>.md`.
   The merge step points at them; their text never rides a prompt in full.

4. **One merge, one set of questions.** The architect writes the single
   `ARCH-<feature>.md` as today, plus a `## Council` section listing **where the
   drafts diverged** — a different datastore, a boundary drawn elsewhere, a risk
   one draft names and the others do not — each with the architect's resolution
   or an open question. Agreement is not reported as confidence. The human answers
   one `## Open Questions` section at `gate:arch`, not one per draft.

5. **Every member has a state, and a missing one is visible.** `drafted`,
   `failed` (with why), `unavailable` (not declared or no credentials). With no
   external draft the run continues as a solo architect and `gate:arch` shows
   `council: degraded — 0 of N members drafted`. It never reads as a council that
   agreed.

6. **Cost is shown before and measured after.** Before the members run: an
   estimate from input size × members × price (`cost-meter.mjs`), and a hard cap
   `council-max-usd` (default 2). A member whose estimate would exceed the cap is
   skipped and recorded as such. After: each member's usage is recorded as
   measured, or as unverifiable when the provider returns none — never as `$0`
   (INV-007).

## Not decided here

- Which models are members. That is the project's `second_opinion` declaration.
- Councils for any stage other than architecture. Architecture is where a second
  design is cheapest to act on; a council over code is a diff review, which
  already exists.
- Automatic merging by a model other than the architect.

## Alternatives considered

- **A second model reviews the finished ARCH doc.** Rejected: a reviewer reading
  a confident design judges whether it reads plausibly — the failure mode
  `second-opinion.mjs` was written against. An independent draft can only
  diverge by actually designing something else.
- **Show the human all N drafts.** Rejected: it moves the merge onto the person
  at the gate and turns one decision into N readings.
- **Always on.** Rejected: it adds spend to every run, and ADR-009 puts a new
  cost behind a decision.

## Consequences

- A project that opts in pays for N extra drafts per architecture, bounded by
  `council-max-usd`, and gets a named list of design disagreements at `gate:arch`.
- `agents/architect.md` gains one step (run the council, read the drafts by path,
  write `## Council`); its output contract gains one section when council is on.
- A run where no member could draft is visibly a solo run.

## Verification before calling it done

- A fixture run with two stub members that disagree on one decision produces a
  `## Council` section naming that decision, and one `## Open Questions` section.
- A member that times out is recorded `failed`; all members failing shows
  `council: degraded` at the gate.
- A member whose estimate exceeds the cap is skipped, not run.
- Cost rows appear in the ledger as measured or unverifiable; none reads `0`.
- With `council:` absent, no member is called and no council file is written.
