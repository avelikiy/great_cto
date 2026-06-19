<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

**AI Product Builder — describe a product, approve the spec, ship the software.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](CHANGELOG.md)

[Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · [繁體中文](docs/zh-TW/README.md) · [日本語](docs/ja/README.md) · [한국어](docs/ko/README.md) · [Español](docs/es/README.md) · [Português](docs/pt-BR/README.md) · [Deutsch](docs/de/README.md) · [Français](docs/fr/README.md)

</div>

---

## Build the product, not just the code

great_cto is an **AI Product Builder**. Describe a software product and it runs the whole
build — architecture, data model, backend, frontend, tests, deploy. **One human gate:** you,
the CTO, approve the spec. Everything after is automated, to a shipped repo and a live URL.

The top US industries it builds for — home & field services, professional services,
hospitality, retail/e-commerce, proptech, fitness, marketing & creator, HR/recruiting,
construction, logistics — collapse into **6 reusable build archetypes** (CRUD vertical-SaaS,
booking, CRM, dashboard, marketplace, content/media). One template ships any of ~40 products.
See [docs/strategy/BUILD-PIPELINES.md](docs/strategy/BUILD-PIPELINES.md).

```
   describe a product
        │
   spec synthesis  ── architecture · data model · screens          (automated)
        ▼
   👤  CTO gate — approve the spec        ← the one human checkpoint
        │
   scaffold → backend → frontend → integrate → test → deploy        (automated)
        ▼
   shipped product · repo · live URL
```

CI and generated tests are the quality gate — you sign the **direction**, not every line.

> **Operate** — the runtime surface where a human signs each regulated transaction (operator
> console, autopilot runtime, vertical flows) — **moved to its own repo:**
> [github.com/avelikiy/operate](https://github.com/avelikiy/operate). great_cto is now the
> build product.

## Under the hood (for the CTO who runs it)

→ *The builder-facing story of this surface: [greatcto.systems/build](https://greatcto.systems/build)*

Each autopilot is built and operated by a gated pipeline of specialist agents — architect, 12-angle
reviewer, QA, security officer, devops — tuned to your stack and jurisdiction. **You make two
decisions per feature; everything else runs automatically.** Every vertical ships with its **own
domain compliance reviewer** — False Claims Act & NCCI for coding, OFAC & BSA for AML, FDCPA & Reg F
for collections, 21 CFR Part 11 for trials, ECOA for lending, ALTA for title, FMCSA for freight —
that blocks an unsafe design before it ever runs. Each reviewer is held to an **adversarial golden
test set** in CI before release. The reviewers, signed human gates, audit trail, and live connectors
are the trust layer that makes it safe to let the autopilot run.

**Recommended companion MCP: Serena (semantic code navigation).** On large codebases the
code-writing agents (senior-dev, coder) burn context grepping and reading whole files. The
[Serena MCP](https://github.com/oraios/serena) gives them symbol-level navigation
(find-symbol, references, structure) instead:

```bash
claude mcp add serena -- uvx --from git+https://github.com/oraios/serena \
  serena start-mcp-server --context ide-assistant --project "$(pwd)"
```

Optional — everything works without it; with it, implementation tasks on big repos use
noticeably less context per edit.

**The permission is never the wound.** Every flow step is tagged reversible or not; the runtime
**refuses to execute an irreversible action autonomously** — money moves, claim submission, e-signing,
fleet changes and tax filing run *only* after a named human signs the checkpoint. Each autopilot also
declares an **accountable owner** — one person answers for what it does. `flow-runner.mjs <vertical>
--validate` enforces the invariant; all twenty-five autopilots ship green.

## By the numbers

| | |
|---|---|
| One regulated feature, end to end (voice-AI compliance pack, traced) | **1h 26m · $3.40 LLM** vs ~$42K / ~6 weeks traditional |
| An earlier CLI-feature run, same pipeline | $2.39 LLM vs ~$5,460 human-equivalent; security caught 2 defects QA had passed |
| Monthly cost (20 pipeline runs) | **~$34** |
| Autopilot verticals | **25** (healthcare · finance · legal · ops — each with a human gate) |
| Specialist agents | **83** |
| Archetypes auto-detected | **26** |
| Jurisdictions | **12** (GDPR · HIPAA · PCI-DSS · SOX · and more) |

→ [Full trace with all artefacts](https://greatcto.systems/proof)

## How it works

**`npx great-cto init`** — scans your stack and README, detects jurisdiction (GDPR? HIPAA? PCI?), writes `.great_cto/FLOW.md` with the exact agents, gates, and compliance frameworks for your project.

**`/start "describe the feature"`** — critics review the architecture and spec before any code is written. You review the plan at `gate:plan`.

**Agents run automatically** — senior-dev implements with TDD, 12-angle review, QA, security, devops. You approve ship at `gate:ship`.

## Three projects — three different pipelines

Same command. Output depends on what you're building and where it runs:

| | **Fintech startup · EU** | **Healthcare portal · US** | **CLI tool** |
|---|---|---|---|
| Specialist agents | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| Human gates | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| Compliance | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| Cost / cycle | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ Try the interactive picker: [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## The dashboard you'll actually check

`great-cto board` opens at `http://localhost:3141` — Kanban with realtime SSE, per-agent cost tile, pipeline status, 30-day LLM spend vs human-equivalent baseline.

<p align="center">
  <img src="docs/screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="docs/screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Metrics</b> — LLM cost, human-equivalent baseline, savings_x ratio</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="docs/screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Inbox</b> — pending gates, P0 incidents, blocked tasks, stale in-progress</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="docs/screenshots/agents.png" alt="Agent fleet — installed agents with activity, health and 30-day LLM spend" width="100%" /></a><br/><sub><b>Agents</b> — the fleet with activity, health, retire candidates, and 30-day LLM spend</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="docs/screenshots/memory.png" alt="Project memory — browsable L1–L3 layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Memory</b> — browsable project memory layers: PROJECT.md, archetypes, skills, lessons</sub></td>
</tr>
</table>

**One builder, many operators.** [Build](https://greatcto.systems/build) is for the one-person engineering org — an indie hacker, solo founder, or technical CTO running the pipeline on Claude Code or OpenAI Codex. [Operate](https://greatcto.systems/operate) is for everyone who signs the work: licensed adjusters, attorneys, controllers, compliance leads — invited into the operator console with scoped, tenant-isolated links. One engineer builds the autopilot; the whole back office runs on it. *Not for multi-dev engineering teams* — see [FAQ](docs/FAQ.md#is-great_cto-for-teams).

## Install

```bash
npx great-cto init
```

Restart your AI host after init. **Requires:** Node 18.17+ and one of:

| Host | Install flag | Status |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(default)_ | ✅ full support |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + agents |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Superpowers and Beads companion plugins install automatically — no manual setup needed.

---

<details>
<summary>📖 Full documentation — two gates · critics · 83 agents · 26 archetypes · 12 jurisdictions · 45+ compliance frameworks · board · cost · MCP</summary>

## Two decisions per feature

```
🟡 gate:plan   ←  you decide here (architecture + tasks + cost)
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  you decide here (PR ready, security signed off)
```

Architects, planners, reviewers, QA, security, DevOps run automatically between those two human checkpoints. **Memory persists** between sessions: every gate verdict appends to `~/.great_cto/decisions.md`, every retrospective appends to per-project `lessons.md`, and `/crystallize` promotes high-impact patterns to a global library agents query before re-solving.

## Critics before the plan

The most expensive bugs aren't in the code — they're in decisions made before coding starts. Three critic agents run before the Plan stage, at the three positions where a mistake costs the most:

| Critic | Catches |
|---|---|
| **Architecture critic** | Coupling that rules out multi-tenancy later · "obvious" O(n²) on real-scale data · circular dependencies between bounded contexts |
| **Spec critic** | "We solved the wrong problem" — the worst class of bug, because no unit test will catch it · misaligned acceptance criteria · scope that was never agreed on |
| **Schema critic** | `NOT NULL` without a default on a 50M-row table (deadlock in 10min after deploy) · missing `CONCURRENTLY` on index creation · irreversible migrations with no rollback path |

Previously critics only activated starting from Plan. Now the pipeline catches architectural and spec-level mistakes before implementation begins — when reverting costs hours, not days.

## How great_cto compares

|  | **great_cto** | Devin | Claude Code (alone) |
|---|---|---|---|
| Open source | ✅ MIT | ❌ closed | ❌ closed plugin model |
| Self-host | ✅ runs locally | ❌ Cognition cloud | ✅ |
| Host | ✅ Claude Code + Codex | ❌ Cognition cloud | ✅ Claude Code |
| BYOK / multi-model | ✅ Claude Code · Codex | ❌ proprietary | ❌ Anthropic only |
| Specialist agents | **83** (architect · PM · 12-angle review · QA · security · devops · reviewers across archetypes, packs & jurisdictions) | 1 generalist | 1 generalist |
| SDLC orchestration | architect → plan → impl → review → QA → security → devops | one-shot autonomy | edit loop |
| Human gates | ✅ 2 per feature (plan + ship) | ❌ none | ❌ |
| Memory across sessions | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ thread only | ⚠️ thread only |
| Cost tracking | ✅ per-agent + 30d history + savings_x | ❌ | ❌ |
| Compliance frameworks | ✅ 45+ (PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …) | ❌ | ❌ |
| Pricing | free (you pay your LLM provider) | $500/mo | $20/mo |
| Setup | `npx great-cto init` | sign up | install CLI |

great_cto is **not** another coding-agent loop — it's the **orchestration layer above** the coding agent you already use. Think "specialist team that reviews and gates the work" rather than "another assistant that types code."

## Jurisdiction detection

`npx great-cto init` scans three signal sources — README keywords, infra region strings (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`), and `package.json` homepage TLD — and auto-detects which of **12 jurisdictions** apply:

| Jurisdiction | Signals (README + infra) | Frameworks | Reviewer |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · `.de` TLD | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · california residents · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · information commissioner · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi data localisation | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic · notifiable data breach | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas guidelines · singpass | PDPA · MAS TRM | `us-privacy-reviewer` |
| `ca` | pipeda · quebec law 25 · casl · canadian users · `ca-central-*` | PIPEDA · Quebec Law 25 · CASL · OSFI B-10 | `us-privacy-reviewer` |
| `jp` | appi · japan users · my number · `ap-northeast-1` · `japaneast` | APPI 2022 · PPC Guidelines · FISC | `us-privacy-reviewer` |
| `cn` | pipl · mlps · china users · `cn-north-*` · `cn-east-*` | PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT | `gdpr-reviewer` |
| `kr` | pipa korea · isms-p · kisa · korea users · `ap-northeast-2` | PIPA · ISMS-P · FSC regulations | `us-privacy-reviewer` |
| `us` | ftc · us users · virginia cdpa · texas tdpsa | FTC Act · US state privacy laws | `us-privacy-reviewer` |

Word-boundary matching prevents false positives (`"india"` doesn't match `"indiana"`). Detected jurisdiction is written to `PROJECT.md` as `jurisdiction: [eu, us-ca]` and gates the appropriate reviewer on every feature. Override manually:

```yaml
jurisdiction: [eu, us-ca]
```

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

## 26 archetypes auto-detected

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
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

Full table (26 archetypes) + how detection works: [docs/ARCHETYPES.md](docs/ARCHETYPES.md).

**Deep US coverage** — beyond GDPR/PCI/HIPAA, great_cto now reviews against SEC cyber-disclosure (8-K Item 1.05), CMMC 2.0 / NIST 800-171 for defense contractors, US AI governance (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), web-tracking litigation (VPPA · CIPA · Washington MHMDA), and HMDA / SR 11-7 model risk for lending.

## 14 domain packs — overlay reviewers

Domain packs ride **on top of** archetypes. Auto-attached when CLI detects pack-specific signals (deps, README terms). Each pack adds its own reviewer(s), threat-model template, EVAL suite, and human gates — independent of base archetype.

| Category | Packs |
|---|---|
| **AI verticals** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **Digital health** | `digital-health-pack` _(wearable telemetry · mental-health AI · nutrition AI · physician HITL)_ |
| **Fintech / regulated** | `lending-pack` · `em-fintech-pack` |
| **High-compliance** | `clinical-trials-pack` · `climate-pack` |
| **Engineering** | `api-platform-pack` · `robotics-pack` |
| **US market** | `sec-cyber-pack` _(SEC 8-K disclosure)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 human-gate types** + 53 reference EVAL suites + 15 TM templates. Browse all 14 packs with **4-layer journey visualization** (archetype → pack → reviewer → gate): [greatcto.systems/packs.html](https://greatcto.systems/packs.html).

## One real run, fully traced

The canonical receipt: a **voice-AI compliance pack** (TCPA screening, STIR/SHAKEN, state recording-consent) shipped through the full pipeline in **1h 26m wall-clock for $3.40 in LLM cost** — architect → threat model → implementation → 5 reviewers → human gates → merged PR. The traditional path for the same regulated feature: ~170 hours and ~$42K. Every stage timestamped, every artifact links to a public GitHub PR.

An earlier run on a Python CLI feature ($2.39 vs ~$5,460 human-equivalent) showed the review model working: security caught two real defects QA had passed (`list(stream_csv())` defeated streaming → 14.5 MB peak RSS on 13 MB input).

Full trace + artefacts: [greatcto.systems/proof](https://greatcto.systems/proof) · raw: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

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

Layered test suite — **structural + state-machine tier runs in <2 min for $0** (`node --test tests/*.test.mjs`); real-LLM tier (26 archetypes × 4-8 stages + 14 packs + 13 reviewers) runs on-demand via OpenRouter for ~$5–10. Full breakdown: [docs/testing/](docs/testing/).

## MCP

Native [MCP](https://modelcontextprotocol.io/) server — **7 tools** callable from Claude Desktop, Codex, or any MCP host. Local (no board needed): `detect_archetype` · `estimate_cost` · `query_decisions`. Board-backed: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Full setup + internal MCPs (Grafana, LLM router, Beads): [docs/MCP.md](docs/MCP.md).

## Email alerts (zero-setup)

Five things that need you to act in <2h get emailed automatically — even when you're away from the board:

| Trigger | When |
|---|---|
| 🚨 **P0 incident** | A P0 task opens in any project |
| ⏸️ **Gate stale > 2h** | A `gate:ship` is waiting on you for hours |
| 🛡️ **Security BLOCKED** | `security-officer` rejected a merge |
| 💸 **Budget alert** | Monthly LLM spend crosses 80% / 100% of budget |
| 📊 **Weekly digest** | Friday 09:00 — shipped, spent, savings, QA |

**Setup**: board → **Notifications** tab → enter email → enter the 6-digit code we send → pick triggers. No Resend signup, no API keys — delivery routed through `greatcto.systems/notify` (free, 100 emails/24h per verified email).

## Limitations & non-goals

- **Not for multi-dev engineering teams** — one builder is the product; 2+ engineers sharing the pipeline have outgrown it. Operators are unlimited — invite signers and compliance leads to the console freely.
- **Not a replacement for senior engineers** — codifies process; doesn't make architectural judgement calls without one.
- **Not a CI/CD system** — gates run locally / in-session. You still need GitHub Actions for actual merge.
- **Not certification-audited** — PCI/HIPAA/SOC2 archetype scaffolds are starting points, not certifications.
- **Not deterministic** — LLM-generated outputs. Every gate verdict should be sanity-checked.

## FAQ (top 5)

**Is my source code used to train models?** No. Claude API zero-retention by default for paying customers. great_cto adds nothing.

**How do you keep token costs down?** Haiku-by-default + Kimi K2 router for triage (60–80% savings) + cost-guard hook.

**Can I disable hooks?** Every hook honors `GREAT_CTO_DISABLE_<NAME>=1`. Per-file secret-scan opt-out: `// great_cto:allow-secrets`.

**What if I'm not solo?** The *engineering* side is built for one person — if you have 2+ engineers who need shared builder boards, you've outgrown it. The *operating* side is multi-user by design: invite as many signers and compliance leads to the operator console as your back office needs (scoped invite links, per-tenant isolation).

Full FAQ: [docs/FAQ.md](docs/FAQ.md).

## Documentation

📚 **[Full documentation hub →](docs/README.md)** — organized by [Diátaxis](https://diataxis.fr/):
**[Getting Started](docs/tutorials/getting-started.md)** · How-to guides ·
[Agents](docs/reference/agents.md) & [Commands](docs/reference/commands.md) reference · [Architecture](docs/ARCHITECTURE.md) · [FAQ](docs/FAQ.md).

## Architecture

The plugin runs inside Claude Code (or any MCP-capable host); 83 agents are markdown specs; tasks live in Beads (dolt, git-native); memory is plain markdown (no vector store). Diagram + stack table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's new

**v2.40–v2.62** (June 2026) — **The autopilot pivot**: GreatCTO becomes *AI autopilots for business* — 25 service-autopilot verticals, each a flow with a measured quality scorecard, an accountable owner, and the runtime invariant that **an irreversible action never executes without a human signature**. 22 live connectors run every vertical on real data. Story: [We pivoted →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63** (June 2026) — **The operator console**: durable runs pause at the human gate and wait in an inbox for a named licensed human; signing executes the write. Role-based access, scoped invites, AI-drafted determinations with evidence, QA sampling, SLA clocks, Ops tab (metering · connector health · dead-letter requeue), WCAG 2.2 AA, light/dark. Story: [The operator console →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65** (June 2026) — **Under the hood**: the dev board becomes a *pult* — approving a gate can spawn a live-streamed agent run; prompt self-improvement gated on held-out evals (SIA-inspired); $0 context compression (CI log 31,475 → 155 chars with the FATAL preserved); Fable 5 support. Story: [June under the hood →](https://greatcto.systems/blog/june-under-the-hood)

[Full changelog →](CHANGELOG.md)

## Roadmap

- **Hosted operator console** — one-command tunnel + custom domain for `great-cto console`, so signers never need localhost
- **Vertical depth over breadth** — push the measured quality scorecard ≥95 on the top-5 autopilots before adding new ones
- **SOC 2 evidence pack** — export the audit trail + gate history in auditor-ready format
- **Multi-model verification** — independent second-model review on irreversible-action gates

[Vote on the next feature →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Author

[avelikiy](https://github.com/avelikiy) — CTO building AI-native trading and fintech platforms (0→1, 1→N). great_cto is the result of automating my own loops, one agent at a time. Every rule appeared in response to a real problem in a real production system.

## Community

| Channel | What |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, feature requests, archetype proposals |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Questions, patterns, show-and-tell |
| 📝 [Blog](https://greatcto.systems/blog/) | Receipts, cost breakdowns, architecture deep-dives |
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
