<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Solo-CTO mode. Stop being the only person who can ship.**

You're the solo CTO. You're also the bottleneck. **GreatCTO is 34 specialist agents** that handle architecture, review, QA, security, and deploy — while you make **two decisions per feature**.

**Built for the one-person engineering org.** Indie hackers, solo founders, and technical CTOs running everything themselves. *Not built for teams* — see [FAQ](docs/FAQ.md#is-great_cto-for-teams).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![Daily Canary](https://img.shields.io/github/actions/workflow/status/avelikiy/great_cto/daily-canary.yml?branch=main&label=daily%20canary&logo=github)](https://github.com/avelikiy/great_cto/actions/workflows/daily-canary.yml)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Website](https://greatcto.systems) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](CHANGELOG.md)

[Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · [日本語](docs/ja/README.md) · [한국어](docs/ko/README.md) · [Español](docs/es/README.md)

</div>

## What is great_cto?

It started as a Claude Code plugin and **v2.4+ added cross-platform support** — the same archetype/compliance/scan/MCP machinery now runs in Cursor, OpenAI Codex CLI, Aider, and Continue via AGENTS.md + MCP.

You describe what you want (`/start "build a billing endpoint"`). 34 specialist agents — architect, PM, senior-dev, code-reviewer, qa-engineer, security-officer, devops, l3-support, plus 26 archetype-specific reviewers — orchestrate the SDLC: archetype detection → architecture + ADRs → threat model → plan + Beads tasks → TDD impl → 12-angle review → QA → security gate → deploy.

The pipeline scales to the work: a 1-line typo fix runs through 1 agent in 30s; a deep cross-cutting feature runs through 7+ agents over an hour. **You confirm two gates** (plan, ship). Everything else is automatic.

## Two decisions per feature

```
🟡 gate:plan   ←  you decide here (architecture + tasks + cost)
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  you decide here (PR ready, security signed off)
```

Architects, planners, reviewers, QA, security, DevOps run automatically between those two human checkpoints. **Memory persists** between sessions: every gate verdict appends to `~/.great_cto/decisions.md`, every retrospective appends to per-project `lessons.md`, and `/crystallize` promotes high-impact patterns to a global library agents query before re-solving.

## Quick install

```bash
npx great-cto init
```

The CLI scans your repo, picks the right archetype, wires compliance gates automatically. Works on new or existing projects. Restart Claude Code afterwards.

**Requires:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## The board you'll actually check

`great-cto board` opens an admin UI at `http://localhost:3141` — Kanban with realtime SSE updates, per-agent cost tile, pipeline status across 8 stages, and a 30-day cost history that pairs LLM spend with the human-equivalent baseline.

<p align="center">
  <img src="docs/screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="docs/screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Metrics</b> — LLM cost, human-equivalent baseline, savings_x ratio</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="docs/screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Inbox</b> — pending gates, P0 incidents, blocked tasks, stale in-progress</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="docs/screenshots/agents.png" alt="Agent fleet — 34 specialists with run counts" width="100%" /></a><br/><sub><b>Agents</b> — 34 specialists with last-used + run counts</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="docs/screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Memory</b> — 11 layers + crystallized incident patterns</sub></td>
</tr>
</table>

| Tile | What you see |
|---|---|
| Tasks | Backlog → in-progress → done, drag to update via `/api/tasks/<id>/status` |
| Cost (30d) | LLM $ vs human-equivalent $; flag if `savings_x < 100×` |
| Agent fleet | 34 agents with last-used + per-agent run count |
| Inbox | Pending gates, P0 incidents, blocked tasks (auto-sorted) |
| Pipeline | 8-stage SDLC with status (architect → pm → senior-dev → … → devops) |

Full API surface: [docs/BOARD-API.md](docs/BOARD-API.md).

## Three commands you use every day

```bash
/start "build a refund endpoint with PCI-DSS scoping"
# → architect → enterprise-saas-reviewer (PCI-DSS auto-loaded)
# → pm → 5 Beads tasks → gate:plan (you approve)
# → senior-dev → 12-angle review → qa → security-officer
# → gate:ship (you approve) → devops → deployed

/inbox
# Pending gates · P0 incidents · blocked tasks · stale in-progress

/digest
# Weekly DORA + delta vs last week + cost-per-feature roll-up
```

Plus: `/audit` (existing-codebase scan), `/cost` (LLM router savings), `/sec` (security umbrella), `/oncall`, `/release`, `/rfc`. Full list: `~/.claude/commands/` after install.

## Cost

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| Pipeline | Cost/run | Runs/mo | Total |
|---|---|---|---|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (new endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

Pay your own Anthropic API tokens. **No per-seat fee. No SaaS lock-in.** Routine triage auto-routes to Kimi K2 (Sonnet-equivalent at ~5× lower cost) → 60–80% reduction on log clustering.

## How is this different?

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| Multi-agent SDLC pipeline | ✓ 34 specialists | ✕ | ✕ | ✕ |
| Works in 5 AI assistants | ✓ Claude Code · Cursor · Codex · Aider · Continue | one IDE | one IDE | one product |
| Auto archetype detection | ✓ 25 types | ✕ | ✕ | ✕ |
| Compliance gates (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| AI-security scanner (24 OWASP LLM rules) | ✓ built-in | ✕ | ✕ | ✕ |
| Persistent memory | ✓ decisions.md + verdicts | ⚠ chat-only | ✕ | ✓ chat scope |
| Open source · runs locally · pay your own API | ✓ | ✕ | ✕ | ✕ |
| **Pricing** | **$0 + your API** | $20/mo | $39/mo | $20/mo |

## 25 archetypes auto-detected

Each archetype activates its own specialist agents and compliance checklists. Top 7:

| Archetype | Tier | Specialist agents | Compliance |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |

Full table (25 archetypes) + how detection works: [docs/ARCHETYPES.md](docs/ARCHETYPES.md).

## Showcase: from idea to passing tests in $2.39

A real run, fully traced, end-to-end. Solo CTO has a stdlib-only Python CLI tool and wants to add `qacli convert <input> --output json`. Three iterations later:

- 7 source files, 18 pytest tests, 76% coverage
- ARCH + ADR + threat model + PM plan + QA report + security sign-off
- Two security review cycles — second one cleared `gate:ship`
- 8 Beads tasks closed, every step verdict-tagged with cost

**Total LLM spend: $2.39 across 3 iterations.** Human-equivalent estimate from PM agent: ~$5,460.

The most valuable signal: in iteration 1, the security-officer caught two real defects QA passed (`list(stream_csv())` defeated streaming guarantee → 14.5 MB peak RSS on 13 MB input verified by memory profile). Multi-reviewer model catching what single agents miss, before merge, no human in the review loop.

Full trace: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## Cross-platform support

Generate platform-native config from one source of truth:

```bash
npx great-cto adapt --platform claude     # CLAUDE.md + AGENTS.md
npx great-cto adapt --platform cursor     # .cursorrules + .cursor/rules/*.mdc
npx great-cto adapt --platform codex      # AGENTS.md
npx great-cto adapt --platform aider      # .aider.conf.yml + CONVENTIONS.md
npx great-cto adapt --platform continue   # .continue/rules.md
npx great-cto adapt --platform all
```

| Tool | Native config | Daily verified |
|---|---|---|
| Claude Code | CLAUDE.md + AGENTS.md (34-agent plugin layer) | ✓ |
| Cursor | .cursorrules + .cursor/rules/*.mdc + AGENTS.md | ✓ |
| OpenAI Codex CLI | AGENTS.md | ✓ |
| Aider | .aider.conf.yml + CONVENTIONS.md + AGENTS.md | ✓ |
| Continue | .continue/rules.md + AGENTS.md | ✓ |

"Daily verified" = `scripts/canary.sh` step 7 runs in [GitHub Actions every 06:00 UTC](.github/workflows/daily-canary.yml) on Ubuntu × macOS × Node 18.17/20/22 against both working tree and published npm. If `adapt --platform <host>` regresses, canary opens an issue.

## CI integration

Drop into any GitHub Actions workflow:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` auto-detects `$GITHUB_ACTIONS` and emits `::error file=...,line=N::` annotations inline on PR diffs. Exit codes: 0 clean / 1 findings / 2 setup error.

## MCP

Native [MCP](https://modelcontextprotocol.io/) server — call great_cto's tools (`scan`, `list_rules`, `detect_archetype`, `estimate_cost`, `query_decisions`) from Claude Desktop, Cursor, Continue, or any MCP host:

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Full setup + internal MCPs (Grafana, LLM router, Beads): [docs/MCP.md](docs/MCP.md).

## Limitations & non-goals

- **Not for teams** — solo-CTO is the product. 2+ engineers? Try Cursor Business / Copilot Workspace.
- **Not a replacement for senior engineers** — codifies process; doesn't make architectural judgement calls without one.
- **Not a CI/CD system** — gates run locally / in-session. You still need GitHub Actions for actual merge.
- **Not certification-audited** — PCI/HIPAA/SOC2 archetype scaffolds are starting points, not certifications.
- **Not deterministic** — LLM-generated outputs. Every gate verdict should be sanity-checked.

## FAQ (top 5)

**Is my source code used to train models?** No. Claude API zero-retention by default for paying customers. great_cto adds nothing.

**Cursor / Aider / Codex support?** All five via `adapt --platform <host>`. Daily canary verifies.

**How do you keep token costs down?** Haiku-by-default + Kimi K2 router for triage (60–80% savings) + cost-guard hook.

**Can I disable hooks?** Every hook honors `GREAT_CTO_DISABLE_<NAME>=1`. Per-file opt-out: `// agentshield:ignore`.

**What if I'm not solo?** great_cto is built for the one-person engineering org. If you have 2+ engineers and need shared boards / multi-seat auth, you've outgrown it.

Full FAQ: [docs/FAQ.md](docs/FAQ.md).

## Architecture

The plugin runs inside Claude Code (or any MCP-capable host); 34 agents are markdown specs; tasks live in Beads (dolt, git-native); memory is plain markdown (no vector store). Diagram + stack table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's new

**v2.7.0** (May 2026) — cross-prompt consistency linter (3 new rules: `CONS-MODEL`, `CONS-OUTPUT`, `CONS-SIGNOFF`); ADR-002 model-tier policy (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet); 34 agents · 0 lint errors · 0 warnings.

[Full changelog →](CHANGELOG.md)

## Roadmap

- **v2.8** — telemetry on lesson quality (track which lessons agents cite vs ignore)
- **v2.9** — auto-promotion: high-impact decisions → reusable skills
- **v3.0** — clean release-only commit history + custom domain `telemetry.greatcto.systems`

[Vote on the next feature →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

## Author

[avelikiy](https://github.com/avelikiy) — CTO building AI-native trading and fintech platforms (0→1, 1→N). great_cto is the result of automating my own loops, one agent at a time. Every rule appeared in response to a real problem in a real production system.

## Community

| Channel | What |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, feature requests, archetype proposals |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Questions, patterns, show-and-tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Architecture deep-dives |
| 🔒 [SECURITY.md](SECURITY.md) | Responsible disclosure |

## Contributing & License

Pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT — see [LICENSE](LICENSE).

If great_cto saved you time, please star the repo — it helps other solo CTOs find it.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Built by [@avelikiy](https://github.com/avelikiy)**
*Stop being the only person who can ship.*

</div>
