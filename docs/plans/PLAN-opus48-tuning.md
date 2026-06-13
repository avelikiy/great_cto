# PLAN: tune great_cto for Claude Opus 4.8 (and the Fable/4.x family)

**Date:** 2026-06-13 · **Status:** IN PROGRESS
**Source:** platform.claude.com — "Prompting Claude Opus 4.8" (behavioral deltas).
**Reader:** the senior dev applying each item; all are prompt/scaffolding changes, no runtime logic.

## Why

Opus 4.8 (and the current Fable/4.x family) changed behaviors that bite great_cto's
agent layer specifically: review harnesses under-report, fewer subagents spawn by
default, effort must be set explicitly, and the model's frontend house-style is wrong
for our domain (regulated dashboards / fintech / healthcare consoles). Each item below
is a measured behavioral delta with a concrete, low-risk fix.

## P1 — Review harness: coverage before filter (HIGHEST ROI) — done first

**Problem (4.8 recall trap):** `/review` (12-angle) details only P0/P1 findings and the
skeptical-triage step explicitly skips P2 ("cost > value"). 4.8 follows that signal
faithfully — it investigates just as deeply but converts fewer investigations into
reported findings, dropping uncertain/low-severity ones. Measured recall falls even
though bug-finding ability rose.

**Fix:** the harness already has the right shape — a finding stage (12 angles) AND a
filter stage (3-round skeptical triage + arbiter). Make the split explicit per the guide:
- Add a global **"Finding discipline — coverage before filter"** block before Angle 1:
  at the finding stage, surface EVERY issue including low-severity and uncertain ones,
  each tagged with severity (P0/P1/P2) AND a confidence (high/med/low). Do not self-filter
  for importance — the triage stage is the filter.
- Angles still detail P0/P1, but now also emit a one-line entry for each P2 / low-confidence
  item (so it reaches triage) instead of collapsing them to a count.
- Note in the triage section that its job is the filter, so coverage upstream is safe.
Files: `commands/review.md`. (The 68 domain reviewers already lack trap language; leave them.)

## P2 — Effort: xhigh for coding/agentic + don't strip CLAUDE_EFFORT + 64k output

**Problem:** guide says `xhigh` is best for coding/agentic, min `high` for intelligence-
sensitive; 4.8 respects effort strictly (under-thinks at low/medium). Today: senior-dev is
`effort: HIGH`; the board agent runner DELETES `CLAUDE_EFFORT` from the child env
(server.mjs ~389) instead of setting it; no max-output budget is set.

**Fix:**
- Board runner: stop stripping `CLAUDE_EFFORT`; set a default (`xhigh`) for spawned coding
  agents, overridable via `GREAT_CTO_AGENT_EFFORT`. Pass a large `--max-output-tokens`-equivalent
  (start 64k) so the agent has room to think + act across tools.
- Bump `senior-dev` and `architect` agent frontmatter `effort: HIGH → XHIGH`.
Files: `packages/board/server.mjs`, `agents/senior-dev.md`, `agents/architect.md`.

## P3 — Subagent fan-out steering

**Problem:** 4.8 spawns fewer subagents by default; our pipeline relies on parallel agents.

**Fix:** add explicit fan-out guidance to the orchestration prompts (the executing-plans /
dispatching-parallel-agents path and the senior-dev/architect prompts): "fan out across
items/files in one turn; do not spawn a subagent for work you can finish directly."
Files: the orchestration command(s) + `agents/architect.md`, `agents/senior-dev.md`.

## P4 — Frontend-aesthetics guard for UI-generating agents

**Problem:** 4.8's default house style (cream/serif/terracotta, editorial) "will feel off
for dashboards, dev tools, fintech, healthcare, enterprise apps" — our entire domain. We
have no design agent; architect drives UI decisions.

**Fix:** ship the guide's `<frontend_aesthetics>` snippet + the rule "specify a concrete
palette, or propose 4 directions before building" into whatever agent emits UI (architect,
and the design-system angle of `/review`). Steer away from the editorial default toward
dense, restrained, accessible regulated-dashboard UI.
Files: `agents/architect.md`, the Design-System angle in `commands/review.md`.

## P5 — Prompt hygiene (folded into the above)

- Literalism: where a rule should apply broadly, state the scope ("every section, not the
  first"). - Verbosity self-calibrates: remove any "summarize every N tool calls" scaffolding.
- Thinking is off unless `adaptive`: no change needed (we don't force thinking).

## Order

P1 ships this session (surgical, single file). P2–P4 as Beads tasks; each is a small,
independently shippable prompt change. Validate P1 against a couple of real diffs before
rolling its pattern into the domain `/…-review` commands if it proves out.
