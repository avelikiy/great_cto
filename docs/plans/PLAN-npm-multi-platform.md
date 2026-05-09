# PLAN: NPM expansion + multi-platform support

**Status:** in progress · **Author:** great_cto · **Created:** 2026-05-08
**Target version:** v2.4.0 · **Estimated LLM-agent time:** ~3h · **Human-team equivalent:** ~3 weeks

## Problem

great_cto today is dual-distributed:
- **Claude Code plugin** — orchestrates 34 agents inside Claude sessions
- **npm package `great-cto`** — thin CLI wrapper (`init`, `scan`, `board`, `list-rules`)

The plugin is locked to Claude Code. The npm package barely uses its strategic
position as a platform-neutral binary. Three opportunities are unaddressed:

1. **CI integration** — devs can't easily run scan/budget-check in GitHub Actions
   without re-implementing wrappers
2. **Cross-platform** — Codex CLI (OpenAI), Cursor, Aider, Continue all have
   growing user bases (Cursor alone ~4M MAU). They support `AGENTS.md` and MCP
   but get nothing from great_cto today
3. **Webhook integration** — board is a one-way local dashboard; can't react to
   GitHub PRs, Sentry alerts, Stripe events

## Strategic shift

Position the **npm package as the universal adapter** — works in Claude Code,
Codex, Cursor, Aider, Continue, plain CI/cron. The Claude Code plugin becomes
**one of N consumers** of the npm package, not the only one.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  npm: great-cto (universal CLI + MCP server + adapters)     │
├─────────────────────────────────────────────────────────────┤
│  Subcommands:                                               │
│   • init / scan / list-rules / board   (existing)           │
│   • ci          one-shot CI gate                            │
│   • mcp         expose tools via MCP (stdio | sse)          │
│   • adapt       platform config generator                   │
│   • serve       webhook receiver + outbound notifier        │
│   • report      shareable HTML/JSON artifacts               │
├─────────────────────────────────────────────────────────────┤
│  Consumed by:                                               │
│   • Claude Code plugin    (existing — full pipeline)        │
│   • Codex CLI             (via AGENTS.md + MCP)             │
│   • Cursor                (via .cursorrules + MCP)          │
│   • Aider                 (via .aider.conf.yml + MCP)       │
│   • Continue              (via MCP)                         │
│   • GitHub Actions        (via `great-cto ci`)              │
│   • cron / k8s            (via `great-cto serve`)           │
└─────────────────────────────────────────────────────────────┘
```

## Deliverables — v2.4.0 scope

### 1. `great-cto ci` — single-command CI gate _(S, high impact)_

Bundles existing checks for CI consumption:
- Runs scan with `--severity high --fail-on critical`
- Validates archetype detection on the repo
- Outputs **GitHub Actions annotations** (`::error file=...,line=N::message`)
  so findings appear inline on PR diffs
- Optionally emits **JUnit XML** for test reporters
- Optionally emits **SARIF** for GitHub Security tab
- Exit codes: `0` clean, `1` findings, `2` scan error

**API:**
```bash
great-cto ci [path]
  --severity <level>      gate threshold (default: high)
  --fail-on <severity>    exit 1 above this (default: critical)
  --junit <file>          emit JUnit XML
  --sarif <file>          emit SARIF
  --annotations           emit GitHub Actions ::error:: lines (auto if $GITHUB_ACTIONS)
  --no-budget             skip budget check
  --no-archetype          skip archetype validation
```

### 2. `great-cto mcp` — MCP server _(M, strategic)_

Exposes scan / list-rules / archetype-detect / cost-estimate / query-decisions
as MCP tools so any MCP-compatible host (Claude Desktop, Cursor, Continue,
Codex via MCP) can call them.

**API:**
```bash
great-cto mcp                     # stdio mode (for Claude Desktop / Cursor)
great-cto mcp --sse --port 8765   # remote / multi-client mode
great-cto mcp --tools scan,archetype-detect   # subset
```

**Tools exposed:**
| Tool | Args | Returns |
|---|---|---|
| `scan` | path, severity, scanner | findings array |
| `list_rules` | (none) | rules catalogue |
| `detect_archetype` | path | archetype + confidence + compliance |
| `estimate_cost` | task description, archetype | LLM/human estimates |
| `query_decisions` | query string | matching ADRs from ~/.great_cto/decisions.md |

### 3. `great-cto adapt` — platform config generator _(S, strategic unlock)_

Writes platform-native config files derived from the same source of truth.
Each file maps the great_cto pipeline (decisions, gates, agents) into the
platform's native conventions.

**API:**
```bash
great-cto adapt --platform claude    # writes CLAUDE.md
great-cto adapt --platform codex     # writes AGENTS.md (codex.com convention)
great-cto adapt --platform cursor    # writes .cursorrules + .cursor/rules/*.mdc
great-cto adapt --platform aider     # writes .aider.conf.yml + CONVENTIONS.md
great-cto adapt --platform all       # writes everything
```

All variants share a common AGENTS.md core (it's the de-facto cross-platform
standard) and append platform-specific extensions.

### 4. `great-cto serve` — webhook receiver _(M scaffolded only)_

Long-running daemon that receives webhooks and triggers great_cto actions.
v2.4.0 ships **scaffolding + GitHub PR webhook** as proof of concept;
Sentry / Slack / Stripe land in v2.5.0.

**API:**
```bash
great-cto serve --port 3142
great-cto webhook add github --secret <hmac-secret>
great-cto webhook list
great-cto webhook test github fixtures/pr-opened.json
```

**v2.4.0 webhook handlers:**
- `POST /webhook/github` — `pull_request.opened` → run scan, post comment with findings
- `POST /webhook/generic` — generic JSON receiver, persists to `~/.great_cto/webhook-events.log`

Out of scope for v2.4.0 (deferred):
- HMAC signature verification (mandatory for v2.5.0)
- Retry / DLQ
- Outgoing webhook notifications (Slack, Discord)

### 5. Tests + docs _(S)_

- Unit tests for ci / mcp / adapt
- E2E test: `great-cto ci ./fixtures/vulnerable-app.ts` should exit 1 + write SARIF
- Section in README: "Use with Codex / Cursor / Aider"
- New file: `docs/multi-platform.md` — one-pager per platform with copy-paste setup

## Non-goals (v2.4.0)

- Multi-tenant board / team SaaS — separate architectural decision needed
- Plugin marketplace for custom agents — v2.5.0+
- Outbound notifications (Slack/Discord/email) — webhook foundation first
- Full Cursor extension (vsix) — only `.cursorrules` generator for now

## Implementation order

1. **`adapt`** first — unlocks "great_cto works in Codex/Cursor/Aider" claim
2. **`ci`** — easy, immediate user value, doesn't touch state
3. **`mcp`** server — opens cross-platform door programmatically
4. **`serve`** + GitHub webhook — proof of concept for product evolution
5. Tests + docs — gate before release

## Success metrics

- v2.4.0 ships within session
- 41/41 existing pipeline tests still pass
- New e2e: `great-cto ci ./fixture` succeeds in <5s
- README section demonstrates 3-line setup for each of: Claude Code, Codex,
  Cursor, Aider
- MCP server passes `mcp-inspector` smoke test
