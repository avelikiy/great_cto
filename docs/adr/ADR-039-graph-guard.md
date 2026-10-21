# ADR-039: The graph guards a dispatch it can prove wrong — observed first, enforced on evidence

**Date:** 2026-10-20
Status: Accepted — rule 1 shipped in observe mode
Deciders: great_cto maintainers
Tracking: Beads epic great_cto-1puj (graph-2: great_cto-1puj.2)

## Context

`shared/pipeline.toml` is the pipeline graph. On Codex a controller executes it
(`scripts/lib/codex-pipeline.mjs`). On Claude Code it is advice:
`pipeline-dispatcher.mjs` (PostToolUse) tells the orchestrating model what to run
next, and the model decides, reading 37 KB of routing prose in `SKILL.md`.

Measured 2026-10-20 over every local Claude Code transcript (graph-1,
great_cto-1puj.1): 30 sessions with pipeline agents, 1,388 consecutive dispatch
pairs. 11.4% left the graph after accounting for repeats, new chains, rework
loops, graph-allowed skips and parallel siblings. **94 of those 158 were one
pair: product-owner → design-advisor** — the graph and design-advisor's own card
put design *after* architect. In **84 of 93** such cases architect did not run
before the next senior-dev: the architecture stage and `gate:arch` were skipped
for UI features, in 15 sessions across 12 projects. Nothing reported it.

## Options and decision

| Option | Benefit | Cost / risk | Decision |
|---|---|---|---|
| Executing controller on Claude Code (as on Codex) | deterministic path | needs `claude -p` dispatch, which `shared/orchestrator.toml` forbids; skips skill preloads | Rejected |
| Allow-list every dispatch against `next` | strict | the graph has legitimate paths `next` does not express (rework, new chains, auto-attached reviewers); measured, a whole-graph allow-list would refuse many legitimate dispatches | Rejected |
| **Guard the proven hole; observe before enforcing** | closes the measured failure; false positives are counted before anyone is blocked | covers one rule at first; more rules only on new evidence | **Chosen** |

## Contract

A PreToolUse hook on `Agent|Task` (`scripts/hooks/graph-guard.mjs`) runs one rule
per measured hole. Rule 1, **architecture before build after a brief**:

- trigger: dispatch of `design-advisor`, `senior-dev` or `mobile-app-builder`;
- condition: the project's latest success verdict of `product-owner` is newer than
  its latest success verdict of `architect` — a brief exists with no architecture
  after it;
- not triggered when the brief's verdict says `depth=small` or `NO_BUILD`, or when
  an approved `/exception` for gate `graph` is open.

Modes, read from `.great_cto/PROJECT.md` `graph-guard:` (default `observe`):

- `observe` — never blocks. Appends `{ts, rule, agent, would_block: true, why}` to
  `.great_cto/events.jsonl` (kind `graph-guard`) and lets the call through.
- `enforce` — denies with the reason and the command that lifts it.
- `off` — nothing.

Failure to read a verdict log is not a reason to block: the guard records
`unreadable` and allows (it guards a route, not data integrity).

## Delivery

1. `graph-guard.mjs` + rule 1, unit tests per mode, unreadable logs, the
   exception, the small-depth exemption; registered in `plugin.json` and Codex
   hooks where applicable.
2. The graph-1 measurement script committed (`scripts/graph-adherence.mjs`) so the
   number can be re-taken.
3. After 14 days in `observe`: read the `would_block` events. Enforce by default
   only if every sampled one was a real skip; otherwise fix the rule first.

Not in scope: an executing controller on Claude Code; rules for pairs not yet
measured as harmful; changing `pipeline.toml` itself.

## Consequences

- The architecture stage can no longer be skipped silently: at first it is
  recorded, later refused.
- One more hook on every Agent call; it reads two small logs.
- Each new rule needs its own measurement — the guard grows by evidence, not by
  listing every edge.
