# Architecture

[← back to README](../README.md)

```
┌──────────────────────────┐    ┌──────────────────┐
│   Claude Code session    │───→│  great_cto       │
│   (you run /start here)  │    │  pipeline +      │
└──────────────────────────┘    │  34 agents       │
              │                 └────────┬─────────┘
              ↓                          ↓
┌──────────────────────────┐    ┌──────────────────┐
│   .great_cto/            │    │  Beads (dolt)    │
│   PROJECT · lessons ·    │←──→│  task DB         │
│   decisions · verdicts   │    └──────────────────┘
└──────────────────────────┘
              │
              ↓
┌──────────────────────────┐
│   great-cto board        │
│   localhost:3141         │
│   (vanilla HTML, 0 deps) │
└──────────────────────────┘
```

## Stack

| Layer | What |
|---|---|
| Plugin runtime | Claude Code (Anthropic) |
| Agents | Markdown agent specs + skill library |
| Task tracker | [Beads](https://github.com/steveyegge/beads) (dolt, git-native) |
| Memory | Plain markdown files (no vector store, no embedding DB) |
| Board | Vanilla HTML/CSS/JS + Node http server, zero deps |
| Public report | Cloudflare Worker (`/r/<hash>`) — toggleable |
| Email alerts | Cloudflare Worker (`/notify`) + Resend, opt-in via board UI |
| Telemetry | **none** — see [PRIVACY.md](PRIVACY.md) |

## Memory layers

| Layer | File | What it remembers | Synthesis trigger |
|---|---|---|---|
| L1 | `.great_cto/PROJECT.md` | Archetype, size, compliance, owners | `/start` |
| L2 | `.great_cto/lessons.md` | Per-project retros, what failed, what worked | `/digest` weekly + every postmortem |
| L3 | `~/.great_cto/decisions.md` | Every gate approve/reject across all projects (append-only ADR log) | Auto on every gate action |

Total ~10–50 KB per project, indexed at session start. We synthesize, not record.

## Data flow

1. **Session start** — SessionStart hook reads `PROJECT.md`, last 30 days of `lessons.md`, recent verdicts from `verdicts/*.log`.
2. **Pipeline run** — agents write `verdicts/<agent>.log` lines via `scripts/log-verdict.sh` (canonical format with `cost=$X` tag).
3. **Gate decision** — `/inbox` shows pending gates; approve/reject writes to `decisions.md` AND broadcasts via SSE to live board.
4. **Pattern crystallization** — after a P0 incident or 3+ iterations on same problem, agent writes a structured pattern; `/crystallize` promotes high-impact ones to `~/.great_cto/global-patterns/` for cross-project reuse.

## See also

- [docs/MCP.md](MCP.md) — MCP server + client integrations
- [docs/BOARD-API.md](BOARD-API.md) — board JSON API surface
- [packages/board/server.mjs](../packages/board/server.mjs) — board server source (every route is a top-level `if (pathname === ...)` block)
- [.claude-plugin/plugin.json](../.claude-plugin/plugin.json) — plugin manifest with hook definitions
