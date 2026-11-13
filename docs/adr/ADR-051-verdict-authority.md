# ADR-051: Verdict authority — a role writes only its own verdict, and the harness says who wrote it

**Date:** 2026-11-13
**Status:** Accepted (2026-11-13, owner) — slice 1 implemented; slices 2 and 3 approved, in that order
**Related:** [ADR-046 verdict seals](ADR-046-verdict-seals.md) · [ADR-009 gates follow reversibility](ADR-009-gates-follow-reversibility.md) · [plan](../plans/PLAN-archon-lessons.md), item 1

## Context

A verdict in `.great_cto/verdicts/<role>.log` is what moves the pipeline and what devops checks
before a deploy (`receipt.mjs --verify --require`). Three facts about who writes it:

- Every one of the 73 agent prompts calls `scripts/log-verdict.sh <role> …` itself, and each
  names only its own role (checked on 2026-11-13: no prompt writes another role's name).
- ADR-046 seals each line, and lists what the seal does not do: "an agent can run
  `log-verdict.sh qa-engineer PASS` without being the QA agent". The seal proves the writer ran,
  not who asked it to. `scripts/lib/gate-state.mjs:40` says the same of gate beads.
- Nothing refused a shell `>`, `tee`, `sed -i`, `rm` or `truncate` on a verdict log. A
  hand-written line fails its seal under `--require`, but a deleted or truncated log is evidence
  destroyed, which ADR-009 lists as expensive to undo.

The reference point is coleam00/Archon (v0.14.0): a review verdict there is written by a script
from the role's structured output, and only an author the system trusts counts. great_cto's
controlled mode already works this way (workers return JSON, the controller writes). The native
Claude Code mode, where most runs happen, does not.

Claude Code hands a PreToolUse hook that fires inside a subagent the subagent's `agent_id` and
`agent_type`. great_cto hooks already read both (`agent-execution-budget.mjs`,
`subagent-stop-completion.mjs`). That is an identity the agent does not choose per call.

## Decision

Authority over a verdict follows the role that ran, in three slices.

### Slice 1 — refuse the wrong writer (implemented: `scripts/hooks/verdict-authorship-guard.mjs`)

A PreToolUse check, run inside `bash-guards.mjs` for shell calls and as its own hook for
`Edit|Write|MultiEdit`:

1. **A subagent writes only its own role.** A shell call from a subagent that runs the writer —
   `log-verdict.sh <role>` or `verdict-record.mjs --emit` with `AGENT=<role>` — is refused when
   `<role>` is not the subagent's own `agent_type` (namespace `great-cto:` / `great_cto-`
   stripped, as `pipeline-dispatcher.mjs` does). A role given as a variable or placeholder is
   refused too: the writer must be called with the role spelled out.
2. **Nobody writes a verdict log except through the writer.** A shell write, truncation,
   move or deletion whose target is inside `.great_cto/verdicts/` (or `$GREAT_CTO_DIR/verdicts/`),
   and any Edit, Write or MultiEdit of a file there, is refused for the orchestrator and
   subagents alike.
3. **The orchestrator is not covered by rule 1.** A call with no `agent_type` is the main
   session, which a human watches, and `/review` legitimately writes its own `review` verdict
   there. Slices 2–3 close the main-session case by attestation rather than refusal.
4. **Off switch:** `GREAT_CTO_DISABLE_VERDICT_GUARD=1`, for deliberate repair of a log by the
   operator. It is an environment variable on the operator's shell, not a flag an agent's
   command can carry.

### Slice 2 — attest the writer (approved, next)

A PostToolUse hook on a subagent's writer call appends
`{ts, agent_id, agent_type, role, line_digest}` to `.great_cto/verdict-attestations.jsonl`,
sealed with the ADR-046 key. `receipt.mjs --verify --require` and the board's merge-readiness
report each approving verdict as **attested** (a subagent of that role wrote it, seen by the
harness) or **self-reported** (no attestation). Self-reported is said, never passed as attested.

### Slice 3 — require attestation where it matters (approved, after slice 2)

For regulated archetypes (`REGULATED_FLOOR`), `gate:ship` requires the code-reviewer,
qa-engineer and security-officer verdicts to be attested or controller-written.

## What this does not do

Every agent still runs as the operator's OS user. Slice 1 is a speed bump with known ways
round it — the writer's path in a variable (`"$LV" qa-engineer PASS`), a `node -e` one-liner
importing `verdict-seal.mjs`. It turns the accidental and the casual cases into refusals at
no cost to an honest agent. Slice 2 is the part that does not depend on parsing a command line.
A lock against a determined agent still needs a human-presence primitive (ADR-046).

## Options and trade-offs

| Option | Stops role impersonation by a subagent | Stops a determined agent | Cost |
|---|---|---|---|
| **Refuse by `agent_type`, then attest (chosen)** | casual: yes (slice 1); detectable: yes (slice 2) | no | one guard, one attestation log |
| Writer reads caller identity from the environment | no — Claude Code does not export `agent_type` to Bash | no | — |
| Only the controller writes verdicts (controlled mode everywhere) | yes | mostly | abandons native mode, which most runs use |
| Leave it, document the limit (ADR-046) | no | no | none |

## Consequences

- A subagent that tries to record another role's verdict, or to edit, truncate or delete a
  verdict log, is refused at the tool layer with the reason. No shipped agent prompt does either.
- An operator repairing a log by hand sets `GREAT_CTO_DISABLE_VERDICT_GUARD=1` for that shell.
  `scripts/migrate-verdicts-to-projects.mjs` is a node script and is not affected.
- Codex has no `agent_type` in its hook payloads, so on Codex only rule 2 applies; the adapter
  runs the edit half of the guard on `apply_patch` like the other edit guards.
- Slice 2 adds one append-only file per project and a seal per attestation; nothing is sent
  anywhere (`docs/PRIVACY.md` unchanged).
- **Easy to undo:** the guard is one entry in `BASH_CHECKS` and one PreToolUse hook; removing
  them restores 3.79.0 behaviour with no data migration.

## Verification

- Unit (`tests/hooks/verdict-authorship-guard.test.mjs`): own role passes, another role is
  refused, a variable role is refused, the main session passes, `bash -c` and `AGENT=` forms are
  seen, every shell write form on a verdict log is refused and every reader passes, Edit/Write
  on a verdict log is refused, the off switch works, and the hook is wired in `plugin.json`,
  `bash-guards.mjs` and the Codex hooks.
