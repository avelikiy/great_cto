# ADR-006: Harness router — agent identity decoupled from harness binding

**Status:** Accepted (v2.75.0)
**Date:** 2026-06-28
**Source:** adoption of one idea from HKUDS/AgentSpace (its AgentRouter)

## Context

great_cto runs as a plugin **inside** a coding harness — Claude Code today, with
Codex listed as supported. Its agents are portable markdown, but the surrounding
machinery is Claude-Code-specific: hooks (SessionStart / SubagentStart / PreToolUse)
inject context and enforce gates; subagents are spawned via the Task tool. On a
harness without those (Codex, OpenCode), that machinery silently does nothing, and
nothing in the codebase knows it.

AgentSpace's **AgentRouter** frames this well: an agent's *identity and instructions*
are stable; only the *runtime/harness binding* changes, and a normalization layer
reconciles harness differences (events, sessions, tool approval).

## Decision

Adopt the **idea**, not the stack. Introduce `scripts/lib/harness-router.mjs`:

1. A **capability registry** (`HARNESSES`) — for each harness (claude-code, codex,
   opencode): cli name, env signals, and capability flags (hooks, mcp, subagents,
   slashCommands, toolApproval, streamJson).
2. **`detectHarness(env)`** — which harness we're under (env signals;
   `GREAT_CTO_HARNESS` overrides), falling back to `unknown`.
3. **`hasCapability(id, cap)`** — degrade-safe (unknown harness/cap → false), so
   great_cto code can branch instead of assuming Claude Code.

This is the **first slice**: detection + a single source of truth great_cto can
reason about (e.g. "no hooks here → agents must self-load context instead of relying
on SessionStart injection").

## Scope / deferred

- **Deferred:** full cross-harness EXECUTION — launching codex/opencode CLIs and
  normalizing their stream-json events / sessions / tool-approval into one stream
  (AgentRouter's heavy part). That's a large effort and only pays off once we
  actually run agents off Claude Code.
- **Not adopted:** AgentSpace's monorepo / Postgres / daemon — contrary to
  great_cto's lightweight, markdown-in-git design.

## Consequences

- **+** One place to ask "what can this harness do" — lets hooks/agents degrade
  gracefully rather than silently no-op off Claude Code.
- **+** Cheap, testable, zero new deps.
- **−** Capability flags are best-effort and must be kept current as harnesses
  evolve; they are conservative (unknown → false) to avoid over-promising.
