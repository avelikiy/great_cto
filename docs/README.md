# great_cto documentation

The docs are organized by the [Diátaxis](https://diataxis.fr/) model — find what you
need by **what you're trying to do**:

| If you want to… | Go to |
|---|---|
| **Learn** great_cto from scratch | [Tutorials](#tutorials) |
| **Do** a specific task | [How-to guides](#how-to-guides) |
| **Look up** an agent, command, or setting | [Reference](#reference) |
| **Understand** why it works this way | [Explanation](#explanation) |

New here? Start with **[Getting Started](tutorials/getting-started.md)**.

---

## Tutorials

Learning-oriented, start-to-finish walkthroughs.

- **[Getting Started](tutorials/getting-started.md)** — install → bootstrap → ship your first feature in ~10 min.

## How-to guides

Task-focused recipes (assume you already know the basics).

- [Configure git hooks](HOOKS.md) — pre-push leak scan, summary freshness, SessionEnd learning.
- [Set up MCP servers](MCP.md) — LLM router (OpenRouter/Kimi), Grafana, and other MCP integrations.
- [Override an agent's model](agent-model-override.md) — per-agent model/effort tuning.
- [Run the smoke test](smoke-test.md) — verify an install end-to-end.
- [Use the board API](BOARD-API.md) — drive the Kanban/dashboard programmatically.

> Planned: `how-to/add-archetype.md`, `how-to/custom-agent.md`, `how-to/ci-integration.md`.
> Contributions welcome — see [CONTRIBUTING](../CONTRIBUTING.md).

## Reference

Information-oriented, exhaustive lookups. **Auto-generated** pages stay in sync with source.

- **[Agents](reference/agents.md)** — all 57 agents (model, effort, purpose). _auto-generated_
- **[Commands](reference/commands.md)** — all user-invocable `/commands`. _auto-generated_
- [Archetypes](ARCHETYPES.md) — the 25 project archetypes and the pipelines they select.
- [Agent lint rules](AGENT-LINT-RULES.md) — the rules `agent-prompt-lint.mjs` enforces.
- [Help card](help-card.md) — one-page cheat sheet.

> Regenerate the auto pages: `node scripts/gen-docs-reference.mjs`
> (CI guard: `node scripts/gen-docs-reference.mjs --check`).

## Explanation

Understanding-oriented background and rationale.

- [Architecture](ARCHITECTURE.md) — how the pipeline, gates, and agents fit together.
- [Continuous learning](LEARNING.md) — lessons → decisions → global patterns (the self-improvement loop).
- [Privacy](PRIVACY.md) — what data leaves your machine (and what never does).
- [FAQ](FAQ.md) — top questions on cost, models, and scope.

---

## Project meta

- [README](../README.md) — overview, install, by-the-numbers.
- [CHANGELOG](../CHANGELOG.md) — release history.
- [CONTRIBUTING](../CONTRIBUTING.md) · [SECURITY](../SECURITY.md) · [NOTICE](../NOTICE.md)

## Translations

Localized READMEs: [de](de/) · [es](es/) · [fr](fr/) · [ja](ja/) · [ko](ko/) · [pt-BR](pt-BR/) · [ru](ru/) · [zh-CN](zh-CN/) · [zh-TW](zh-TW/)

## Internal / working docs

`adr/` (decisions) · `plans/` (implementation plans) · `architecture/` · `benchmarks/` ·
`qa/` · `security/` · `testing/` · `validation/` · `design/` · `analysis/` · `operations/` ·
`launch/` · `marketing/` · `blog/` · `superpowers/` — these are maintainer-facing and not part of the user docs surface.
