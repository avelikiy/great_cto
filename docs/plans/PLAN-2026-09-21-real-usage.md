# Plan — how often each agent really runs, and a UI rule against clutter

Status: done — two follow-ups filed · Epic: `great_cto-5tql` · Started 2026-09-21

## Where these come from

| Source | What it is | Taken |
|---|---|---|
| [migsilva89/loadout](https://github.com/migsilva89/loadout) (MIT) | macOS app that inventories what coding assistants load, with usage read from their session logs | usage from session logs; "unsupported" instead of a zero that reads as disuse |
| [AI UI design: 8 ways to make vibe-coded apps look better](https://aistudio.google.com/learn/ai-ui-design-google-ai-studio) (Google AI Studio, 2026-09-16) | tips for polishing generated interfaces | the clutter tell (chips and badges with no meaning); no placeholder or broken stock images |

Not taken: loadout's app, its cross-assistant skill sharing, and its editor (a different
product); AI Studio's Edit tool and image model (tied to that tool). Style extraction from a
screenshot is already `anydesign` inside design-advisor.

## Why

The board's Fleet screen marks an agent "never observed" when **no verdict line names it**.
A verdict line is written by the agent at the end of a run, so an agent that ran and did
not write one is invisible, and nothing says how often an agent is actually dispatched.

Counting `Agent` tool calls in the session logs of this machine (2026-09-21, 125 retained
transcripts): **26 of 70 agents were dispatched at least once, 44 never.** senior-dev 760,
product-owner 151, design-advisor 139, code-reviewer 89; nearly every domain reviewer zero.
Claude Code keeps about 30 days of transcripts and this is one machine — a window, not the
world — but it is the first measurement of what the fleet does rather than what it
contains. Every session also loads the descriptions of all agents, skills and commands —
roughly 11k tokens — whether or not they run.

## Items

| # | Item | Beads |
|---|---|---|
| U1 | `scripts/lib/agent-usage.mjs`: dispatches per agent from `~/.claude/projects/*/*.jsonl` — count, last run, distinct projects; states `counted` / `unavailable` | `great_cto-5tql.1` |
| U2 | Board Fleet: dispatches, last run and projects beside the verdict evidence | `great_cto-5tql.2` |
| U3 | Measure the per-session description cost, as the input to a per-project loadout plan | `great_cto-5tql.3` |
| D1 | design-advisor + anti-patterns: meaningless chips/badges and placeholder images are defects | `great_cto-5tql.4` |

### U1 — rules

- Read-only. The session logs belong to Claude Code; nothing is written next to them.
- Counts only `Agent` tool calls whose `subagent_type` names a great_cto agent (with or
  without the `great-cto:` plugin prefix).
- A missing or unreadable logs directory is `unavailable`, never zero. Zero is reported
  only when logs were read and named no dispatch of that agent.
- Project identity is a count of distinct `cwd` values; paths are never returned, so the
  board cannot print a home directory.
- The window is stated: the oldest and newest transcript timestamps that were read.

### Dropped after inspection

- *Backup before write in `install-local --prune`.* It removes only cached plugin versions,
  which a reinstall recreates, and it already keeps any version a live session names. A
  backup there protects nothing.

## What shipped

- **U1** `scripts/lib/agent-usage.mjs` + `usageSnapshot()`; 11 tests. First pass over this
  machine's 4.1 GB of logs: 47 s; from the index in `~/.great_cto/usage-index.json`: 2.4 s.
  `node scripts/lib/agent-usage.mjs` prints the table.
- **U2** `/api/agent-usage` and the Fleet screen: a summary line (dispatched N of 70 ·
  window), and per row "dispatched N× · no verdict" or "never dispatched" where it used
  to say "never observed". The *Never observed* view now means no verdict **and** no
  dispatch — 44 agents on this machine. Checked live on the board: legal-reviewer showed
  "dispatched 4× · no verdict", previously "never observed".
- **D1** design-advisor's component inventory and `anti-patterns` U-1 / U-2.

## U3 — what a session loads (measured 2026-09-21)

| | approx. tokens |
|---|---|
| 70 agent descriptions, registered **twice** (plugin `great-cto:<name>` and the unprefixed copy SessionStart syncs into `~/.claude/agents`) | ~9.7k |
| 44 command descriptions, also twice | ~3.6k |
| 41 skill descriptions | ~4.4k |
| **Total** | **~18k per session, ~7k of it duplicates** |

The unprefixed copy is deliberate — the pipeline dispatches agents by the short name — so
removing the duplicate changes dispatch names and needs an ADR. Separately, the 14 files in
`agents/_shared/` are registered by the plugin as agents (`great-cto:_shared:…`): fragments,
not agents, listed in every session. Both are follow-ups, not part of this plan.
