# Getting started with great_cto

> **Tutorial** — a guided first run. By the end you'll have great_cto installed,
> a project bootstrapped, and your first feature shipped through the pipeline.
> Time: ~10 minutes. Applies to v2.37+.

great_cto is a Claude Code / Codex plugin that runs an engineering process for you:
agents do architecture, code review, QA, and security — **you make two decisions per
feature** (approve the plan, approve the ship). This tutorial walks the happy path.

---

## Prerequisites

- **Claude Code** (or OpenAI Codex) installed.
- **Node 18+** and **git**.
- A terminal, and a project folder (new or existing).

---

## Step 1 — Install

Run the one-command installer in your project root:

```bash
npx great-cto install
```

It detects your stack, picks an [archetype](../ARCHETYPES.md), installs the plugin +
companions (superpowers, beads), and bootstraps `.great_cto/PROJECT.md`. The installer
is **idempotent** — safe to re-run; it never overwrites an existing `PROJECT.md`.

> **Restart Claude Code** afterwards so it picks up the plugin.

Verify:

```bash
npx great-cto version      # → 2.37.x
```

---

## Step 2 — Tell great_cto about your project

Open `.great_cto/PROJECT.md` and set the basics — goal, archetype, and any compliance
needs (GDPR, PCI-DSS, HIPAA, …). great_cto uses this to choose which **reviewers** load
automatically. For an existing codebase, let it discover the gaps for you:

```text
/audit
```

`/audit` detects the stack, finds architectural/security gaps, and files a prioritized
backlog of [Beads](https://github.com/steveyegge/beads) tasks.

---

## Step 3 — Start a feature

```text
/start "add email magic-link login"
```

This kicks off the pipeline:

```
architect → (domain reviewers) → pm → gate:plan ──▶ YOU APPROVE
  → senior-dev → multi-angle review → qa-engineer → security-officer
  → gate:ship ──▶ YOU APPROVE → devops → deployed
```

The **critics run before the plan**, so design problems surface early — not after the
code is written.

---

## Step 4 — Decision 1: approve the plan (`gate:plan`)

The architect + pm produce an ARCH doc, a task graph, and a cost estimate. great_cto
pauses at **`gate:plan`** and asks for your approval. Review the plan, then approve —
or send it back with a comment. Nothing is implemented until you approve.

---

## Step 5 — Decision 2: approve the ship (`gate:ship`)

`senior-dev` implements task-by-task with TDD, a multi-angle code review runs, then
`qa-engineer` and `security-officer` sign off. great_cto pauses at **`gate:ship`**.
Approve to deploy via `devops`, or block on any finding.

That's the whole loop: **two approvals per feature**, everything else automated.

---

## Step 6 — See what's happening

```bash
npx great-cto board       # Kanban + CTO dashboard at localhost:3141
```

The board shows pending gates, P0 incidents, blocked tasks, DORA metrics, and
cost-per-feature. In Claude Code, `/inbox` summarizes what needs your attention.

---

## What's next

- **How-to guides** — task-focused recipes: [docs hub](../README.md#how-to-guides)
- **Reference** — every [agent](../reference/agents.md) and [command](../reference/commands.md)
- **Why it works this way** — [Architecture](../ARCHITECTURE.md) · [Archetypes](../ARCHETYPES.md)
- **Cost & privacy** — [FAQ](../FAQ.md) · [Privacy](../PRIVACY.md)

Stuck? Open a [discussion](https://github.com/avelikiy/great_cto/discussions) or see the [FAQ](../FAQ.md).
