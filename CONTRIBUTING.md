# Contributing to great_cto

We accept PRs of every size — from a typo fix to a full new domain reviewer. Below is the **lowest-bar way** to contribute for each common pattern. Pick the one that matches what you want to do; each is a 1-file change.

> First time? Look for the [`good-first-issue`](https://github.com/avelikiy/great_cto/labels/good-first-issue) label.
> Want bigger scope? [`help-wanted`](https://github.com/avelikiy/great_cto/labels/help-wanted) tracks medium tasks; [`epic`](https://github.com/avelikiy/great_cto/labels/epic) tracks multi-PR projects.

---

## Quickstart

```bash
git clone https://github.com/avelikiy/great_cto.git
cd great_cto
npm install
npm test                       # ~30s
npm run build                  # produces dist/ for the CLI
node packages/board/server.mjs --no-open    # board on :3141 — used in PRs that touch the dashboard
```

Local install pointing at this checkout:
```bash
npm link
great-cto --version            # confirms your local build is on PATH
```

---

## Patterns — pick the one that matches your contribution

Each pattern is **1 file** (sometimes 2 — the agent + one fixture/test). Follow the contract; CI does the rest.

### 1. Add a new project archetype

When to use: there's a new kind of product great_cto should detect and gate (e.g. `crypto-defi`, `voice-ai`, `local-llm-app`).

**File:** `packages/cli/src/archetypes/{slug}.ts`
**Pattern:**
```ts
import type { Archetype } from "./types";

export const cryptoDefi: Archetype = {
  slug: "crypto-defi",
  description: "DeFi protocol / smart contracts + UI",
  signals: [
    { kind: "file-glob", glob: "**/contracts/**/*.sol", weight: 10 },
    { kind: "package-json", deps: ["hardhat", "foundry-rs", "viem"], weight: 8 },
    { kind: "title-keyword", keywords: ["defi", "amm", "vault", "lending"], weight: 4 },
  ],
  pack: "great-cto-pack/packs/crypto-defi.yaml",
  reviewers: ["oracle-reviewer", "security-officer"],
};
```
**Test fixture:** `packages/cli/tests/fixtures/{slug}/` — a minimal repo with the signals you listed. CI runs detection against it and asserts your archetype wins.

**Reading list:** [`packages/cli/src/archetypes/`](packages/cli/src/archetypes/) — copy the closest existing one.

---

### 2. Add a new domain reviewer agent

When to use: a vertical has specialised compliance / threat-model concerns the generalist `security-officer` doesn't cover (FDA SaMD, GLP, biosecurity, robotics, etc.).

**File:** `agents/great_cto-{slug}-reviewer.md`
**Pattern:**
```markdown
---
name: clinical-ai-reviewer
description: FDA SaMD / Class II reviewer. Activates for archetype: clinical-ai. Produces TM-{slug}.md covering 21 CFR 820, IEC 62304, ISO 14971, predicate device justification, software-level safety classification (A/B/C), 510(k) eligibility.
model: sonnet
applies_to: [clinical-ai, healthcare]
tools: Read, Write, Edit, Glob, Grep, WebFetch, advisor_20260301
maxTurns: 20
timeout: 600
color: red
---

You are the **Clinical AI / SaMD Reviewer** — pre-implementation reviewer for products that fall under FDA's Software as a Medical Device (SaMD) framework.

## When you're invoked
- archetype: clinical-ai
- Any feature that produces a clinical decision output

## What you produce
docs/sec-threats/TM-{slug}.md, sections 1-N as listed below.

## Workflow
[3-7 steps, each a header + bullets]
```

**Reading list:** Pick the closest existing reviewer in [`agents/`](agents/) — e.g. `great_cto-gov-reviewer.md` for regulatory, `great_cto-pci-reviewer.md` for compliance-heavy.

---

### 3. Add a new stack adapter

When to use: support a new coding-agent CLI besides Claude Code / Codex / Cursor / Aider / Continue / Cline (e.g. Gemini CLI, Hermes, OpenCode).

**File:** `packages/cli/src/adapters/{slug}.ts`
**Pattern:**
```ts
import type { Adapter } from "./types";

export const geminiCliAdapter: Adapter = {
  slug: "gemini-cli",
  binaries: ["gemini"],
  configFile: ".gemini/config.json",
  writeConfig(ctx) {
    // Translate ctx.agents/skills/hooks into Gemini's native config shape.
    // Use only the shared AGENTS.md as source of truth.
  },
  detect() {
    return commandExists("gemini") && hasFile(".gemini/config.json");
  },
};
```
**Test:** add a `tests/fixtures/{slug}/` fixture with the binary mocked + an expected config snapshot.

---

### 4. Add a new skill

When to use: a single, reusable behavior used by 2+ agents (e.g. `well-architected`, `discovery`, `pre-mortem`).

**File:** `skills/{slug}/SKILL.md`
**Pattern:**
```markdown
---
name: well-architected
description: Six-pillar AWS Well-Architected review applied to the proposed architecture. Returns a list of pillar-by-pillar risks ranked by impact.
when: After ARCH draft, before pm runs.
inputs: ARCH-{slug}.md (current draft)
outputs: A bullet list per pillar (operational excellence, security, reliability, performance efficiency, cost optimization, sustainability).
---

# Steps
1. Read the ARCH draft.
2. For each pillar, ask: where is the chosen approach weak?
3. Rank risks high/med/low by blast radius.
4. For each high-impact risk, name the mitigation cost (small/medium/large).
5. Return ≤8 items total (cap noise).
```

---

### 5. Add a new language to the README switcher

When to use: you can produce a quality translation for a market we don't cover.

**File:** `docs/{locale}/README.md`
**Pattern:** copy `docs/ru/README.md` (current most-complete locale) and translate. Keep the comparison table; localise headings and prose; keep code blocks and command names verbatim.

Then add to the language switcher row in the main [README.md](README.md):
```diff
- [Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · ...
+ [Русский](docs/ru/README.md) · [简体中文](docs/zh-CN/README.md) · ... · [Italiano](docs/it/README.md)
```

---

### 6. Report a bug

**File:** open a GitHub issue using the `bug-report` template.

Required for fast triage:
- great_cto version (`great-cto --version`)
- Coding-agent CLI you're using (`claude --version` / `codex --version` / `cursor-agent --version` / ...)
- Reproducer: 3-5 shell commands that get a fresh shell to the failure
- Expected vs actual output

Tagged `needs-triage`; we usually respond within 48h.

---

### 7. Fix a typo / improve docs

Just open a PR. No tests required for `docs/**`, `*.md`, or `README.md`. CI will skip the heavy jobs.

---

## PR conventions

| Field | Rule |
|---|---|
| Title | English, ≤80 chars, conventional commits prefix (`fix:` / `feat:` / `docs:` / `chore:`) |
| Description | English, three sections: **Summary** (1 paragraph) · **Changes** (bullets) · **Test plan** (checkboxes) |
| Branch | `<github-handle>/<short-slug>` — e.g. `alice/add-it-locale` |
| Tests | New features require ≥1 test or fixture. Bug fixes require ≥1 regression test. Docs-only PRs need neither. |
| Reviewer | None required for `docs/**` and `good-first-issue`. Other PRs: at least 1 maintainer approval. |

We sign commits via `git config commit.gpgsign` — not required for contributors. Don't use `--no-verify` to bypass hooks.

---

## What we want vs. what we don't

**Yes please:**
- New archetypes for verticals we don't cover (`crypto-defi`, `voice-ai`, `local-llm-app`, …)
- New domain reviewers (FDA SaMD, robotics safety, climate MRV, …)
- New stack adapters (Gemini CLI, Hermes, OpenCode, Qwen, …)
- i18n READMEs (any locale with a native-speaker translator)
- Bug fixes with regression tests
- Performance fixes with before/after numbers
- Documentation improvements

**No thanks:**
- "Add badge to README" / vanity edits with no substance
- Refactors of code that's working ("I would write this differently")
- Adding dependencies for problems we don't have
- Removing features without an issue discussion first
- Single-line "drive-by" PRs (Hacktoberfest-style noise)
- Auto-translated content with no human review

PRs that match "No thanks" patterns will be closed without merge. We aim to keep contributor signal high — we want 200 real PRs/year, not 2000 drive-by ones.

---

## Architecture orientation

Three short reads, in order:

1. [README.md](README.md) — what the product does.
2. [AGENTS.md](AGENTS.md) — how the bd-driven workflow works (for both humans and AI agents).
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code layout, package boundaries, where each archetype lives.

After that, pick a pattern above and ship something small.

---

## Local development tips

- **Don't bypass hooks.** `--no-verify` is forbidden; the pre-commit hooks catch real issues.
- **Use the board.** `great-cto board` opens [http://localhost:3141](http://localhost:3141). For board-touching PRs, attach a screenshot of the board state before/after.
- **Test on a real repo.** `npm link` to point your shell at your local build, then run `great-cto init` in a throwaway directory.
- **Beads is real.** Tasks live in `.beads/`. Use `bd ready` / `bd show` / `bd close` — don't try to track work in your head.

---

## Where to ask questions

- [Discussions](https://github.com/avelikiy/great_cto/discussions) — design questions, ideas, feature requests
- [Discord](https://discord.gg/greatcto) — fast feedback, paired-coding sessions
- Issues — only for confirmed bugs or accepted features in progress

Don't email maintainers directly with feature requests — file a Discussion so the answer is searchable for the next person asking.

---

## Maintainer commitment

For PRs that follow the patterns above:
- **First response:** ≤48h (≤24h for `good-first-issue`).
- **First review:** ≤7 days.
- **Merge or final decision:** ≤14 days (or we tag `needs-author` if the ball is in your court).

If you've been waiting longer, ping the PR — assume we missed it, not that we're ignoring.
