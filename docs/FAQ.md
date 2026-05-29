# FAQ

[← back to README](../README.md)

## Does it work without an internet connection?

Agents themselves run locally as Claude Code subagents. Only Claude API calls reach Anthropic. No code or memory is sent anywhere else.

## Is my source code used to train models?

No. The Claude API is zero-retention by default for paying customers. great_cto adds nothing — your code stays yours.

## What if I already have CI/CD?

great_cto runs *before* CI. Catches issues at architecture, review, and pre-merge. Use both — they're complementary, not competing.

## Cursor / Copilot / Aider support?

All five hosts work via `npx great-cto adapt --platform <host>` — Claude Code, Cursor, OpenAI Codex CLI, Aider, Continue. Same archetype + compliance machinery generates platform-native config (CLAUDE.md, AGENTS.md, .cursorrules, .aider.conf.yml, .continue/rules.md). Daily Canary verifies adapt for all 5 every 06:00 UTC.

## Can I disable hooks if they're getting in the way?

Every hook honors `GREAT_CTO_DISABLE_<NAME>=1` env vars (e.g. `GREAT_CTO_DISABLE_SECRET_SCAN=1`). Per-file opt-out via `// great_cto:allow-secrets` for the secret-scan hook.

## How do you keep token costs down?

Three layers:

1. Haiku-by-default for cheap agents
2. [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) for triage (60–80% savings)
3. `cost-guard` hook warns before expensive prompts

See `/cost` for live spend.

## What happens to my data when I uninstall?

Plugin state lives in `~/.great_cto/` (global decisions) and `.great_cto/` (per-project). Both are plain markdown — `rm -rf` clears everything. No external services to deauthorize.

## Why not auto-pilot? Why "two decisions per feature"?

LLMs are powerful but lose product judgment on ambiguous specs. Keeping a human at `gate:plan` and `gate:ship` catches the 5% of bad calls that account for 95% of cost. See [ADR-015 — Learning loop architecture](architecture/ADR-015-learning-loop-architecture.md).

## Is great_cto for teams?

**No.** great_cto is built for the **one-person engineering org** — solo founders, indie hackers, technical CTOs running everything themselves. If you have 2+ engineers and need shared dashboards, multi-seat auth, or per-developer audit logs, look at Cursor Business or GitHub Copilot Workspace instead. Going multi-user is **not on the roadmap** — solo-CTO is the product.

You can still use great_cto with one cofounder via shared git repo + Beads through Dolt, but there's no shared UI.

## Does it work on Windows?

Daily Canary runs Ubuntu + macOS only. Windows isn't actively tested — file an issue if you hit something specific. WSL2 should work fine.


## Can I read recent decisions / lessons / patterns?

Yes — they're all plain markdown:

```bash
cat ~/.great_cto/decisions.md         # global ADR log across all projects
cat .great_cto/lessons.md             # per-project retros
cat ~/.great_cto/global-patterns/*.md # crystallized incident patterns
```

`/inbox` summarises pending decisions; `/digest` produces a weekly delta.
