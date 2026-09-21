# ADR-027 — Register each agent and command once

**Status:** Proposed · **Date:** 2026-09-21 · **Decider:** CTO
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

## Recommendation

**B**, with one measurement first: install into a fresh `HOME`, start one session, and
record whether the unprefixed agents are listed in that first session.

- If they are → ship B.
- If they are not → ship **D** now (correct text in both copies, no rename) and revisit B
  once first-session behaviour is known.

C is rejected: it trades 7k tokens for renaming the dispatch surface that 96% of real
dispatches use.

## Consequences of B

- Every session loads ~7k fewer tokens of descriptions.
- There is one text per agent, and it is the one the evals measure.
- `sync-managed` becomes load-bearing: if it cannot run, there are no great_cto agents,
  rather than a weaker duplicate. Its failure already prints a line at session start;
  that line must stay.
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
