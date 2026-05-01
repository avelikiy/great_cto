<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Your next 10 engineers won't be people.**

The Claude Code plugin that replaces the CTO function with specialist agents —
architect, security, QA, devops, and twelve more.<br/>
**Two decisions per feature.** Everything else is automatic.

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![Stars](https://img.shields.io/github/stars/avelikiy/great_cto?style=flat)](https://github.com/avelikiy/great_cto/stargazers)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Website](https://greatcto.systems) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](CHANGELOG.md)

</div>

## What is great_cto?

You don't have a CTO. Or you are the CTO — and you're the bottleneck. Every feature gets stuck behind the same questions: *is the architecture right? did we miss a security issue? will this break in production?*

great_cto is a [Claude Code plugin](https://claude.com/plugins) that runs the full SDLC pipeline as 8 specialist agents — architecture, planning, implementation, 12-angle review, QA, security, deployment — coordinated through a board you actually check. You make two decisions per feature; everything else is automatic.

<p align="center">
  <img src="docs/screenshots/board.png" alt="great_cto board — kanban + agents + live status" width="900" />
</p>
<p align="center">
  <i>The board you actually check — <code>great-cto board</code> at <code>localhost:3141</code>.<br/>
  Inbox · Kanban · Metrics · Memory · Public report.</i>
</p>

## Two decisions per feature

```
You:  /start "add Stripe subscriptions — monthly and annual plans"

great_cto:
  → archetype: web-service | scale: standard | ~45min | security: mandatory
  → ARCH-stripe-subscriptions.md ready  →  DECISION 1: approve architecture?

You: "approved"

  → senior-dev → 12-angle review → qa-engineer → security-officer → devops
  → 412 tests green · 0 highs · canary ready
  → DECISION 2: ship?

You: "ship it"  →  canary 5% → 20% → 100%  →  RELEASE doc written
```

## Features

- **8 specialist agents** — architect, senior-dev, qa-engineer, security-officer, devops, l3-support, project-auditor, performance-engineer. Auto-wired by archetype (commerce → +PCI reviewer; ai-system → +AI specialists).
- **12-angle code review** — performance, security, SQL safety, LLM trust, concurrency, data privacy, API contracts, design system, and more. Each finding rated P0/P1/P2; P0 blocks the gate.
- **4-layer memory** — `PROJECT.md` / `CODEBASE.md` / `brain.md` / cross-project patterns. Synthesizes, doesn't record. **94% MTTR reduction on second occurrence** of any P0 incident.
- **14 archetypes** auto-detected — web-service, ai-system, agent-product, commerce, web3, iot-embedded, regulated, mobile, devtools, browser-extension, library, game, data-platform, infra. Each with its own security tier and required agents.
- **Local board** — `great-cto board` opens kanban + metrics + cost panel + memory browser at `localhost:3141`. Inline gate approval, search across tasks/agents/labels, public report toggle.
- **MCP-native** — Grafana, LLM router (60-80% cost cut on routine triage via Kimi K2), Beads (git-native task tracker). Bring your own MCP servers via `plugin.json`.

## Quick install

```bash
npx great-cto init
```

The CLI scans your repo, picks the right archetype, wires compliance gates automatically. Works on new or existing projects. Restart Claude Code afterwards.

**Requires:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## Three commands you use every day

| Command | What it does |
|---------|--------------|
| `/start "description"` | Run the full SDLC pipeline — detects archetype, generates architecture doc, implements with TDD, reviews, QA, security, deploys |
| `/review` | 12 independent code-review angles on the current branch |
| `/inbox` | Open gates, blocked tasks, P0 incidents, security alerts — everything that needs your decision now |

```bash
great-cto board   # Kanban + metrics + cost panel at localhost:3141
```

Everything else (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) runs automatically or only when you need it. See [`docs/COMMANDS.md`](docs/COMMANDS.md) for the full reference.

## The pipeline scales to the work

```
architect → senior-dev → [/review ×12] → qa-engineer → security-officer → devops → l3-support
```

| Scale | Agents | Time | When |
|-------|--------|------|------|
| `quick` | 1–3 | 5–20min | Hotfix, typo, new endpoint, small feature |
| `standard` | 5 | ~45min | **Default** — standard feature, new service |
| `deep` | 7+ | 90min+ | Cross-cutting, regulated domain, arch migration |

`/start` detects the scale automatically. Override at any time: `"make it deep"`, `"this is just a quick fix"`.

## Cost

```
~$34/month for a typical product team — 20 pipeline runs/month, indicative.
```

| Pipeline | Cost/run | Runs/mo | Total |
|----------|----------|---------|-------|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (new endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

Pay your own Anthropic API tokens. **No per-seat fee. No SaaS lock-in.** Routine triage is auto-routed to Kimi K2 (Sonnet-equivalent at ~5× lower cost) → 60–80% cost reduction on log clustering and noisy stack traces.

## How is this different?

| Tool | What it is | What it doesn't do |
|------|-----------|--------------------|
| **Claude Code / Cursor / Aider** | AI coding assistants | No process structure, archetypes, gates, or compliance |
| **Superpowers / templates** | Skill libraries / template catalogs | Skills only — no agents, no pipeline, no gates |
| **`great_cto`** | **Process layer + 8 core agents + 14 archetypes** | We orchestrate Claude Code, we don't replace it |

The AI is fine. The bottleneck is the human deciding what to ship. great_cto removes the loops where you're the only person who can make the call by encoding the call as a gate.

<details>
<summary><b>Memory & cross-project learning</b></summary>

Four-layer memory system. We synthesize, not record. Total local memory ~10–50 KB per project, indexed at session start.

| Layer | File | What it remembers | Synthesis trigger |
|-------|------|-------------------|-------------------|
| L1 | `.great_cto/PROJECT.md` | Archetype, size, compliance, owners | `/start` |
| L2 | `.great_cto/CODEBASE.md` | God nodes, entry points, public API | `/audit` |
| L3 | `.great_cto/brain.md` | Patterns in use, what failed | `/digest` weekly + every postmortem |
| L4 | `~/.great_cto/global-patterns/GP-*.md` | Detection orders that beat 4-hour investigations | `/crystallize` after P0 |

After a P0 incident, agents extract a structured pattern. `/crystallize` promotes it to a global pattern after your approval. The pattern surfaces in every agent's Step 0 across all your projects. **Verified: 94% MTTR reduction on second occurrence.**

`HANDOFF.md` is auto-written on every context compaction → next session resumes the pipeline from exact state.
</details>

<details>
<summary><b>14 archetypes (auto-detected)</b></summary>

Security gates use a tier model: `baseline` → `standard` → `deep`. Signals emitted during implementation (new payment deps, auth-path changes, PII fields) can upgrade the tier at runtime.

| Archetype | Default tier | Specialist agents auto-loaded |
|-----------|--------------|-------------------------------|
| `web-service` | baseline | — |
| `mobile-app` | baseline | mobile-store-reviewer (on store-deploy) |
| `ai-system` | **standard** | ai-prompt-architect, ai-eval-engineer, ai-security-reviewer |
| `agent-product` | **deep** | + OWASP LLM Top 10 enforcement |
| `commerce` | standard | pci-reviewer |
| `web3` | **deep** | oracle-reviewer (Chainlink/Pyth/MEV) |
| `iot-embedded` | standard | firmware-reviewer |
| `regulated` | **deep** | regulated-reviewer (SOC2/HIPAA/GDPR) |
| `browser-extension` | standard | web-store-reviewer |
| `devtools`, `library`, `game`, `data-platform`, `infra` | baseline | — |

Override at any time: edit `.great_cto/PROJECT.md` `archetype:` field.
</details>

<details>
<summary><b>MCP integrations</b></summary>

Native support for [Model Context Protocol](https://modelcontextprotocol.io/) servers. Optional — pipeline runs without them.

| MCP | Used by | What it enables |
|-----|---------|-----------------|
| Grafana | `l3-support` | LogQL via `query_loki`, `search_alerts`, `query_tempo`, `get_panel`. Pre-P0 alert detection |
| LLM router | `l3-support`, `qa-engineer` | Routes routine triage to Kimi K2. **60–80% LLM cost reduction** on log clustering |
| Beads | all agents | Git-native task tracker. Survives session restarts with dependencies + blockers |
| Your own | any agent | Add to `.claude-plugin/plugin.json` → `mcpServers` |

Specialist sub-agents from [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) (419 agents + 336 commands) are callable via the `Agent` tool from `architect` or `senior-dev`. Install with `/template install <name>`.
</details>

<details>
<summary><b>Fully automatic triggers</b></summary>

| Trigger | What happens |
|---------|--------------|
| Session starts | PROJECT.md + brain.md + CODEBASE.md + HANDOFF.md + global patterns loaded |
| Context compaction | HANDOFF.md written → next session resumes from exact pipeline state |
| P0 or iterations > 3 | Agent writes KE file → run `/crystallize` to promote to global pattern |
| Mon 9:00 | `/digest` — DORA metrics + brain update + pattern library stats |
| Sun 23:00 | `/audit` — dependency + secrets scan |
| Every Bash call | Safety check: blocks `rm -rf`, `git push --force`, `DROP TABLE` |
</details>

<details>
<summary><b>Limitations &amp; non-goals</b></summary>

- **Not a replacement for senior engineers** — codifies process; doesn't make architectural judgement calls without one.
- **Not an IDE** — runs inside Claude Code. If you're not using Claude Code, this isn't for you.
- **Not a CI/CD system** — gates run locally / in-session. You still need GitHub Actions for the actual merge pipeline.
- **Not a secrets manager / observability platform** — integrates with them, doesn't host the data.
- **Not deterministic** — LLM-generated outputs. Every gate verdict should be sanity-checked; `/inbox` surfaces rubber-stamping drift.
- **Not certification-audited** — PCI/HIPAA/SOC2 archetype scaffolds are starting points, not certifications.
</details>

---

## Architecture

```
┌──────────────────────────┐    ┌──────────────────┐
│   Claude Code session    │───→│  great_cto       │
│   (you run /start here)  │    │  pipeline +      │
└──────────────────────────┘    │  8 agents        │
              │                 └────────┬─────────┘
              ↓                          ↓
┌──────────────────────────┐    ┌──────────────────┐
│   .great_cto/            │    │  Beads (sqlite)  │
│   PROJECT · brain ·      │←──→│  task DB         │
│   CODEBASE · HANDOFF     │    └──────────────────┘
└──────────────────────────┘
              │
              ↓
┌──────────────────────────┐
│   great-cto board        │
│   localhost:3141         │
│   (light SPA, zero deps) │
└──────────────────────────┘
```

| Layer | Stack |
|-------|-------|
| Plugin runtime | Claude Code (Anthropic) |
| Agents | Markdown agent specs + skill library |
| Task tracker | [Beads](https://github.com/steveyegge/beads) (sqlite, git-native) |
| Memory | Plain markdown files (no vector store) |
| Board | Vanilla HTML/CSS/JS + Node http server, zero deps |
| Public report | Cloudflare Worker (`/r/<hash>`) — toggleable |

## Author

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder. CTO building AI-native trading and fintech platforms (0→1, 1→N). Specializing in high-load financial systems where technology directly impacts PnL, risk, and unit economics.

**Why great_cto exists.** Same code reviews, same architecture questions, same security audits — across multiple companies, the same loops. Delegating helped. Process helped. But the bottleneck was always the senior engineer making the call. When Claude Code shipped, I started automating my own loops, one agent at a time. great_cto is the result — every rule in this system appeared in response to a real problem in a real production system.

## License

MIT — see [LICENSE](LICENSE).
