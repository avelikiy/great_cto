<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

**See the work. Trace the decisions.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="docs/screenshots/execution.png" alt="Controller-recorded execution graph in the actual 3.70 interface. Isolated synthetic project with offline stub responses, not live models." width="900" />

*Actual 3.70 interface. The graph uses an offline controller run with stub responses, not live models.*

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](CHANGELOG.md)

[Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · [繁體中文](docs/zh-TW/README.md) · [日本語](docs/ja/README.md) · [한국어](docs/ko/README.md) · [Español](docs/es/README.md) · [Português](docs/pt-BR/README.md) · [Deutsch](docs/de/README.md) · [Français](docs/fr/README.md)

</div>

---

**Keep the task, its checks and your next decision connected.**

great_cto coordinates Claude Code workflows and experimental controlled Codex
runs through explicit stages, review and gates. The local board brings tasks,
recorded execution, project documents and consumption into one workspace.
Missing evidence stays unknown; a successful worker is not proof that a task
was accepted, merged or deployed. You use your own provider account;
great_cto is MIT and bills nothing.

Project focus presents eight core roles plus the selected project's required
reviewers. The full 72-role catalog remains available. Catalog availability is
not proof of execution or expertise.

## Quick start

```bash
npx great-cto init
```

Restart Claude Code. Day to day there are three things:

| | In Claude Code | In the terminal |
|---|---|---|
| **Start work** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **See what needs you** | `/inbox` | `great-cto status` |
| **Continue** | `/resume` | `great-cto resume` |

`/start` takes a new product or a task in an existing project and picks the
workflow itself. `/resume` continues only what you already approved; a pending
decision still waits for you. Everything else — `/review`, `/spec`, `/save`,
`/digest` and the rest — is there when you need it:
[all commands](docs/COMMANDS.md).

## One project, five views

Run `great-cto board` to open the local board, normally at `localhost:3141`.
Readings such as `unverifiable`, `unmeasured` and `unavailable` are not passes.

| View | What you can inspect |
|---|---|
| **Work** | Tasks, acceptance criteria, the next supported action, and Overview / Execution / Evidence tabs |
| **Decisions** | Pending decisions and existing gate controls, without broadening their authority |
| **Knowledge** | Read-only project Markdown, ADRs and a bounded diagram viewer with Mermaid source fallback |
| **Insights** | Recorded task outcomes, project-scoped token consumption, estimates and budgets kept separate |
| **Settings** | Executors, Runtime, Capabilities and General controls |

<details>
<summary>See recorded execution, evidence, project knowledge and outcomes</summary>

![Controller-recorded graph across Codex and Claude Code routes. Synthetic offline sample, not a live-model benchmark.](docs/screenshots/execution.png)

Execution shows controller-recorded causal history for controlled runs, including
attempts, checks, verification, gates and repair. Native and legacy sessions stay
partial or unavailable; missing edges are not inferred. This is not a live terminal
or workflow editor. The sample graph comes from offline stub responses, not models.

![Task evidence separates recorded observations from unknown checks, review provenance and runtime health.](docs/screenshots/evidence.png)

A role verdict is not independent-review proof. Merge, release and deployment
need their own evidence; unknown is not zero or pass.

![Knowledge displays a sample architecture document and declared flowchart, not live execution.](docs/screenshots/knowledge.png)

Documents keep their original language. The application interface is English.
The diagram describes declared architecture, not a running task.

![Insights shows sample task metadata while cost per accepted task remains unavailable.](docs/screenshots/insights.png)

These screenshots use isolated synthetic ACME records. They do not measure
host quality, acceptance rate or quality uplift. [Capture contract](docs/reference/public-showcase.md).

</details>

## Eight core roles, task-dependent specialists

| Responsibility | Role |
|---|---|
| Problem and acceptance | `product-owner` |
| System design and tradeoffs | `architect` |
| Plan and dependencies | `pm` |
| Implementation | `senior-dev` |
| Independent code review | `code-reviewer` |
| Verification and regressions | `qa-engineer` |
| Risk and ship gate | `security-officer` |
| Authorized deployment | `devops` |

These are responsibility contracts, not eight mandatory model calls or eight
concurrent agents. Project focus is a presentation view; it does not remove
specialists, change dispatch or waive required checks. Risk-specific reviewers
remain governed by project policy.

## Focused engineering context

Five versioned, opt-in domain pack candidates cover four focus areas:

| Area | Engineering invariants | Boundary |
|---|---|---|
| **Money & crypto execution** | Payment idempotency, ambiguous sends, scoped authority; signing boundaries, paper/live separation and chain finality | Two technical packs; no investment-performance claim |
| **Telemedicine workflows** | Clinician authority, prescription state transitions and evidence integrity | No clinical efficacy or certification claim |
| **Venture evidence** | Claim provenance, entity lineage and quarantine of unverified assertions | No investment-outcome claim |
| **Mental wellbeing safety** | Subject isolation, crisis escalation precedence and clinical-claim boundaries | Separate from diagnosis, treatment and clinical validation |

Packs add engineering context. They do not broaden permissions or change
required-reviewer routing. Their presence does not prove invocation, expertise
or better outcomes. No quality uplift from matched core-versus-pack trials is
established. Private project overlays are not part of the public showcase.

## On OpenAI Codex

There are three distinct modes, not identical native integrations:

| Mode | Execution and authority |
|---|---|
| Claude Code native pipeline | Native commands, specialist roles and hooks; decisions stay in the linked host |
| Controlled Codex / mixed-host pipeline (experimental) | Controller-owned role routing, validated text proposals, verifier and explicit gates |
| Codex plugin in an ordinary session | Skills, MCP and safety hooks; installation alone does not start the controlled pipeline |

Mixed runs can assign roles to either CLI. Eligible review joins can inspect
the same frozen tree concurrently; this is **not two writers editing the same
worktree**. Both CLIs must be installed and authenticated. See the
[host guide](docs/HOST-CODEX.md) for routing, recovery and manual-action boundaries.

`npx great-cto init --host codex` gives Codex the skills, the MCP server and six
safety guards as plugin hooks (approve them once: run `codex` in a terminal and
choose **Trust all and continue**). An ordinary Codex plugin session does not
automatically run this project's native Claude command/role lifecycle.
The Codex installation has no native plugin surface for these slash commands
or role agents. The remaining Claude workflow hooks do not silently run there.
Start the controlled pipeline through the CLI instead:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Plugin refresh is explicit by default (`great-cto upgrade codex`). On macOS,
`sh scripts/codex-auto-update.sh enable` opts into a six-hour per-user timer;
`status` inspects it and `disable` removes it. Each tick validates the Git
marketplace origin before asking Codex to upgrade. It follows the configured
Git ref, not npm releases, and changed hooks still need host review in a new
session. Details, mixed runs and Codex as the second reviewer:
[Codex host guide](docs/HOST-CODEX.md).

## When it stops you

One line in `.great_cto/PROJECT.md`:

| `approval-level` | Stops you at | Stops |
|---|---|---|
| **`ship-only`** | **the deploy — and briefs you on what gets built** | **1** |
| `product-only` | what we build · whether it ships | 2 |
| `gates-only` *(default)* | what we build · the design · the deploy | 3 |
| `strict` | the design · code review · the deploy | 3 |
| `auto` | nothing in the pipeline | 0 |

Regulated products — fintech, healthcare, gov — keep their security, compliance
and ship gates at every level. [How the gates work](docs/GATES.md).

## Numbers, measured

| | |
|---|---|
| One feature, end to end, fully traced | **1h 26m · $3.40** in tokens — [the receipts](https://greatcto.systems/proof) |
| A whole product — 7 built in the open benchmark | median **$171** in tokens · **70/100** quality, measured **2026-07-10** — [reproduce it](docs/benchmarks/BENCH-2026-07-batch1.md) |

These are historical observations, not a benchmark of the current two-host
pipeline or domain packs. No quality-uplift percentage is established.
Domain packs remain opt-in; their presence does not prove expertise or better outcomes.

## Limitations

For one builder, not a team; not a hosted app builder — it needs your coding
agent; not a CI/CD system; compliance scaffolds are starting points, not
certifications; LLM output is not deterministic. The honest version of each,
and what it refuses to claim: [docs/DETAILS.md](docs/DETAILS.md).

## Learn more

[Docs](docs/README.md) · [Getting started](docs/tutorials/getting-started.md) ·
[Commands](docs/COMMANDS.md) · [Gates](docs/GATES.md) · [Agents](docs/reference/agents.md) ·
[FAQ](docs/FAQ.md) · [Everything else](docs/DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [Security](SECURITY.md) ·
[Contributing](CONTRIBUTING.md) · [Privacy — telemetry is off by default](docs/PRIVACY.md)

MIT — [LICENSE](LICENSE). Built by [@avelikiy](https://github.com/avelikiy).
If it saved you time, a star helps other solo builders find it.
