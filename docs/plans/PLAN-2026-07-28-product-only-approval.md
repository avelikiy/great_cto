# PLAN — `approval-level: product-only`

**Goal:** the pipeline runs end to end on its own and stops the human **only at
business/product decisions** — not at technical ones.

**Status:** in progress · 2026-07-28

## Why

The auto-chaining machinery already exists and is proven: `shared/pipeline.toml`
holds the transition map (product-owner → architect → pm → senior-dev →
code-reviewer → qa+security → devops), `scripts/hooks/pipeline-dispatcher.mjs`
computes the next agent from verdicts and injects a `PIPELINE-NEXT` directive,
and the 2026-07 benchmark ran ten products through it fully unattended.

What is missing is a gate set that matches "ask me only about product". Today:

| Level | Gates | Fit |
|---|---|---|
| `auto` | none | asks nothing — including the product decision |
| `gates-only` (default) | `arch` + `ship` | asks a **technical** question (architecture), never a product one |
| `strict` | `arch` + `code` + `ship` | more technical stopping |
| `expert` | all + 2 checkpoints/agent | the opposite of unattended |

The desired set — `product` + `ship`, nothing technical — has no name, so the
operator is forced to either approve architecture they did not want to review, or
to run with no human decision at all.

The two gates that survive are exactly the two that ADR-009 calls expensive to
undo: **what to build** (wrong answer wastes the whole build) and **shipping it**
(escapes the machine, reaches users).

## Findings that shape the work

1. **Two gate systems exist, and only one is relevant here.**
   - `effectiveGates(archetype, size, tier)` in `packages/cli/src/archetypes.ts`
     — the tiered model (ADR-003/004) over `StandardGate`: plan, arch, code, qa,
     security, compliance, ship, cost, domain reviews.
   - Pipeline gates in `shared/pipeline.toml` — product, arch, plan, ship —
     created as Beads tasks by the agents themselves.

   **`product` is not a `StandardGate`.** It exists only in the pipeline map. So
   this change belongs to the `approval-level` axis (which agents read), not to
   the tier model.

2. **`approval-level` is a prompt-level contract**, read by each agent with the
   same bash snippet and interpreted by a `case` in `skills/great_cto/SKILL.md`.
   Its current outputs are booleans (`SHOW_CHECKPOINTS`, `CREATE_GATES`,
   `GATE_CODE`), which cannot express "these gates but not those".

3. **Mandatory floors must survive.** SKILL.md already states that regulated
   archetypes (`ai-system`, `commerce`, `web3`, `iot-embedded`, `regulated`) get
   a minimum of `strict`, and production deploy checkpoints always show. A new
   level must not become a way to bypass a compliance gate.

## Tasks

| # | Task | Files | Size |
|---|---|---|---|
| T1 | Add `product-only` to the levels table + `case`, expressed as a gate **set** rather than a boolean | `skills/great_cto/SKILL.md` | S |
| T2 | Pure helper `gatesForApprovalLevel(level, {archetype})` so the rule is testable and shared, not re-derived in prose by each agent | `scripts/lib/approval-level.mjs` (new) | S |
| T3 | Tests: product-only keeps product+ship, drops arch/plan/code; regulated floor is not bypassable; unknown level falls back to the default | `tests/lib/approval-level.test.mjs` (new) | S |
| T4 | Teach the agents that create the skipped gates to honour it (`architect` → gate:arch, `pm` → gate:plan) | `agents/architect.md`, `agents/pm.md` | S |
| T5 | Document the one-command flow in the skill's routing table so the operator stops invoking agents by hand | `skills/great_cto/SKILL.md` | XS |

## Acceptance

- `gatesForApprovalLevel('product-only', {archetype:'web-service'})` → `['product','ship']`.
- Regulated archetype under `product-only` still returns its compliance/security floor.
- An unknown or missing level returns the `gates-only` set — a typo must not
  silently disable gating.
- `node --test tests/lib/approval-level.test.mjs` passes; prompt-integrity and
  docs suites stay green.

## Non-goals

- Changing `effectiveGates` or the tier model — untouched.
- Auto-approving anything. `product-only` reduces *how many* questions are asked,
  never who answers them; no gate gains an auto-approve path.
