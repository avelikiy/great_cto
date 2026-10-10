<div align="center">

<img src="docs/screenshots/logo.svg" alt="great_cto" width="280" />

**Ship products with the coding agent you already have.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](CHANGELOG.md)

[Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · [繁體中文](docs/zh-TW/README.md) · [日本語](docs/ja/README.md) · [한국어](docs/ko/README.md) · [Español](docs/es/README.md) · [Português](docs/pt-BR/README.md) · [Deutsch](docs/de/README.md) · [Français](docs/fr/README.md)

</div>

---

**Your coding agent ships code. This is what checks it.**

Describe a product or a feature. **72 agents** with narrow jobs take it through
brief, architecture, build, review and security; a second model from another family
reads the same diff. Three decisions stay yours — what gets built, how, and
whether it ships — and what lands is a **repository you own** and a **URL that
works**. You pay your own LLM provider; great_cto is MIT and bills nothing.

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

<p align="center">
  <img src="docs/screenshots/board.png" alt="The board at localhost:3141" width="900" />
</p>

The board at `localhost:3141` opens on **Work** — your tasks, the decisions
waiting on you, and what already shipped. Cost, agents and reviewers are under
**Tools**. Nothing on it renders an absence as a pass: a check that could not
decide reads `unverifiable`, a cost nobody measured `unmeasured`, a reviewer
that could not run `unavailable`.

## On OpenAI Codex

`npx great-cto init --host codex` gives Codex the skills, the MCP server and six
safety guards as plugin hooks (approve them once: run `codex` in a terminal and
choose **Trust all and continue**). Codex has no native plugin surface for slash
commands or role agents, so the pipeline runs through the CLI instead:

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
| Typical month, 20 pipeline runs | **~$34** — you pay your own LLM provider, nothing else |

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
