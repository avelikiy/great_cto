<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

**Describe a product. Approve three things. Open the URL.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](CHANGELOG.md)

[Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · [繁體中文](docs/zh-TW/README.md) · [日本語](docs/ja/README.md) · [한국어](docs/ko/README.md) · [Español](docs/es/README.md) · [Português](docs/pt-BR/README.md) · [Deutsch](docs/de/README.md) · [Français](docs/fr/README.md)

</div>

---

You describe a software product. What lands on your disk is a **repository you
own** and a **URL that already works** — architecture, data model, backend,
frontend, generated tests and the deploy, finished. Not a plan. Not a prototype.

Seven products built end to end in the open benchmark cost a **median of $171**
in tokens. You pay your own LLM provider; great_cto bills you nothing and is MIT.

You are stopped **three times** — on *what* gets built, on *how*, and on *whether
it ships*. Everything between those runs unattended, and it is the pipeline's job
to be worth leaving alone: **69 specialist agents** (architect, design-advisor,
senior-dev, code-reviewer, QA, security, devops) with an independent model
checking each stage's work before the next one builds on it.

```
   describe a product
        │
   🤖  problem framed · options weighed · brief written
        ▼
   👤  checkpoint 1 — approve WHAT gets built
        │
   🤖  architecture · data model · screens · plan
        ▼
   👤  checkpoint 2 — approve HOW it gets built
        │
   🤖  scaffold → backend → frontend → tests → review → security
        ▼
   👤  checkpoint 3 — approve the deploy
        │
   🤖  deployed · repo · live URL
```

<p align="center">
  <img src="docs/screenshots/board.png" alt="The build board — live pipeline, gates, per-agent cost" width="900" />
</p>

The board at `localhost:3141` fills itself in — pipeline state, pending gates,
per-agent cost, 30-day spend. You do not feed it; you check it.

## Numbers, measured

| | |
|---|---|
| One feature, end to end, fully traced | **1h 26m · $3.40** in tokens — [the receipts](https://greatcto.systems/proof) |
| A whole product — 7 built in the open benchmark | median **$171** in tokens · **70/100** quality (58–86) — [reproduce it](docs/benchmarks/BENCH-2026-07-batch1.md) |
| Typical month, 20 pipeline runs | **~$34** — you pay your own LLM provider, nothing else |
| Products it knows how to build | **60**, across 15 US industries, through [6 reusable pipelines](https://greatcto.systems/pipelines) |

The quality score is produced by running each product's own tests, not by
counting files — which is why it says 70 and not a rounder, prettier number.

## Quick start

```bash
npx great-cto init            # Claude Code (default) · add --host codex for OpenAI Codex
```

Restart your AI host, then:

```bash
/start "build a dispatch & scheduling app for an HVAC business"
```

The pipeline takes it from there. Day to day you touch three things:

| | |
|---|---|
| `/start "…"` | describe a product or feature — the pipeline runs it |
| `/inbox` | what needs you: pending gates, P0s, blocked tasks |
| `/digest` | weekly DORA metrics + cost-per-feature roll-up |

Requires Node ≥ 18.17. Companion plugins (Superpowers, Beads) install
automatically. After init, verify the host actually loaded the plugin —
`claude plugin list --json` should show no `errors` for `great_cto`.

## When it asks you

One setting in `.great_cto/PROJECT.md` decides where the pipeline stops:

| `approval-level` | Stops at | Per feature |
|---|---|---|
| `product-only` | what we build · whether it ships | 2 |
| `gates-only` *(default)* | what we build · the design · the deploy | 3 |
| `strict` | + code review | 4 |
| `auto` | nothing | 0 |

`gates-only` gained the product gate in v3.0.0. It used to stop on *how* to build
and *whether* to release, and never on *what* to build — the decision that is
wrong for six stages before anyone finds out. It costs one pause per **product**,
not per feature: `product-owner` is an entry point and runs only from `/start`.

A regulated archetype — fintech, healthcare, gov — keeps its security,
compliance and ship gates **at every level, including `auto`**. A lighter level
delegates judgement; it never skips compliance. Full table: [docs/GATES.md](docs/GATES.md).

## The three doubts worth having

**“I can't trust code I didn't watch being written.”**
Neither do we, so nothing is taken on an agent's word about itself. Each stage is
checked against what it actually produced — do the named files exist, do the
frozen acceptance criteria pass when run, and only then is a separate model asked
whether each requirement is addressed. Where that check cannot tell, it returns
`unverifiable`, which is **not** a pass.

**“It will spend money while I sleep.”**
Per-agent budgets decline to dispatch past their cap and name the number. A run
whose cost could not be measured reads `unmeasured` and holds nothing — a limit
firing on a number nobody measured is worse than no limit, and a confident
`$0.00` for unmeasured work is how a spend goes unnoticed.

**“And then I'm locked in.”**
One command to install, MIT, running on your machine against your own LLM
account. Delete great_cto and the repository it built is still yours — ordinary
Next.js, Postgres and Stripe that any engineer can pick up.

## What makes it different

- **Specialists, not a generalist** — 69 agents with narrow jobs and their own
  review gates, instead of one assistant that types faster than it thinks.
  [The roster →](docs/reference/agents.md)
- **Critics before code** — architecture, spec, and schema critics run before
  planning, where a mistake still costs hours instead of days.
- **Scope enforced at write time** — an agent physically cannot touch files
  outside its brief. Not flagged at review; refused at write.
- **QA that distrusts itself** — critical paths written as Gherkin before test
  code, then mutation testing asks whether the suite would catch anything at all.
- **Memory across sessions** — decisions, lessons, and promoted patterns persist
  per project and globally; an interrupted run resumes knowing which stages ran.
- **Cost you can see** — per-agent spend, estimate-vs-actual drift, and
  cost-per-accepted-change on the board, not in a spreadsheet.
- **Spending caps that refuse** — `agent-budgets:` in PROJECT.md caps what a
  stage may spend, and the pipeline declines to dispatch past it, naming the
  number. An **estimate never refuses**: while no verdict carries a real cost the
  cap reads `unmeasured` and holds nothing, because a limit firing on a number
  nobody measured is worse than no limit. Set and cleared from the board.
- **A stage is checked before the next builds on it** — the pipeline used to
  hand one agent's output to the next on the strength of a line the agent wrote
  about itself. Now a second model (Kimi K3 via OpenRouter) checks it, cheapest
  question first: do the files the verdict names exist, do the frozen
  `## ACCEPTANCE` criteria pass when run, and only then is a model asked whether
  each requirement is addressed. Three answers, never two — `verified`,
  `rework`, or **`unverifiable`**, which is not a pass: an agent that claims
  nothing and freezes no criteria is reported, or the cheapest way to pass
  becomes claiming nothing.
- **Work goes back, and the return has a ceiling** — a stage that fails
  verification returns `REWORK` with the findings quoted, and the agent that just
  ran fixes it. Distinct from `BLOCKED`, which means a human must decide. After
  three passes it stops being the agent's problem and becomes one, because two
  machines handing work back and forth do not get bored.
- **Quality kept apart from what happened** — the verdict says what a run did;
  a *score* says how well, in its own append-only store, produced by a different
  actor at a different time. A re-score appends rather than rewrites, several
  scorers can disagree about one run, and every score names who made it. An
  unassessed run counts as `null`, never zero — a pass rate divides by what was
  actually assessed and reports the rest beside it.
- **Silence is recorded** — the dispatcher writes what it decided to
  `.great_cto/pipeline-runs.jsonl`, *including when it decided nothing* and why.
  Every pipeline defect found this year hid in the gap between "nothing should
  happen" and "nothing could happen".

Everything runs locally, MIT-licensed, on your own keys. Your code stays on your
machine; prompts go to your LLM provider and nowhere else. Telemetry is
**off by default** ([docs/PRIVACY.md](docs/PRIVACY.md)).

## Limitations

- **For one builder** — a solo founder or CTO. Two or more engineers sharing the
  pipeline have outgrown it.
- **Not a CI/CD system** — gates run locally; you still merge through GitHub Actions.
- **Not certification-audited** — PCI/HIPAA/SOC2 scaffolds are starting points,
  not certifications.
- **Not deterministic** — LLM output. Gate verdicts deserve a sanity check.
- **Spend is measured, attribution is not yet per-agent** — cost is read from
  the host's own session transcript rather than from an agent's self-report, so
  the tokens are real. But the transcript the hook is handed covers the session,
  not one subagent, so a run's cost can be attributed to whichever stage finished
  last — inflated by orders of magnitude. Treat per-agent figures as a ceiling
  until this is fixed. A stage with no measurement at all still shows
  `unmeasured` rather than a confident `$0.00`, and budgets do not fire for it.

## Documentation

**[Docs hub →](docs/README.md)** ·
[Getting started](docs/tutorials/getting-started.md) ·
[Gates & approval levels](docs/GATES.md) ·
[Agents](docs/reference/agents.md) · [Commands](docs/reference/commands.md) ·
[Archetypes](docs/ARCHETYPES.md) · [Architecture](docs/ARCHITECTURE.md) ·
[MCP](docs/MCP.md) · [FAQ](docs/FAQ.md) ·
[Everything else](docs/DETAILS.md) — critics, jurisdictions, cost breakdown, CI, alerts

## Community

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[Blog](https://greatcto.systems/blog/) ·
[Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

MIT — [LICENSE](LICENSE). Built by [@avelikiy](https://github.com/avelikiy):
CTO building AI-native trading and fintech platforms; great_cto is my own loops,
automated one agent at a time.

If it saved you time, a star helps other solo builders find it.

<div align="center">

*Stop being the only person who can ship.*

</div>
