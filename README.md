<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Stop being the only person who can ship.**

You're the CTO. You're also the bottleneck. **GreatCTO is 29 specialist agents** that handle architecture, review, QA, security, and deploy — while you make **two decisions per feature**.

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![Stars](https://img.shields.io/github/stars/avelikiy/great_cto?style=flat)](https://github.com/avelikiy/great_cto/stargazers)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Website](https://greatcto.systems) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](CHANGELOG.md)

</div>

## What is great_cto?

great_cto is a [Claude Code plugin](https://claude.com/plugins) that runs the full SDLC pipeline as **29 specialist agents** — architect, planning, implementation, 12-angle review, QA, security, deployment, support — coordinated through a board you actually check. You make two decisions per feature; everything else is automatic.

| Layer | What it does |
|-------|--------------|
| **29 specialist agents** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer |
| **22 archetypes** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated |
| **Auto-detected** | Scans `package.json`, `pyproject.toml`, `Cargo.toml`, README, code structure → picks archetype + compliance gates in 2 sec. Anthropic Haiku second-opinion (~$0.001) when confidence is low. |
| **Compliance** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — auto-attached per archetype. |
| **Memory** | 4 layers — `PROJECT.md` (archetype) · `lessons.md` (per-project retros) · `~/.great_cto/decisions.md` (every gate approval, queryable across projects) · `verdicts/` (every agent verdict). |
| **Board** | `great-cto board` opens 6 views at `localhost:3141` — Inbox · Kanban · Metrics · Agents · Memory · Public report. Live SSE updates. |

<p align="center">
  <img src="docs/screenshots/board.png" alt="great_cto kanban — 5 columns, inline gate approval, live SSE" width="900" />
  <br/>
  <em>Kanban — 5 columns, inline status edit, live SSE updates from <code>bd</code> CLI.</em>
</p>

## Two decisions per feature

```
You:  /start "add Stripe subscriptions — monthly and annual plans"

great_cto:
  → archetype: commerce | scale: standard | ~45min
  → compliance: pci-dss + gdpr (auto-attached)
  → ARCH-stripe-subscriptions.md ready  →  DECISION 1: approve architecture?

You: "approved"

  → senior-dev → 12-angle review → qa-engineer → security-officer → devops
  → 412 tests green · 0 highs · canary ready
  → DECISION 2: ship?

You: "ship it"  →  canary 5% → 20% → 100%  →  RELEASE doc written
```

## Quick install

```bash
npx great-cto init
```

The CLI scans your repo, picks the right archetype, wires compliance gates automatically. Works on new or existing projects. Restart Claude Code afterwards.

**Requires:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## The board you'll actually check

```bash
great-cto board   # localhost:3141
```

Six views, real screenshots — see [greatcto.systems#board](https://greatcto.systems#board) for live shots.

| View | What's there |
|------|--------------|
| **Inbox** | Resume card (pick up where you left off) · Pending decisions · P0 open · Blocked · Stale (in-progress > 48h) |
| **Kanban** | 5 columns · inline gate approve/reject · filter bar (agent / priority / label) · ⌘K search · `j`/`k` nav |
| **Metrics** | Hero cards (velocity, cost, MTTR) · 30-day LLM spend chart with budget alerts |
| **Agents** | Per-agent time, LLM cost, human equivalent at $150/hr · activity feed (last 20 verdicts) |
| **Memory** | 4-layer browser: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Public report** | Toggle on → unguessable URL with shipped tasks, AI-vs-human cost comparison. No code, no credentials. |

Multi-project switcher — one board, every client. Cross-project decisions log finds *"have we solved this before?"* across all your repos.

## Three commands you use every day

| Command | What it does |
|---------|--------------|
| `/start "description"` | Run the full SDLC pipeline — detects archetype, generates architecture doc, implements with TDD, reviews, QA, security, deploys |
| `/review` | 12 independent code-review angles on the current branch |
| `/inbox` | Open gates, blocked tasks, P0 incidents, security alerts — everything that needs your decision now |

Everything else (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) runs automatically or only when you need it. See [`docs/COMMANDS.md`](docs/COMMANDS.md) for the full reference.

## 22 archetypes auto-detected

Each archetype activates its own specialist agents and compliance checklists.

| Archetype | Default tier | Specialist agents auto-loaded | Compliance |
|-----------|--------------|-------------------------------|------------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |

Override at any time: `npx great-cto init --archetype <name>` or edit `.great_cto/PROJECT.md`. The CLI also offers an Anthropic Haiku second-opinion (~$0.001) when heuristic confidence is low — set `ANTHROPIC_API_KEY` to enable, opt out with `--no-llm`.

Dedicated landing pages: [agent-product](https://greatcto.systems/for/agent-product) · [fintech](https://greatcto.systems/for/fintech) · [healthcare](https://greatcto.systems/for/healthcare).

## How is this different?

We're not an editor — we orchestrate the process around your editor. Use Cursor, Copilot, or Claude Code inside the loop if you want.

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| Multi-agent SDLC pipeline | ✓ 17 specialists | ✕ | ✕ | ✕ |
| Auto archetype detection | ✓ 17 types | ✕ | ✕ | ✕ |
| Compliance gates (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| Persistent memory | ✓ decisions.md + verdicts | ⚠ chat-only | ✕ | ✓ chat scope |
| Multi-project view | ✓ | ✕ | ✕ | ⚠ |
| 12-angle code review | ✓ | ⚠ single-pass | ⚠ single-pass | ✕ |
| Public sharable reports | ✓ | ✕ | ✕ | ✕ |
| Open source | ✓ MIT | ✕ | ✕ | ✕ |
| Runs locally | ✓ | ⚠ partial | ✕ | ✕ |
| Pay your own API | ✓ | ✕ | ✕ | ✕ |
| **Pricing** | **$0 + your API** | $20/mo | $39/mo | $20/mo |

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

## The pipeline scales to the work

```
architect → pm → senior-dev → [/review ×12] → qa-engineer → security-officer → devops → l3-support
```

| Scale | Agents | Time | When |
|-------|--------|------|------|
| `quick` | 1–3 | 5–20min | Hotfix, typo, new endpoint, small feature |
| `standard` | 5 | ~45min | **Default** — standard feature, new service |
| `deep` | 7+ | 90min+ | Cross-cutting, regulated domain, arch migration |

`/start` detects the scale automatically. Override at any time: `"make it deep"`, `"this is just a quick fix"`.

## Memory & cross-project learning

We synthesize, not record. Total local memory ~10–50 KB per project, indexed at session start.

| Layer | File | What it remembers | Synthesis trigger |
|-------|------|-------------------|-------------------|
| L1 | `.great_cto/PROJECT.md` | Archetype, size, compliance, owners | `/start` |
| L2 | `.great_cto/lessons.md` | Per-project retros, what failed, what worked | `/digest` weekly + every postmortem |
| L3 | `~/.great_cto/decisions.md` | Every gate approve/reject across all projects (append-only ADR log) | Auto on every gate action |
| L4 | `~/.great_cto/verdicts/` | Every agent verdict (APPROVED / DONE / BLOCKED / FAIL) with rationale | Auto on every agent run |

Agents query memory **before** reading source files — solved problems stay solved. Cross-project: a "JWT auth" decision in project A surfaces in project B when relevant. After a P0 incident, agents extract a structured pattern and `/crystallize` promotes it globally — **94% MTTR reduction on second occurrence**.

## Privacy & telemetry

Anonymous opt-in install ping (one per `npx great-cto init`):

- Random UUID install_id, CLI version, archetype, Node version, OS.
- **No paths, code, repo names, or PII.**
- Stored in `~/.great_cto/config.json` so the same install isn't double-counted.
- Disable any time: `--no-telemetry`, `GREATCTO_NO_TELEMETRY=1`, or `{ "telemetry": false }` in config.

Powers the live counter at [greatcto.systems](https://greatcto.systems).

## MCP integrations

Native support for [Model Context Protocol](https://modelcontextprotocol.io/) servers. Optional — pipeline runs without them.

| MCP | Used by | What it enables |
|-----|---------|-----------------|
| Grafana | `l3-support` | LogQL via `query_loki`, `search_alerts`, `query_tempo`, `get_panel`. Pre-P0 alert detection |
| LLM router | `l3-support`, `qa-engineer` | Routes routine triage to Kimi K2. **60–80% LLM cost reduction** on log clustering |
| Beads | all agents | Git-native task tracker. Survives session restarts with dependencies + blockers |
| Your own | any agent | Add to `.claude-plugin/plugin.json` → `mcpServers` |

Specialist sub-agents from [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) (419 agents + 336 commands) are callable via the `Agent` tool. Install with `/template install <name>`.

## Fully automatic triggers

| Trigger | What happens |
|---------|--------------|
| Session starts | PROJECT.md + lessons.md + decisions.md + verdicts loaded |
| Gate approve/reject | Logged to `~/.great_cto/decisions.md` (append-only ADR) + broadcast via SSE to live board |
| `bd create / update / close` | Detected via dolt-DB watcher, board updates in <1s |
| Context compaction | HANDOFF.md written → next session resumes from exact pipeline state |
| P0 or iterations > 3 | Agent writes KE file → run `/crystallize` to promote to global pattern |
| Mon 9:00 | `/digest` — DORA metrics + brain update + pattern library stats |
| Sun 23:00 | `/audit` — dependency + secrets scan |
| Every Bash call | Safety check: blocks `rm -rf`, `git push --force`, `DROP TABLE` |

## Limitations & non-goals

- **Not a replacement for senior engineers** — codifies process; doesn't make architectural judgement calls without one.
- **Not an IDE** — runs inside Claude Code. If you're not using Claude Code, this isn't for you.
- **Not a CI/CD system** — gates run locally / in-session. You still need GitHub Actions for the actual merge pipeline.
- **Not a secrets manager / observability platform** — integrates with them, doesn't host the data.
- **Not deterministic** — LLM-generated outputs. Every gate verdict should be sanity-checked; `/inbox` surfaces rubber-stamping drift.
- **Not certification-audited** — PCI/HIPAA/SOC2 archetype scaffolds are starting points, not certifications.

## Architecture

```
┌──────────────────────────┐    ┌──────────────────┐
│   Claude Code session    │───→│  great_cto       │
│   (you run /start here)  │    │  pipeline +      │
└──────────────────────────┘    │  17 agents       │
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

| Layer | Stack |
|-------|-------|
| Plugin runtime | Claude Code (Anthropic) |
| Agents | Markdown agent specs + skill library |
| Task tracker | [Beads](https://github.com/steveyegge/beads) (dolt, git-native) |
| Memory | Plain markdown files (no vector store) |
| Board | Vanilla HTML/CSS/JS + Node http server, zero deps |
| Public report | Cloudflare Worker (`/r/<hash>`) — toggleable |
| Telemetry | Cloudflare Worker + D1 (`/api/install`, opt-in) |

## Author

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder. CTO building AI-native trading and fintech platforms (0→1, 1→N). Specializing in high-load financial systems where technology directly impacts PnL, risk, and unit economics.

**Why great_cto exists.** Same code reviews, same architecture questions, same security audits — across multiple companies, the same loops. Delegating helped. Process helped. But the bottleneck was always the senior engineer making the call. When Claude Code shipped, I started automating my own loops, one agent at a time. great_cto is the result — every rule in this system appeared in response to a real problem in a real production system.

## License

MIT — see [LICENSE](LICENSE).
