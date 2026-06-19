# ADR-003: Two-axis build-gate model (project_size × change_tier)

**Status:** Accepted (v2.74.0)
**Date:** 2026-06-18
**Supersedes:** single-axis size-only gating (`gatesFor`, v2.73.x and earlier)

## Context

An honest review of the orchestrator asked: did we over-complicate it? The
answer was yes — but on the **agent/ceremony** axis, not the human-gate axis.
A concrete symptom: build gates were chosen by **one** axis, `project_size`
(`gatesFor(archetype, size)` in `packages/cli/src/archetypes.ts`). A `medium`
project therefore opened *every* gate on *every* change — including a one-line
docs fix or a test-only change. The gates that actually matter for a
regulated-compliance product are the **runtime** autopilot gates
(`scripts/lib/autopilot-gate.mjs`), which sit before an irreversible action and
are the product itself. Build-time ceremony was taxing maintenance velocity
without protecting anything CI didn't already cover.

Two non-negotiables framed the fix:

1. **Runtime autopilot gates are sacred** — per-transaction human approval
   before an irreversible regulated action. Out of scope here, untouched.
2. **No gate may be tiered away on a regulated/irreversible surface.**

## Decision

Add a second, orthogonal axis — **`change_tier`** — composed with the existing
`project_size` axis. `project_size` says how heavy a *project* is;
`change_tier` says how dangerous *this change* is.

| Tier | Meaning | Effective build-gates |
|---|---|---|
| **T0** | maintenance / fix / docs / test-only | none — CI + green tests are the gate |
| **T1** | reversible feature | `plan` + the regulated floor |
| **T2** | irreversible / regulated / deploy-to-prod | full size baseline, `ship` forced; never downgraded |

**Floor invariant (the safety property):** an archetype whose size baseline
contains `security` or `compliance` (i.e. a regulated archetype) never loses
`security` / `compliance` / `ship` at *any* tier. This is what makes the
downgrade sound — a fintech repo cannot ship an irreversible change unreviewed
even when the change is labelled a fix.

### Components

- `effectiveGates(archetype, size, tier)` — pure; maps a tier to a gate set.
  Default tier `T2` ⇒ existing behavior (back-compat, fail-safe for an unknown
  tier). `packages/cli/src/archetypes.ts`.
- `classify({changedFiles, connectors, deployTarget, labels})` — pure; decides
  the tier from signals. **T2 hard triggers:** `migrations/`, `_domains.json`,
  auth / pricing surfaces, a *new write-capable* connector, a production deploy.
  An explicit `tier:tN` beads label up/down-grades within the non-floored range
  but **cannot breach the T2 floor** (the overridden label is recorded for the
  audit log). `scripts/lib/change-tier.mjs`.
- `planGates(...)` — composes the two at runtime; the orchestrator entry point.
  CLI: `node scripts/lib/gate-plan.mjs`. `scripts/lib/gate-plan.mjs`.

### What does NOT change

- `compileFlow` / `gatesFor` still generate the static `FLOW.md` gate **menu**
  (what a project *can* gate). `change_tier` decides what a *change* actually
  gates, at runtime. The two are deliberately separate.
- Runtime autopilot gates — untouched.

## Consequences

- A docs/test-only change in a `medium` project now opens zero build gates;
  velocity on maintenance is no longer taxed.
- Regulated archetypes are provably never under-gated (floor invariant, tested).
- The build-side `change_tier` is the analog of the runtime volume/scope
  escalation (`great_cto-34g`) — kept consistent, kept separate.
- Follow-up: surface the tier as a badge on the board pipeline view
  (a UI surface, tracked separately).

## Tests

`effective-gates.test.mjs` (12), `tests/lib/change-tier.test.mjs` (19),
`tests/lib/gate-plan.test.mjs` (8). Floor invariant and label-cannot-breach-floor
are explicit cases.
