# Privacy

## TL;DR

**great_cto collects zero telemetry.** No usage events, no install pings, no
anonymous IDs, no aggregate counters. Nothing leaves your machine.

## What runs locally only

| Thing | Where it lives | What touches the network |
|---|---|---|
| Your code, agents, gates, verdicts | `.great_cto/` in your repo | Nothing — these never leave |
| Beads tasks | `.beads/` in your repo | Nothing |
| `~/.great_cto/decisions.md`, `lessons.md`, `verdicts/`, patterns | Your home dir | Nothing |
| Board UI | `localhost:3141` on your machine | Nothing leaves your network |
| `~/.great_cto/notifications.json` | Your home dir | Only used when an alert fires (see below) |

## What does touch the network

great_cto calls external services only when you explicitly ask for one:

- **LLM API calls** — only when you run an agent (`/start`, `/audit`, etc.).
  Sent to your configured provider (Anthropic, OpenRouter, etc.) under
  **your** API key and **your** ToS. great_cto adds nothing.
- **Email alerts (opt-in)** — if you verify an email in the board's
  **Notifications** tab, alerts you toggled on are routed through our
  Cloudflare Worker at `greatcto.systems/notify` → Resend → your inbox.
  The Worker stores your email + verification timestamp in Cloudflare KV.
  Nothing else is sent.
- **Plugin updates** — Claude Code itself pulls plugin source from GitHub.
  great_cto doesn't intermediate this.
- **Beads / git** — your normal workflow tools, unchanged.

## Why no telemetry

We deliberately don't collect usage data because:

1. The audience is solo CTOs / engineers running production-critical work.
   Telemetry from `npx great-cto init` running on private repos is a leak
   surface we shouldn't create.
2. Open-source self-hostable tools earn trust by not phoning home.
3. Pattern-promotion (`/crystallize`) is **local** — patterns get promoted
   from per-project `lessons.md` to `~/.great_cto/decisions.md` on your own
   machine. No cross-user data exchange is required.

## What this means in practice

- Running `great-cto init` on a private repo: nothing about that repo is
  transmitted anywhere (not to greatcto.systems, not to GitHub, not to any
  analytics service).
- Running `/start "build a billing endpoint"`: only your LLM provider sees
  the prompt, per your contract with them.
- Board running on `localhost:3141`: visible only to you. No outbound calls
  except those listed above.

## Want to verify yourself

Read the source:
- CLI: `packages/cli/src/` — no `fetch()` to any greatcto.systems endpoint
- Board: `packages/board/server.mjs` — only outbound is to
  `greatcto.systems/notify` for opt-in alerts you enabled

## License compatibility

great_cto is MIT-licensed. There's no clause anywhere that grants us
permission to collect data from your installation, because we don't.

---

_Last reviewed: 2026-05-17 · removed all telemetry collection in v2.9.2_
