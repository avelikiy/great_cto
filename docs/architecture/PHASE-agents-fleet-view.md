# Phase — Agents fleet view (board /agents)

**Status:** Draft (2026-05-15)
**Author:** o.velikiy
**Surface:** `web` (board UI, served by `packages/board/server.mjs` at `/agents` tab)

## Problem

The current `/agents` view ([packages/board/public/index.html:1865](../../packages/board/public/index.html#L1865)) shows three blocks: "Agent cost estimate", "Agent utilization", and a flat "Installed specialist agents" grid. It tells you what's installed and roughly what each agent has cost, but it does not answer the questions a solo CTO actually has:

1. **Which agents are doing real work, and which are dead weight?** — current shows run count but not last verdict, last failure mode, success rate, or whether the agent has been called by any project in the last 30 days.
2. **Is any agent costing more than it saves?** — agent cost rows show `$0.0023` per agent but no comparison against the human-equivalent baseline they replaced; no "savings_x per agent" call-out.
3. **Where should I prune the fleet?** — there are 49 agents installed. A solo CTO probably uses 8–12. The rest are noise that adds context-switching for the orchestrator. We need a "Retire candidate" surface.
4. **When an agent fails, where does that signal land?** — failure mode (BLOCKED / FAIL verdict) is currently buried in the verdicts log. The agent's row in the fleet view should reflect "3 BLOCKED in last 7d — needs prompt tune-up".
5. **How do I find the right agent for a new task?** — agents are listed alphabetically with no faceting by `applies_to` archetype, by domain (security · QA · arch · ops · domain-reviewer), or by recent activity.

## Goal

A web view that turns the 49-agent fleet into a **manageable, auditable team** — same way `great_cto board` (the Kanban tab) turned 100+ tasks into a manageable backlog.

## Non-goals

- Editing agent prompts in-browser (out of scope; agents are file-based, edited externally)
- Spawning agent runs from the UI (that's `bd`/CLI territory)
- Agent marketplace / discovery (separate feature, deferred)

## Inputs available (from server.mjs)

The board server already exposes most of the data via existing endpoints:

- `getCanonicalAgents()` → 49 installed agent slugs (`~/.claude/agents/great_cto-*.md`)
- `m.agents_cost` → `[{ agent, llm_usd, human_usd, time_min, tasks_total, tasks_done, real_llm_usd?, cost_source }]`
- `m.agents` → `{ <slug>: run_count }` (verdict-based, project-scoped, canonical-filtered)
- `m.legacy_agent_runs` + `m.legacy_agent_count` → non-canonical agents (legacy log files)
- `readVerdicts()` → `[{ ts, agent, verdict, cost_usd, raw }]` last N verdicts globally
- `m.recent_done` → last 10 done tasks (per project)

Missing endpoints (must be added):
- `GET /api/agents/{slug}` — last 30d verdict history, success rate, failure modes (regex over `raw`), per-project breakdown
- `GET /api/agents/{slug}/runs?limit=20` — recent run timeline
- `POST /api/agents/{slug}/retire` — soft-retire (move agent file to a `retired/` dir; UI reflects "retired" state)

## Routes / screens

1. **`/agents` (default tab)** — fleet overview: faceted grid with sort + filter
2. **`/agents/:slug` (drill-in)** — agent profile: stats, recent runs, failure modes, retire/promote actions
3. **`/agents?filter=retired`** — view retired agents, restore button
4. **Empty state** — no verdicts logged yet (fresh install)

## Brand / stack

The board UI uses a dark-mode, monochrome aesthetic (see existing CSS in `packages/board/public/index.html`). Stack:
- Vanilla JS + CSS (no framework)
- CSS custom properties for tokens (`--bg`, `--text2`, `--accent`, etc. — defined inline)
- System fonts (no web font load — fast cold start matters)
- Single HTML file; no router (tabs switch via `switchTab()`)

The design must fit inside this existing aesthetic — do not propose a framework migration.

## Constraints

- **Must work at 1024px width minimum** (board is desktop-first; minimal mobile support).
- **Server-Sent Events refresh** every 5s — UI must not flicker when data updates.
- **No new dependencies** unless absolutely necessary (current package only ships node stdlib + better-sqlite3 + few small deps).
- **Accessibility:** the board is a developer tool but should still pass WCAG 2.2 AA (keyboard navigation, screen reader, focus indicators). One blind contributor opened an issue last quarter.

## What "done" looks like

A solo CTO opens `/agents` and within 30 seconds can answer:
- which 5 agents are pulling the most weight (by tasks done × savings_x)
- which 3 agents have failed most often this week (and what the failure pattern is)
- which 10+ agents have never run and are candidates to retire

A redesigned `/agents/:slug` profile shows, for one agent, everything needed to decide "keep, tune, or retire" without leaving the page.
