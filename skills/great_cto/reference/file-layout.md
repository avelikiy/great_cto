# File Layout Invariant (agent-context vs runtime-state)

> Read when placing a new file under `.great_cto/` or `docs/`.

Two kinds of files live under `.great_cto/`. Do not mix them:

| Kind | Purpose | Examples | Written by |
|---|---|---|---|
| **Agent-context** | Human-curated or agent-curated markdown the pipeline reads on every relevant turn. Durable, committed. | `PROJECT.md`, `brain.md`, `CODEBASE.md`, `HANDOFF.md`, `tasks.md` (fallback), `retrospectives/*.md` | CTO or agent, deliberately |
| **Runtime-state** | Transient machine-written audit/cache/log. Append-only or rebuildable. Gitignored. | `verdicts/*.log`, `agent-writes.log`, `triage-log.jsonl`, `permission-denied.log`, `cache/*`, `index-snapshots/*`, `beads-ok`, `deps-ok` | Hooks or agents as a side effect |

**Rule:** if a file is written by a hook or as a side effect of an agent run (logs, caches, ack-markers), it belongs in runtime-state and must be gitignored. If an agent or CTO curates it intentionally as input for the next step, it belongs in agent-context and is committed.

When in doubt: *would I want git blame on this line?* Yes → agent-context. No → runtime-state.

**Immutable at runtime:** `agents/*.md` and `commands/*.md` must never be mutated by a hook or another agent. Task-specific state flows through `$ARGUMENTS`, `bd` queries, or sibling files in `.great_cto/`. Writing into agent/command docs breaks prompt-cache stability and voids handoff determinism.
