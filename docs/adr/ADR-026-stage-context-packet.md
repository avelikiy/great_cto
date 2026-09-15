# ADR-026 — What a Codex stage knew: context by file, and a record of it

**Status:** Proposed — not implemented.
**Date:** 2026-09-15
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-021 — a live stream of agent events](ADR-021-live-agent-events.md) (where the record is emitted) ·
[ADR-023 — per-turn diffs](ADR-023-per-turn-diffs.md) (what a stage changed; this is what it was told) ·
[The borrowed-patterns plan](../plans/PLAN-2026-09-15-borrowed-patterns.md) (item 4)

## Context

`runStage` in `scripts/lib/codex-pipeline.mjs` builds each Codex worker's prompt
from the controller contract, the role profile, the user task, **every previous
stage's full result as inline JSON**, the release summary and the rework
feedback. Workers run `ephemeral: true`, so each stage starts cold and that prompt
is all it knows.

Measured from the code, not assumed:

- **The prompt grows with the run.** The eighth stage carries seven results
  inline, verification findings and check summaries included. Nothing bounds it.
- **Nothing records what a stage was given.** An attempt records its input tree
  receipt, its proposal digest and its verification — not the context. When a
  stage makes a surprising decision, "did it even see qa's finding?" cannot be
  answered after the fact.
- **Every handoff is fresh**, and that is not written down either.

claudexor (MIT) hydrates a harness that has not seen the whole conversation with a
bounded "continuation packet" written to a file and referenced by path, and
records on every turn whether it resumed natively, got a packet, or started
fresh. The idea is taken here, not the code.

## Decision (proposed)

1. **Previous results go to a file, not the prompt.**
   `.great_cto/codex-runs/<run-id>/context/<attempt-id>.md`, inside the project, so
   the read-only worker can open it. The prompt names its path and its SHA-256.
   The file holds the same results, summaries and rework feedback that are inlined
   today, framed as untrusted evidence exactly as the prompt frames them now.

2. **A byte budget, with the newest kept whole.** Past 64 KiB, the oldest results
   are reduced to verdict + summary; the newest are kept whole. The cut is
   mechanical and says what it dropped — no model summarises another model's work
   into the packet.

3. **Every attempt records what it was given.** `attempt.context = { mode, path,
   sha256, bytes, results: [roles], truncated: [roles] }`, and an agent event
   `stage-context` with the same fields. `mode` is `packet` for every Codex stage
   today, `fresh` for a first stage with nothing to carry; `native_resume` is
   reserved and not produced — workers are ephemeral, and claiming a resume that
   did not happen would be the false state this repository keeps removing.

4. **The digest is checked, not trusted.** Before dispatch the controller
   re-hashes the file; a mismatch blocks the stage like a changed tree does.

## Not decided here

- Native session resume for Codex stages. It would change the isolation workers
  run under; that is its own decision.
- Claude Code subagents. Their context is the host's, and `HANDOFF.md` remains
  the session-to-session map for the Ralph loop and SessionStart.

## Alternatives considered

- **Keep inlining, add only the record.** Rejected: the record would show the
  growth without bounding it.
- **Let a model summarise previous results.** Rejected: a summary written by one
  model is the only view the next one gets of the work, and what it drops cannot
  be recovered from the record.

## Consequences

- Stage prompts stop growing with the run; a late stage's context is bounded.
- "What did this stage know?" is answerable from `state.json` and the events log.
- One more file per attempt under `.great_cto/codex-runs/`, already excluded from
  receipts and gate tokens.

## Verification before calling it done

- A run of three stages writes three context files; the third names two roles.
- A packet over budget keeps the newest result whole, reduces the oldest, and
  lists the reduced roles in `truncated`.
- A context file edited between write and dispatch blocks the stage.
- `attempt.context.mode` is never `native_resume`.
