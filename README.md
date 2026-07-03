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

**You describe the product. great_cto ships it.** Not a snippet, not a scaffold — a real,
deployed application with a backend, a frontend, generated tests, and a live URL. You make
exactly **one decision: approve the spec.** Everything after — architecture, data model,
build, review, deploy — runs unattended. That's the default for reversible work; an
irreversible change — a data-model migration, a payments or auth path, anything that
deletes data — opens additional gates on purpose, because "one decision" should mean
low-risk, not unsupervised.

It's an **AI Product Builder**, not another coding-agent loop. The orchestration layer *above*
the coding agent you already use: a team of specialist agents that plan, build, review, and
gate the work — so one person ships like an engineering org.

> **One real feature: idea → merged PR in `1h 26m` for `$3.40` in LLM cost.** The traditional
> path for the same feature was ~170 hours and ~$42K. [See the full trace →](https://greatcto.systems/proof)

It builds across the top US service industries — home & field services, professional services,
hospitality, retail/e-commerce, proptech, fitness, marketing & creator, HR/recruiting,
construction, logistics — which collapse into **6 reusable build pipelines** (CRUD vertical-SaaS,
booking, CRM, dashboard, marketplace, content/media). One command ships any of **~40 products**.
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

## Under the hood (for the CTO who runs it)

→ *The builder-facing story of this surface: [greatcto.systems/build](https://greatcto.systems/build)*

Every product is built by a pipeline of specialist agents — architect, design-advisor, senior-dev,
QA, security-officer, devops — that runs spec → scaffold → backend → frontend → tests → deploy.
**You make one decision: approve the spec.** Everything after is automated. The pipeline is
risk-tiered — a maintenance fix opens no gate (CI is the gate), a reversible feature opens only the
plan gate, and an irreversible change forces the full set — so ceremony scales with blast radius,
not with paperwork. CI, the build's own generated tests, and a **cross-model review** (a different
model family red-teams the diff, so review isn't blind to its own author's mistakes) are the quality
gate that makes it safe to let the pipeline run to deploy. And approving the spec isn't a one-way
door — if a structural spec error surfaces mid-build, any agent can raise an objection that re-opens
the gate, so a long build is recoverable, not finish-bad-or-restart.

**One gate, where it matters.** Build steps are risk-tiered: a reversible change builds and ships
behind CI; an irreversible one — a production deploy, a schema migration, a new write-capable
integration — escalates to the CTO gate and the frontier model before it runs. You sign the spec
and the high-blast-radius calls; the rest runs straight through, enforced in code, not just policy.

## By the numbers

| | |
|---|---|
| One feature, end to end (real run, fully traced) | **1h 26m · $3.40 LLM** vs ~$42K / ~170h traditional |
| An earlier CLI-feature run, same pipeline | $2.39 LLM vs ~$5,460 human-equivalent; security caught 2 defects QA had passed |
| Monthly cost (20 pipeline runs) | **~$34** |
| Target US industries | **10** (home services · retail · proptech · fitness · HR · …) |
| Buildable products | **~40** across the 10 industries |
| Reusable build pipelines | **6** (CRUD · booking · CRM · dashboard · marketplace · content) |
| Specialist agents | **61** |
| Generated-product quality (measured) | **89/100** across all 6 build archetypes — reproducible `product-score` harness (quality-machinery score; a floor, not deep correctness) |

→ [Full trace with all artefacts](https://greatcto.systems/proof) · [the 6 pipelines](https://greatcto.systems/pipelines)

## How it works

**`npx great-cto init`** — scans your stack and writes `.great_cto/FLOW.md` with the pipeline for your product: the agents, the build archetype, and the single CTO gate.

**`/start "describe the product"`** — architect and design-advisor draft the spec, data model and screens. You review and approve it at the **one gate** — `gate:plan`.

**The pipeline ships it** — senior-dev scaffolds and builds with TDD, QA runs the generated tests, devops deploys. No further approval needed for a reversible build.

## Three products — one pipeline

Same command, different product. The build archetype shapes the stack and integrations:

| | **Dispatch app** | **Class-booking app** | **Profitability dashboard** |
|---|---|---|---|
| Archetype | CRUD vertical-SaaS | Booking / scheduling | Dashboard / analytics |
| Stack | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Integrations | Auth · RBAC | Stripe · Twilio | source connectors |
| Human gates | `gate:plan` (the CTO gate) | `gate:plan` | `gate:plan` |

→ See the 6 pipelines: [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## The dashboard you'll actually check

`great-cto board` opens at `http://localhost:3141` — the build board: realtime SSE, the live pipeline with its risk-tier badge (one CTO gate · cheap judge), per-agent cost, 30-day LLM spend vs human-equivalent baseline.

<p align="center">
  <img src="docs/screenshots/board.png" alt="The build board — live pipeline with the risk-tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="docs/screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>Metrics</b> — tasks shipped, AI spend, cost-savings vs a human team, daily burn</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="docs/screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Memory</b> — browsable project memory layers: PROJECT.md, archetypes, skills, lessons</sub></td>
</tr>
</table>

**Built for the one-person engineering org.** GreatCTO is for the indie hacker, solo founder, or technical CTO who wants to ship real products without a team — running the pipeline on Claude Code or OpenAI Codex, approving one spec, and shipping to a live URL. *Not for multi-dev engineering teams* — see [FAQ](docs/FAQ.md#is-great_cto-for-teams).

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

**Staying up to date:** `npx great-cto@latest` is the zero-maintenance option for occasional use — every run fetches the latest release, nothing to upgrade. If you installed globally (`npm i -g great-cto`), run `great-cto upgrade --self` to update in place — it detects your install (npm/nvm, Volta, pnpm) and upgrades the exact binary you're running.

---

<details>
<summary>📖 Full documentation — one CTO gate · risk-tiering · critics · 61 agents · build archetypes · board · cost · MCP</summary>

## One decision per feature

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

The pipeline is risk-tiered (`change_tier`): a maintenance fix opens **no** gate (CI is the gate), a reversible feature opens **only** `gate:plan`, and an irreversible change forces the full set + the frontier model. Everything between the gate and deploy runs automatically. **Memory persists** between sessions: every gate verdict appends to `~/.great_cto/decisions.md`, every retrospective to per-project `lessons.md`, and `/crystallize` promotes high-impact patterns to a global library agents query before re-solving.

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
| Specialist agents | **61** (architect · design-advisor · senior-dev · code-reviewer · QA · security · e2e-test-engineer · devops · archetype reviewers) | 1 generalist | 1 generalist |
| Build pipeline | spec → CTO gate → scaffold → build → test → deploy | one-shot autonomy | edit loop |
| Human gates | ✅ one — you approve the spec (risk-tiered) | ❌ none | ❌ |
| Memory across sessions | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ thread only | ⚠️ thread only |
| Cost tracking | ✅ per-agent + 30d history + savings_x | ❌ | ❌ |
| Design built in | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
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
/start "build a dispatch & scheduling app for an HVAC business"
# → architect + design-advisor → spec, data model, screens
# → pm → Beads tasks → gate:plan (you approve the spec — the one gate)
# → senior-dev → review → qa → devops → built · tested · deployed

/inbox
# Pending gate · P0 incidents · blocked tasks · stale in-progress

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

## Build archetypes

Every product maps to a **build archetype** that shapes its pipeline — the stack template,
the data shape, the signature integration. The 6 Product Builder archetypes (the ~40 products
collapse into these):

| Archetype | Shape | Stack | Integration |
|---|---|---|---|
| `vertical-saas` | entities · roles · workflow · records UI | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | calendar · availability · reminders · payments | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | contacts · pipeline · automated sequences | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | ingest · metrics · visualization · alerts | Next.js · warehouse-lite · charts | source connectors |
| `marketplace` | two-sided listings · matching · payments | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | catalog · access tiers · delivery · monetization | Next.js · object storage · CDN | Stripe · media pipeline |

Plus the underlying software-kind archetypes (`web-service`, `mobile-app`, `cli-tool`,
`library`, …) the engine auto-detects to tune the build. See [the 6 pipelines](https://greatcto.systems/pipelines).

Full table (26 archetypes) + how detection works: [docs/ARCHETYPES.md](docs/ARCHETYPES.md).

**Deep US coverage** — beyond GDPR/PCI/HIPAA, great_cto now reviews against SEC cyber-disclosure (8-K Item 1.05), CMMC 2.0 / NIST 800-171 for defense contractors, US AI governance (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), web-tracking litigation (VPPA · CIPA · Washington MHMDA), and HMDA / SR 11-7 model risk for lending.

## Domain overlays (optional)

Beyond the build archetype, the engine can auto-attach an optional **domain overlay** when it
detects domain-specific signals (deps, README terms) — adding a specialist reviewer and a few
extra checks for things like voice/telephony, privacy (GDPR/CCPA), or AI governance. They're
opt-in and orthogonal to the build pipeline; most products need none.

## One real run, fully traced

The canonical receipt: **one real feature** shipped through the full pipeline in **1h 26m
wall-clock for $3.40 in LLM cost** — architect → plan → implementation → review → human gate →
merged PR. The traditional path for the same feature: ~170 hours and ~$42K. Every stage
timestamped, every artifact links to a public GitHub PR.

An earlier run on a Python CLI feature ($2.39 vs ~$5,460 human-equivalent) showed the review model working: security caught two real defects QA had passed (`list(stream_csv())` defeated streaming → 14.5 MB peak RSS on 13 MB input).

Full trace + artefacts: [greatcto.systems/proof](https://greatcto.systems/proof).

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

- **Not for multi-dev engineering teams** — one builder is the product; 2+ engineers sharing the pipeline have outgrown it.
- **Not a replacement for senior engineers** — codifies process; doesn't make architectural judgement calls without one.
- **Not a CI/CD system** — gates run locally / in-session. You still need GitHub Actions for actual merge.
- **Not certification-audited** — PCI/HIPAA/SOC2 archetype scaffolds are starting points, not certifications.
- **Not deterministic** — LLM-generated outputs. Every gate verdict should be sanity-checked.

## FAQ (top 5)

**Is my source code used to train models?** No. Claude API zero-retention by default for paying customers. great_cto adds nothing.

**How do you keep token costs down?** Haiku-by-default + Kimi K2 router for triage (60–80% savings) + cost-guard hook.

**Can I disable hooks?** Every hook honors `GREAT_CTO_DISABLE_<NAME>=1`. Per-file secret-scan opt-out: `// great_cto:allow-secrets`.

**What if I'm not solo?** GreatCTO's build pipeline is built for one engineer — if you have 2+ engineers who need shared builder boards and concurrent pipelines, you've outgrown it.

Full FAQ: [docs/FAQ.md](docs/FAQ.md).

## Documentation

📚 **[Full documentation hub →](docs/README.md)** — organized by [Diátaxis](https://diataxis.fr/):
**[Getting Started](docs/tutorials/getting-started.md)** · How-to guides ·
[Agents](docs/reference/agents.md) & [Commands](docs/reference/commands.md) reference · [Architecture](docs/ARCHITECTURE.md) · [FAQ](docs/FAQ.md).

## Architecture

The plugin runs inside Claude Code (or any MCP-capable host); 61 agents are markdown specs; tasks live in Beads (dolt, git-native); memory is plain markdown (no vector store). Diagram + stack table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's new

**v2.74+** (June 2026) — **The Product Builder pivot**: GreatCTO becomes an *AI Product Builder* — describe a software product, approve the spec at one CTO gate, and the pipeline ships it (spec → build → test → deploy). 10 US industries, ~40 products, 6 reusable pipelines. Build gates are risk-tiered (`change_tier`); the regulated runtime surface moved out to [avelikiy/operate](https://github.com/avelikiy/operate). Story: [the strategy](docs/strategy/PRODUCT-BUILDER-DIRECTION.md) · [the 6 pipelines](https://greatcto.systems/pipelines)

**v2.40–v2.62** — **The autopilot pivot**: 25 service-autopilot verticals, each gated on a human signature before any irreversible action. Earlier chapter — see [CHANGELOG.md](CHANGELOG.md).

**v2.46–v2.63** — **The operator console**: a human-in-the-loop inbox for signing off runs. Earlier chapter — see [CHANGELOG.md](CHANGELOG.md).

**v2.37–v2.65** (June 2026) — **Under the hood**: the dev board becomes a *pult* — approving a gate can spawn a live-streamed agent run; prompt self-improvement gated on held-out evals (SIA-inspired); $0 context compression (CI log 31,475 → 155 chars with the FATAL preserved); Fable 5 support. Story: [June under the hood →](https://greatcto.systems/blog/june-under-the-hood)

[Full changelog →](CHANGELOG.md)

## Roadmap

- **Product archetype detection** — pick the build archetype from the product brief, not just the stack
- **Per-industry build templates** — ship a reference product end-to-end through each of the 6 pipelines
- **Tier-aware judge** — a cheap fine-tuned judge on T0/T1 evals, frontier + human on T2 (ADR-004)
- **Headless task-runner** — queue product builds and run them on a VPS, unattended

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
