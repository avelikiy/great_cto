<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Solo-CTO mode. Stop being the only person who can ship.**

You're the solo CTO. You're also the bottleneck. **GreatCTO is 34 specialist agents** that handle architecture, review, QA, security, and deploy — while you make **two decisions per feature**.

**Built for the one-person engineering org.** Indie hackers, solo founders, and technical CTOs running everything themselves. *Not built for teams* — if you have 2+ engineers and need shared dashboards / multi-seat auth / per-developer audit logs, look at Cursor Business or GitHub Copilot Workspace.

> **v2.5.8** · 34 agents · 25 archetypes · 24 OWASP LLM rules · 9 hooks · works in **Claude Code · Cursor · Codex · Aider · Continue** · MCP server · webhooks · CI gate · per-stage Beads tasks · ~$34/mo per project · MIT

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![Stars](https://img.shields.io/github/stars/avelikiy/great_cto?style=flat)](https://github.com/avelikiy/great_cto/stargazers)
[![Issues](https://img.shields.io/github/issues/avelikiy/great_cto)](https://github.com/avelikiy/great_cto/issues)
[![Last commit](https://img.shields.io/github/last-commit/avelikiy/great_cto)](https://github.com/avelikiy/great_cto/commits/main)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Socket](https://socket.dev/api/badge/npm/package/great-cto)](https://socket.dev/npm/package/great-cto)
[![Snyk](https://snyk.io/advisor/npm-package/great-cto/badge.svg)](https://snyk.io/advisor/npm-package/great-cto)

[Website](https://greatcto.systems) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](CHANGELOG.md)

</div>

## What's new

### v2.5.x patch series — production hardening (May 2026)
- **v2.5.8**: full QA pass — closed 10 bugs (`docs/qa/runs/2026-05-09/REPORT.md`). Highlights: cost pipeline now reflects real LLM spend (`/api/cost`, `/api/metrics.cost` were permanently zero); board returns graceful `409 beads_not_initialized` instead of raw 500; phantom agents bucketed under `unknown`; `PORT` env-var honored; canonical verdict format with `cost=$X` tag (`scripts/log-verdict.sh` + `agents/_shared/verdict-format.md`); sub-agent sandbox / cwd policy documented (`agents/_shared/sandbox-cwd-policy.md`); `validate.py` regex fix for hyphenated commands; CI hardening — dead Playwright workflow removed, plugin-cache cleanup `--keep 3` in SessionStart
- **v2.5.7**: per-stage Beads task lifecycle (architect / pm / senior-dev / qa / security / perf / devops / l3 each create + close their own tasks via `scripts/phase-task.sh`); cost-history off-by-one fix (30 → 31 buckets, inclusive window)
- **v2.5.6**: 6 Cursor-dogfooding UX fixes (CLI hint for slash-only commands · `init` $HOME refusal · clearer `.great_cto/` exists message · `ci` archetype-drift resolution paths · agent-product detection broadened · README API schema)
- **v2.5.5**: critical fix — `/inbox` and `/digest` "Prompt is too long" (commands trimmed 30→2.6KB, 46→4KB; bash logic moved to `scripts/cmd-data/`); closed-gate `mapStatus` bug (P0 counter included done gates)
- **v2.5.4**: env-var-first host detection (`$CLAUDECODE` / `$CODEX_SESSION` / `$CURSOR_TRACE_ID` / `$AIDER_VERSION` / `$CONTINUE_GLOBAL_DIR`); Cursor extension VSIX with marketplace icon
- **v2.5.3**: Codex compat — host-aware DEPS check, Beads write-test (catches false-positive empty DB)
- **v2.5.2**: subcommand telemetry (track which v2.4+ commands users adopt)
- **v2.5.1**: critical fix — `scan`/`ci` missed findings on relative paths (broken glob-to-regex affected all v2.0+)

### v2.5.0 — Production webhooks + MCP SSE + reports + Cursor extension (May 2026)
- HMAC-verified webhook receiver: GitHub / Sentry / generic (`great-cto serve`)
- Outbound dispatcher with exponential-backoff retry + DLQ → Slack / Discord / PagerDuty
- MCP SSE mode for multi-client / remote use
- HTML/JSON cost+compliance reports (`great-cto report cost --period 30d`)
- Cursor extension scaffold in `packages/cursor-ext/` — vsce-ready
- ADR-001 multi-tenant board (architectural decision, deferred to v2.6+)

### v2.4.0 — Multi-platform support: Codex, Cursor, Aider, Continue (May 2026)
- `great-cto adapt --platform [claude|codex|cursor|aider|continue|all]` — single source of truth → platform-native configs
- `great-cto mcp` — MCP server (stdio + SSE) exposing 5 tools to any MCP host
- `great-cto ci` — single-command CI gate (scan + archetype check + GitHub Actions annotations + SARIF + JUnit XML)
- `great-cto serve` — webhook receiver scaffolding

### v2.3.0 — Agent workforce management (May 2026)
- `/agent-review [name]` — performance scorecard for LLM agents (verdicts, cost, failure modes, prompt-tuning suggestions). Like a 1:1 but for AI workforce.
- `/agent-retire <name>` — graceful agent deprecation (archive prompt, remove from sync list, preserve verdicts for audit)
- `/cost feature <slug>` — ROI per shipped feature (per-agent breakdown + comparison to human equivalent)
- `/cost agent <name>` — quick per-agent cost summary
- New positioning: GreatCTO is the management layer between you and your AI agent fleet — hire (`/template install`), review (`/agent-review`), route (cost-per-feature), retire (`/agent-retire`). You're the manager; the agents are the org chart.

### v2.2.0 — 3 new archetypes: edtech, gov-public, insurance (May 2026)
- `edtech` archetype + `edtech-reviewer` — COPPA/FERPA/GDPR-K + WCAG 2.2 AA + state student-privacy laws (SOPIPA-CA, NY 2-D)
- `gov-public` archetype + `gov-reviewer` — FedRAMP boundary scoping, NIST 800-53 control mapping, Section 508, PIA generation, CJIS, StateRAMP
- `insurance` archetype + `insurance-reviewer` — NAIC 50-state filing matrix, Solvency II, IFRS 17, ACORD, actuarial ASOP 41/56, anti-discrimination pricing analysis
- 9 new detection signals (LMS libs, gov design systems, ACORD/NAIC schemas)
- 9 new test cases (3 per archetype) — 50/50 archetype tests passing

### v2.1.0 — built-in security scan (May 2026)
- `npx great-cto scan ./` — OWASP LLM Top 10 + 24 rules + SARIF for GitHub Code Scanning
- 5 scanners: prompt-injection · secrets-in-prompts · SSRF-in-tools · RAG poisoning · cost-runaway
- Merged from standalone `@great-cto/agentshield` package — one install, one version

### v1.2.0 — continuous learning loop (May 2026)
- New `continuous-learner` agent (Haiku, ~$0.05/run) auto-extracts session patterns
- Two-tier memory: project-local `lessons.md` → cross-project `~/.great_cto/decisions.md`
- Quality gates: max 3 lessons per session, archetype-tagged, threshold-based promotion (≥3 distinct projects)

### v1.1.0 — Claude Code hooks (May 2026)
- 4 new hooks: `secret-scan` (PreToolUse) · `format-check` (PostToolUse) · `cost-guard` (UserPromptSubmit) · `session-end`
- 13-pattern secret detection catalog (AWS, Stripe, GitHub, OpenAI, Anthropic, PEM, JWT)
- All hooks honor `GREAT_CTO_DISABLE_<NAME>=1` opt-out

[Full changelog →](CHANGELOG.md)

## What is great_cto?

great_cto is a [Claude Code plugin](https://claude.com/plugins) that runs the full SDLC pipeline as **33 specialist agents** — architect, planning, implementation, 12-angle review, QA, security, deployment, support — coordinated through a board you actually check. You make two decisions per feature; everything else is automatic.

| Layer | What it does |
|-------|--------------|
| **33 specialist agents** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 archetypes** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
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
  → archetype: commerce | scale: standard | LLM agent: ~45min  (human team: 2–3 days)
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

### Agent workforce management (v2.3.0)

| Command | What it does |
|---------|--------------|
| `/agent-review [name]` | Performance scorecard for one or all agents — verdicts, cost, failure modes, prompt-tuning suggestions |
| `/agent-retire <name>` | Gracefully retire an unused agent (archive prompt, remove from sync list, preserve audit trail) |
| `/cost feature <slug>` | ROI per shipped feature — per-agent breakdown + human-equivalent comparison |

Everything else (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) runs automatically or only when you need it. See [`docs/COMMANDS.md`](docs/COMMANDS.md) for the full reference.

## 25 archetypes auto-detected

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
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |

Override at any time: `npx great-cto init --archetype <name>` or edit `.great_cto/PROJECT.md`. The CLI also offers an Anthropic Haiku second-opinion (~$0.001) when heuristic confidence is low — set `ANTHROPIC_API_KEY` to enable, opt out with `--no-llm`.

Dedicated landing pages: [agent-product](https://greatcto.systems/for/agent-product) · [fintech](https://greatcto.systems/for/fintech) · [healthcare](https://greatcto.systems/for/healthcare).

## How is this different?

We're not an editor — we orchestrate the process around your editor. Use Cursor, Copilot, or Claude Code inside the loop if you want.

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| Multi-agent SDLC pipeline | ✓ 33 specialists | ✕ | ✕ | ✕ |
| Auto archetype detection | ✓ 25 types | ✕ | ✕ | ✕ |
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

| Scale | Agents | LLM-agent time | Human-team equivalent | When |
|-------|--------|----------------|-----------------------|------|
| `quick` | 1–3 | 5–20min | 2–4h | Hotfix, typo, new endpoint, small feature |
| `standard` | 5 | ~45min | 2–3 days | **Default** — standard feature, new service |
| `deep` | 7+ | 90min+ | 1–2 weeks | Cross-cutting, regulated domain, arch migration |

> _LLM-agent time_ is wall-clock from `/start` to ship-ready PR with the pipeline running on Sonnet 4.6. _Human-team equivalent_ assumes one mid-level engineer at ~6 productive hours/day including reviews, meetings, and context switches.

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

## Cross-platform support

great_cto v2.4+ works in **any** AI-coding tool, not just Claude Code. Generate platform-native config from a single source of truth:

```bash
npx great-cto adapt --platform claude    # CLAUDE.md + AGENTS.md
npx great-cto adapt --platform codex     # AGENTS.md (OpenAI Codex CLI)
npx great-cto adapt --platform cursor    # .cursorrules + .cursor/rules/*.mdc
npx great-cto adapt --platform aider     # .aider.conf.yml + CONVENTIONS.md
npx great-cto adapt --platform continue  # .continue/rules.md
npx great-cto adapt --platform all       # all of the above
```

All variants share AGENTS.md as the cross-tool standard, so editing `.great_cto/PROJECT.md` (archetype + compliance) updates every consumer with one re-run.

| Tool | Native config | MCP support |
|---|---|---|
| Claude Code | CLAUDE.md (plugin layer with 34 agents) | ✓ via Claude Desktop |
| Cursor | .cursorrules + .cursor/rules/ | ✓ |
| OpenAI Codex CLI | AGENTS.md | ✓ |
| Aider | .aider.conf.yml + CONVENTIONS.md | partial |
| Continue | .continue/rules.md | ✓ |

A native VS Code / Cursor extension is in `packages/cursor-ext/` — adds command-palette entries for scan / CI / report and a status-bar shield icon.

## Board API surface

The board (`great-cto board` → http://localhost:3141) exposes a JSON API for
external integrations / smoke tests. **All list endpoints return raw arrays
or top-level fields, not wrapped objects** — design for direct iteration:

| Endpoint | Method | Returns |
|---|---|---|
| `/api/projects` | GET | `Project[]` — array of `{slug, archetype, path, ...}` |
| `/api/tasks?project=<slug>` | GET | `Task[]` — array of `{id, title, status, ...}` |
| `/api/agents-installed` | GET | `{agents: [...], total: N}` |
| `/api/metrics?project=<slug>` | GET | `{tasks, velocity, cost, qa, security, agents, agents_cost}` |
| `/api/cost?project=<slug>&days=30` | GET | `{series, total_llm, total_human, ...}` |
| `/api/memory?project=<slug>` | GET | `{layers: [...11], patterns: [...]}` |
| `/api/inbox?project=<slug>` | GET | `{open_gates, p0_open, blocked, recent_activity, ...}` |
| `/api/logs?project=<slug>` | GET | `{logs: [...]}` |
| `/api/decisions?limit=20` | GET | `Decision[]` |
| `/api/pipeline?project=<slug>` | GET | `Stage[]` — 8 SDLC stages with status |
| `/api/healthz` | GET | `{ok: true}` |

**Common gotcha:** `/api/projects` and `/api/tasks` return **arrays directly**,
not `{projects: [...]}` wrappers. Smoke scripts that test `data.projects`
will see `undefined` and falsely report empty data. Use:

```python
import urllib.request, json
data = json.load(urllib.request.urlopen("http://127.0.0.1:3141/api/projects"))
assert isinstance(data, list), "endpoint returns array directly"
print(f"projects: {len(data)}")
```

```bash
curl -sf http://127.0.0.1:3141/api/tasks?project=Test | jq 'length'
```

For a full reference: `packages/board/server.mjs` — every route is a top-level
`if (pathname === '/api/...')` block.

## CI integration

Drop into any GitHub Actions workflow:

```yaml
name: AI security scan
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx great-cto@latest ci ./ --sarif results.sarif
        env:
          GREATCTO_NO_TELEMETRY: "1"
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: results.sarif }
```

`great-cto ci` auto-detects `$GITHUB_ACTIONS` and emits `::error file=...,line=N::` annotations inline on PR diffs. Exit codes: 0 clean / 1 findings / 2 setup error.

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
└──────────────────────────┘    │  33 agents       │
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

## ⭐ Star this repo

If great_cto saved you time on a project, please star the repo — it helps other solo CTOs and indie hackers find it.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 Community & support

| Channel | What |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, feature requests, archetype proposals |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Ask questions, share patterns, show & tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Deep-dives on architecture, learning loop, cost calibration |
| 🐦 [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) | Release notes, articles, AI-CTO series |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | Package registries |
| 🔒 [Security](SECURITY.md) | Responsible disclosure for hook/scanner CVEs |

## Roadmap

- **v2.2** — telemetry on lesson quality (track which lessons agents cite vs ignore)
- **v2.3** — auto-promotion: high-impact decisions → reusable skills (`~/.great_cto/global-skills/`)
- **v3.0** — cross-harness support (`AGENTS.md` for Cursor / Codex / OpenCode / Gemini)

[Vote on the next feature →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

## Contributing

Pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labeled [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

Especially needed:
- New archetype scaffolds (suggest via Discussions)
- Translations: `docs/<lang>/README.md` for non-English audiences
- Real-world case studies — if great_cto shipped you something, share the numbers

## License

MIT — see [LICENSE](LICENSE).
