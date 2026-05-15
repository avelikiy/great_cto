<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

**Solo-CTO mode. Stop being the only person who can ship.**

**Local-first, open-source alternative to Devin / Cursor Background Agents / Claude Code for engineering teams** — except you bring your own coding agent (Claude Code · Codex · Cursor · Aider · Continue · Cline) and great_cto orchestrates **49 specialist agents** around it: architect, PM, senior-dev, code-reviewer, qa-engineer, security-officer, devops, plus 26 archetype-specific reviewers.

You're the solo CTO. You're also the bottleneck. **GreatCTO is 49 specialist agents** that handle architecture, review, QA, security, and deploy — while you make **two decisions per feature**.

**Built for the one-person engineering org.** Indie hackers, solo founders, and technical CTOs running everything themselves. *Not built for teams* — see [FAQ](docs/FAQ.md#is-great_cto-for-teams).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Website](https://greatcto.systems) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](CHANGELOG.md)

[Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · [繁體中文](docs/zh-TW/README.md) · [日本語](docs/ja/README.md) · [한국어](docs/ko/README.md) · [Español](docs/es/README.md) · [Português](docs/pt-BR/README.md) · [Deutsch](docs/de/README.md) · [Français](docs/fr/README.md)

</div>

## What is great_cto?

It started as a Claude Code plugin and **v2.4+ added cross-platform support** — the same archetype/compliance/scan/MCP machinery now runs in Cursor, OpenAI Codex CLI, Aider, and Continue via AGENTS.md + MCP.

You describe what you want (`/start "build a billing endpoint"`). 49 specialist agents — architect, PM, senior-dev, code-reviewer, qa-engineer, security-officer, devops, l3-support, plus 26 archetype-specific reviewers and **15 new domain reviewers** (voice-AI · clinical-AI + FDA SaMD · HR-AI · API platform · lending · clinical trials · bio-data · robotics · EM-fintech · climate MRV · biosecurity · drug-discovery ML · GLP · lab automation) — orchestrate the SDLC: archetype detection → pack overlay → architecture + ADRs → threat model → plan + Beads tasks → TDD impl → 12-angle review → QA → security gate → deploy.

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

## How great_cto compares

|  | **great_cto** | Devin | Cursor Background Agents | Aider | Cline | Claude Code (alone) |
|---|---|---|---|---|---|---|
| Open source | ✅ MIT | ❌ closed | ❌ closed | ✅ Apache-2.0 | ✅ Apache-2.0 | ❌ closed plugin model |
| Self-host | ✅ runs locally | ❌ Cognition cloud | ❌ Cursor cloud | ✅ | ✅ | ✅ |
| BYOK / multi-model | ✅ Claude · Codex · Cursor · Aider · Continue · Cline | ❌ proprietary | ⚠️ Cursor stack only | ✅ many | ✅ many | ❌ Anthropic only |
| Specialist agents | **49** (architect · PM · 12-angle review · QA · security · devops · 26 archetype reviewers · 15 domain reviewers) | 1 generalist | 1 background loop | 1 chat loop | 1 chat loop | 1 generalist |
| SDLC orchestration | architect → plan → impl → review → QA → security → devops | one-shot autonomy | edit loop | edit loop | edit loop | edit loop |
| Human gates | ✅ 2 per feature (plan + ship) | ❌ none | ❌ none | ❌ | ❌ | ❌ |
| Memory across sessions | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ thread only | ⚠️ thread only | ❌ | ⚠️ thread only | ⚠️ thread only |
| Cost tracking | ✅ per-agent + 30d history + savings_x | ❌ | ❌ | ❌ | ❌ | ❌ |
| Compliance archetypes | ✅ 26 (fintech · healthcare · gov · clinical-AI + FDA SaMD · GLP · biosecurity · …) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pricing | free (you pay your LLM provider) | $500/mo | $20/mo + Cursor sub | free | free | $20/mo |
| Setup | `npx great-cto init` | sign up | Cursor + Slack | `pip install aider-chat` | VS Code extension | install CLI |

great_cto is **not** another coding-agent loop — it's the **orchestration layer above** the coding agent you already use. Think "specialist team that reviews and gates the work" rather than "another assistant that types code."

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
<td width="50%"><a href="docs/screenshots/agents.png"><img src="docs/screenshots/agents.png" alt="Agent fleet — 49 specialists with run counts" width="100%" /></a><br/><sub><b>Agents</b> — 49 specialists with last-used + run counts</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="docs/screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Memory</b> — 11 layers + crystallized incident patterns</sub></td>
</tr>
</table>

| Tile | What you see |
|---|---|
| Tasks | Backlog → in-progress → done, drag to update via `/api/tasks/<id>/status` |
| Cost (30d) | LLM $ vs human-equivalent $; flag if `savings_x < 100×` |
| Agent fleet | 49 agents with last-used + per-agent run count |
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
| Multi-agent SDLC pipeline | ✓ 49 specialists | ✕ | ✕ | ✕ |
| Works in 5 AI assistants | ✓ Claude Code · Cursor · Codex · Aider · Continue | one IDE | one IDE | one product |
| Auto archetype detection | ✓ 25 types + 10 domain packs | ✕ | ✕ | ✕ |
| Compliance gates (PCI / HIPAA / SOX / EU AI Act / TCPA / FDA SaMD / NYC LL 144 / FCRA / ICH-GCP / ISO TS 15066) | ✓ | ✕ | ✕ | ✕ |
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

## 10 domain packs (v2.8 — overlay reviewers)

Domain packs ride **on top of** archetypes. Auto-attached when CLI detects pack-specific signals (deps, README terms). Each pack adds its own reviewer(s), threat-model template, EVAL suite, and human gates — independent of base archetype.

| Pack | Reviewers | Triggers | Human gates added |
|---|---|---|---|
| `voice-pack` | voice-ai-reviewer | twilio · livekit · deepgram · elevenlabs · ivr · tts/stt | `gate:voice-compliance` |
| `clinical-pack` | ai-clinical · fda | EHR · PHI · SaMD · clinical decision support · scribe | `gate:samd-class` · `gate:clinical-validation` · `gate:ide-approval` |
| `hr-ai-pack` | hr-ai | recruit · hiring · resume · ats · workforce scheduling · AEDT | `gate:aedt-audit` |
| `api-platform-pack` | api-platform | OpenAPI · GraphQL · webhook · developer portal · public API | `gate:api-contract` |
| `lending-pack` | lending-credit | plaid · loan · BNPL · FCRA · NMLS · adverse action | `gate:fair-lending` |
| `clinical-trials-pack` | clinical-trials · bio-data | FHIR · HL7 · DICOM · CTMS · EDC · eConsent · CDISC | `gate:irb-ready` · `gate:part11-validation` · `gate:deidentification` |
| `robotics-pack` | robotics-safety | ROS 2 · MoveIt · cobot · surgical robot · AMR / drone | `gate:hara-signoff` · `gate:functional-safety-test` |
| `em-fintech-pack` | em-fintech | India · Nigeria · Brazil · UPI · PIX · M-Pesa · GCash · RBI · CBN | `gate:license-strategy` |
| `climate-pack` | climate-mrv · biosecurity | GHG · Scope 1-3 · Verra · CBAM · DURC · IGSC · cloud lab | `gate:mrv-methodology` · `gate:durc-signoff` · `gate:open-weights-release` |
| `drug-discovery-pack` | drug-discovery-ml · GLP · lab-automation | ChEMBL · AlphaFold · RFdiffusion · LIMS · SiLA2 | `gate:model-card-signoff` · `gate:csv-validation` · `gate:iq-oq-pq` |

→ **19 new human-gate types** + 38 reference EVAL suites + 15 TM templates. See [skills/great_cto/ARCHETYPES.md](skills/great_cto/ARCHETYPES.md) for full overlay matrix.

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

## CI integration

Drop into any GitHub Actions workflow:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` auto-detects `$GITHUB_ACTIONS` and emits `::error file=...,line=N::` annotations inline on PR diffs. Exit codes: 0 clean / 1 findings / 2 setup error.

## Test pyramid

great_cto's own pipeline is exercised by a layered test suite. **All free-tier tests run in <2 min**; real-LLM tests run on-demand via OpenRouter.

| Layer | What it tests | Count | Cost |
|---|---|---|---|
| **Structural** | Archetype detection on 36 fixtures (25 base + 10 packs) · pack-registry integrity · agent-prompt integrity | 36 fixtures + 456 pack assertions + 13 prompt checks | $0 |
| **State machine** | Board cost dashboard · gate approval flow · pipeline state · resume across restart · multi-platform parity · pipeline contracts | 38 cases | $0 |
| **Real LLM (single archetype)** | Full pipeline for one archetype through Sonnet 4 | 1 run | ~$0.17 |
| **Real LLM (all archetypes)** | 25 archetypes × 4 stages = 100 calls (with `OR_DOWNSTREAM=1`: 25 × 8 = 200 calls) | 25 runs | $4–$9 |
| **Pack overlays** | 10 v2.8.0 domain packs through 5-stage pipeline with planted vulnerability stubs | 10 runs | ~$1.84 |
| **Reviewer regressions** | 9 reviewer agents × planted vuln → assert BLOCKED | 9 runs | ~$0.10 |

Run individual suites:

```bash
# Structural + state machine (~2 min, $0)
node --test tests/*.test.mjs
node tests/run-archetype-e2e.mjs
node tests/run-packs-e2e.mjs

# Real LLM (requires OPENROUTER_API_KEY)
node tests/openrouter-multi-archetype.mjs           # 25 archetypes × 4 stages
OR_DOWNSTREAM=1 node tests/openrouter-multi-archetype.mjs  # × 8 stages
node tests/openrouter-pack-overlays.mjs             # 10 packs
node tests/openrouter-reviewer-regressions.mjs      # 9 reviewers
```

See [docs/testing/](docs/testing/) for analysis docs from each run.

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

**Cursor / Aider / Codex support?** All five via `adapt --platform <host>`.

**How do you keep token costs down?** Haiku-by-default + Kimi K2 router for triage (60–80% savings) + cost-guard hook.

**Can I disable hooks?** Every hook honors `GREAT_CTO_DISABLE_<NAME>=1`. Per-file opt-out: `// agentshield:ignore`.

**What if I'm not solo?** great_cto is built for the one-person engineering org. If you have 2+ engineers and need shared boards / multi-seat auth, you've outgrown it.

Full FAQ: [docs/FAQ.md](docs/FAQ.md).

## Architecture

The plugin runs inside Claude Code (or any MCP-capable host); 49 agents are markdown specs; tasks live in Beads (dolt, git-native); memory is plain markdown (no vector store). Diagram + stack table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's new

**v2.7.0** (May 2026) — cross-prompt consistency linter (3 new rules: `CONS-MODEL`, `CONS-OUTPUT`, `CONS-SIGNOFF`); ADR-002 model-tier policy (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet); 49 agents · 0 lint errors · 0 warnings.

[Full changelog →](CHANGELOG.md)

## Roadmap

- **v2.8** — lesson-quality tracking (which lessons agents cite vs ignore)
- **v2.9** — auto-promotion: high-impact decisions → reusable skills
- **v3.0** — clean release-only commit history

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
