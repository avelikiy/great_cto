# ADR-010: Pipeline position is a pull-view over the state the dispatcher pushes

Date: 2026-08-06
Status: PROPOSED

## Context

`scripts/hooks/pipeline-dispatcher.mjs` computes "what runs next" and injects a
`PIPELINE-NEXT` directive — but only as a PostToolUse hook, the instant a subagent
finishes. There is no way to **ask** "where is the pipeline now, what ran, and what
is it waiting on" at an arbitrary moment: after a context compaction, at session
start, or when a run stalled hours ago. The board surfaces outcomes (verdicts,
gates, tasks) but never the *current position* or *what it is blocked on*. Every
input needed to answer this already exists and is already read by the dispatcher:
`shared/pipeline.toml` (the transition map), `.great_cto/verdicts/<agent>.log` (last
line = an agent's verdict), and `scripts/lib/approval-level.mjs` (which gates are
active at this project's approval-level).

## Decision

Add a read-only pull-view, `scripts/lib/pipeline-position.mjs` (pure function plus a
node CLI, lib-and-CLI in one file per the `approval-level.mjs` pattern):

1. **Reuse `decideNext`.** The lib picks the current position, then delegates the
   what's-next / is-it-gated computation to the dispatcher's already-exported pure
   `decideNext`, whose returned `kind` (`blocked | join-wait | done | gate | next |
   no-verdict`) is exactly the answer. It imports `parsePipelineToml`,
   `parseVerdictLine`, and `decideNext` from the dispatcher, and
   `gatesForApprovalLevel` / `levelFromProjectMd` from `approval-level.mjs`.
2. **Cursor = newest verdict event.** "Which stage last succeeded" is the agent
   whose latest verdict line has the newest timestamp; `decideNext` runs against it.
3. **Show stale, don't hide it.** The lib reads every agent's latest verdict
   regardless of age and labels each fresh/stale, rather than reusing the
   dispatcher's 30-min `latestVerdict` filter.

The view never writes, spawns, approves a gate, or re-derives transition logic.

## Alternatives Considered

- **Re-implement transition + gate logic in the new lib** — rejected because it
  duplicates `decideNext`; the pull-view and the push-directive would drift and could
  disagree on whether a gate blocks — the exact confusion this view exists to remove.
- **Extend the dispatcher to also serve an on-demand query** — rejected because the
  dispatcher is a PostToolUse hook with a fixed stdin/stdout contract (`exit 0`
  always, silent-when-nothing-to-say); overloading it couples an interactive CLI to
  the hook lifecycle. Keep the hook single-purpose; share the pure functions.
- **Cursor = furthest-along agent in topological order** — rejected because it breaks
  ADR-005 mid-build re-entry (a re-run early agent would not move the cursor back to
  where work resumed) and the parallel `qa-engineer`/`security-officer` branch;
  newest-event matches how the pipeline actually advances.
- **Reuse the 30-min `latestVerdict` filter for the cursor** — rejected because it
  would report "idle" for any pipeline stalled more than 30 minutes ago, which is the
  case an operator most needs surfaced.

## Consequences

- Positive: on-demand answer to "where are we" from the same state the dispatcher
  acts on; a single source of transition truth (shared pure functions) means the pull
  and push answers cannot disagree by construction.
- Positive: strictly additive and read-only — one new file plus one export line;
  rollback is a commit revert with no data surface.
- Negative: a soft coupling — the position lib imports pure functions from a *hooks*
  file. Acceptable today (those functions are already exported and test-consumed);
  the clean fix (extract shared parsers to `scripts/lib/pipeline-core.mjs`) is
  deferred as out of scope for this Small change.
- Risks: the newest-event cursor can look surprising during out-of-order re-entry
  (a later early-agent success supersedes an earlier downstream success). This is the
  intended semantics and is documented in the ARCH; it matches ADR-005 re-entry.
```
