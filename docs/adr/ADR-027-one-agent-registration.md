# ADR-027 — Register each agent and command once

**Status:** Accepted (option D), amended by option E on 2026-09-25 · **Date:** 2026-09-21 · **Decider:** CTO
**Relates to:** `great_cto-hfr0`, [PLAN-2026-09-21-real-usage](../plans/PLAN-2026-09-21-real-usage.md)

## Context

Every great_cto agent and command reaches a session twice:

1. **The plugin** registers `agents/*.md` and `commands/*.md` under its namespace —
   `great-cto:senior-dev`, `great-cto:start`.
2. **SessionStart** runs `scripts/lib/sync-managed.mjs`, which copies the same files into
   `~/.claude/agents/great_cto-<name>.md` and `~/.claude/commands/`, where they register
   without a prefix — `senior-dev`, `start`.

Measured on 2026-09-21:

| | |
|---|---|
| Description tokens loaded per session by the duplicates | ~7k of ~18k (agents ~4.8k, commands ~1.8k) |
| Dispatches by unprefixed name, session logs 30.06–21.09 | **1,147** |
| Dispatches by `great-cto:` name | **52** (4%) |
| Hooks that route by agent name | normalise both spellings (`pipeline-dispatcher.normalizeAgent`, `subagent-stop-completion`) |

Since commit `3ccb70c9` the two copies are no longer the same text: the installed copy
carries the `agents/_shared/` fragments its pointers name, and the plugin copy still
carries only the pointers — which resolve to nothing in a user's project. The plugin copy
is now the weaker one, and it is the one the model picks 4% of the time.

## Options

| | What changes | Tokens saved | Risk |
|---|---|---|---|
| **A. Keep both** | nothing | 0 | the model can pick the copy without the shared contracts |
| **B. Plugin registers none** | `plugin.json`: `"agents": []`, `"commands": []`; the synced copies are the only registration | ~7k per session | if Claude Code builds its agent list before SessionStart runs, a user's **first** session after install has no great_cto agents |
| **C. Plugin only, full text** | generate inlined copies into a committed directory, point `plugin.json` at it, stop syncing into `~/.claude` | ~7k per session | every dispatch name becomes `great-cto:<name>`: prompts, SKILL routing, hooks and 96% of observed dispatches use the short name |
| **D. Keep both, full text** | plugin points at generated inlined copies too | 0 | none new; fixes correctness only |

## Decision — D, because B was measured and refused

Measured 2026-09-21 with a signed-in CLI. A SessionStart hook wrote an agent file into
`~/.claude/agents`; the same session was asked whether that agent was available:

| | |
|---|---|
| probe agent, written during this session's SessionStart | **not available** (`probe=NO`) |
| control (`senior-dev`, already installed) | available (`control=YES`) |
| the same probe agent in the next session | available (`probe=YES`) |

So the synced copies reach a session only from the **next** one. Under B, a user's first
session after installing would have no great_cto agents at all. Seven thousand tokens are
not worth that, so B is refused and **D** ships: both registrations carry the same full
text, no rename, no saving.

C stays rejected: it trades 7k tokens for renaming the dispatch surface that 96% of real
dispatches use. B can be revisited only if the plugin gains a way to register the agents it
installs within the same session.

## Consequences of D

- The duplicate registration stays; a session still loads ~18k tokens of descriptions.
- Both copies carry the same text — the one the evals measure — so the 4% of dispatches
  that use `great-cto:<name>` no longer get an agent without its shared contracts.
- The plugin registers generated files, so a generator and a freshness check join the build.
- The Codex host is unaffected: it installs skills and the MCP server, not these files.

## Also found — fixed

The SessionStart hook ended with a cache cleanup that deleted every cached plugin version
but the newest three (`rm -rf`) with no live-session check — the check
`install-local --prune` got after it deleted a version under six open sessions on
2026-09-11. It now calls `prune-versions.mjs --keep-newest 3`: the newest three stay as
before, a version a live session runs from stays however old, and nothing is removed when
the live sessions cannot be read (`great_cto-agad`).

## Measurement status

The first-session probe (a SessionStart hook writes an agent file; `claude -p` is asked
whether that agent is listed) ran on 2026-09-21: the hook wrote the file, and the CLI
stopped at `OAuth session expired and could not be refreshed` before any answer. The
measurement needs a signed-in CLI; until then the recommendation stands unmeasured.


## Amendment 2026-09-25 — option E: both registrations, one full description

D kept both registrations with the same full text, so every session listed each agent's
description twice. E keeps both registrations and both full prompts, and shortens only what
the plugin copy **lists**: `agents-full/*.md` carries the source's first sentence (at most 90
characters; a first sentence under 40 characters takes the next one too). The installed copy
— `senior-dev`, 96% of dispatches — keeps the full description the model routes by.

| | D | E |
|---|---|---|
| Registrations | both | both |
| Prompt of either copy | full, shared fragments inlined | unchanged |
| Plugin copy's listed description | full (19,349 chars across 70 agents) | one line (4,989 chars) |
| First-turn prompt, main session (2 runs each, `--plugin-dir`, same machine) | 108.0k / 109.8k | 102.9k / 105.7k — **about −4.6k tokens** |
| A user's first session (only the plugin copy exists) | full descriptions | one-line descriptions; routing by description slightly weaker, for that one session |

Commands are left as D: a shortened description on `/start` would show in the slash menu a
user reads. Decided by the CTO on 2026-09-25.
