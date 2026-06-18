# PLAN 2026-06-18 — Gate risk-tiering + reviewer consolidation

**Premise (honest review):** the orchestrator is over-built on **one** axis — the
number of *agents* and the ceremony per change — not on the number of *human gates
before irreversible actions*. We simplify the agent fleet and make build-gates
proportional to **action risk**, while keeping every runtime human gate untouched.

Two non-negotiables:
- **Runtime autopilot gates stay sacred.** `scripts/lib/autopilot-gate.mjs` +
  `packages/board/autopilot-api.mjs` — the per-transaction human gate before an
  irreversible regulated action. *human-gate is the product.* Out of scope here.
- **No loss of review coverage.** Consolidation reduces boilerplate lines, not
  threat coverage. The `REVIEWERS_BY_ARCHETYPE` mapping is correct and stays.

---

## What already exists (don't rebuild)

- Gates are **data, not prose**: `GATES_BY_ARCHETYPE` ([archetypes.ts:1118](../../packages/cli/src/archetypes.ts#L1118)).
- Gates already tier by **project size**: `gatesFor(archetype, size)`
  ([archetypes.ts:1154](../../packages/cli/src/archetypes.ts#L1154)) —
  nano→`[plan]`, small→`[plan,ship]`, medium→all, large/ent→all+compliance.
- Reviewers are **data-mapped + typed**: `REVIEWERS_BY_ARCHETYPE`
  ([archetypes.ts:1081](../../packages/cli/src/archetypes.ts#L1081)),
  `reviewersFor()` ([archetypes.ts:1168](../../packages/cli/src/archetypes.ts#L1168)).
- All 68 reviewers already mount a shared `archetype-review-base` skill.
- Signed-exception waiver system exists: `scripts/lib/gate-check.mjs` +
  `exceptions.mjs` (epic `great_cto-h4p`).

## The actual gap

`gatesFor()` keys off **project_size** — a *static* property of the whole project.
It does **not** key off the **risk of the individual change**. So a `medium`
project opens *every* gate on *every* change, including a one-line maintenance fix.
That is the felt over-ceremony. We add a **second, orthogonal axis** — `change_tier`
— that composes with size.

---

## Workstream 1 — `change_tier` axis (epic)

### Design

`change_tier ∈ {T0, T1, T2}`, classified **per pipeline run / per task**, composed
with the existing size baseline:

| Tier | Meaning | Effective build-gates |
|------|---------|------------------------|
| **T0** | maintenance / fix / docs / test-only — no new external behavior | **0 human gates**; CI + green tests are the gate |
| **T1** | net-new feature, reversible | **`plan` only** (you review intent); CI covers the rest |
| **T2** | irreversible / regulated / deploy-to-prod | **full `gatesFor(archetype,size)`** — never downgraded; `ship` always forced |

**Composition rule** (`effectiveGates(archetype, size, tier)`):
1. `base = gatesFor(archetype, size)`.
2. `T2` → return `base` (+ force `ship`, + `compliance`/`security` if archetype has them). Never downgrade.
3. `T1` → `base ∩ {plan}` **plus** any archetype-mandatory floor (regulated/fintech/healthcare keep `security`+`compliance` even on a feature).
4. `T0` → `[]` **unless** a T2-trigger is present (then escalate to T2 — see auto-classify).

**Hard floor (cannot be tiered away):** if the change touches a regulated/irreversible
surface, `security` + `compliance` + `ship` are mandatory regardless of tier. This is
what makes downgrading safe.

### Auto-classification (signals → tier)

- **T2 triggers (any ⇒ T2):** `migrations/` touched · a new connector with a `write`
  capability (ties to `great_cto-nl5`) · `flows/*.flow.json` step targeting an
  irreversible op · deploy target = production · `_domains.json` / pricing / auth surface.
- **T0 signals (all ⇒ T0):** only `tests/**`, `docs/**`, `*.md`, comments, or config
  with no `src/**` behavior delta.
- **Default:** T1.
- **Explicit override:** beads label `tier:t0|t1|t2` on the task wins over auto.

This is the **build-side analog** of `great_cto-34g` (runtime volume/scope-aware
escalation) — keep the two consistent but separate.

### Tasks
1. `archetypes.ts`: add `ChangeTier` type + `effectiveGates(archetype, size, tier)` (pure, exported). **TDD first** — table tests for every (size × tier × archetype-floor) cell.
2. Auto-classifier `scripts/lib/change-tier.mjs`: `classify({changedFiles, connectors, deployTarget, labels}) → tier`. Pure + unit-tested against fixture diffs.
3. Wire into the orchestrator trigger (`flow.ts` / `scripts/autopilot.mjs`) so it calls `effectiveGates` instead of `gatesFor` directly; classifier runs at pipeline start.
4. Surface the tier on the board (badge per run) + in `/doctor`.
5. Docs: `docs/GATES.md` new section "Risk tiers"; ADR-003 recording the two-axis model.

### Acceptance
- A docs-only change in a `medium` project opens **0** gates.
- A new write-connector in any archetype forces **T2 → full gates incl. `ship`** even if labelled `tier:t0` (floor wins; log the escalation).
- Existing `gatesFor` behavior unchanged when tier = T2 (back-compat: tier defaults to T2 when unknown → safe).

---

## Workstream 2 — reviewer fleet consolidation (epic)

**Finding:** 68 reviewer `.md` files, ~11.9k lines, ~40% boilerplate (YAML
frontmatter, identical skill mounts, "Step 0 read ARCH" logic, threat-model
scaffold, severity-table skeleton). ~60% is genuinely vertical-specific and must stay.

**Strategy:** lean harder on the existing `archetype-review-base` skill; reduce each
reviewer to **domain-only** (~70–100 lines from ~180–200). No mapping change, no
coverage change.

### Tasks
1. Audit: extract the exact shared block (diff 3 reviewers — pci/ai-security/cli) → define the canonical base in `archetype-review-base`.
2. Move all boilerplate (frontmatter defaults, skill mounts, Step-0, TM scaffold, sign-off table) into the base skill; leave reviewers with only: `name`/`description`, domain threat categories, deep-dive methodology, domain checklist.
3. Migrate reviewers in waves of ~10; after each wave run `scripts/agent-prompt-lint.mjs` + the agent-prompt-integrity test to prove no structural regression.
4. Add a lint rule: a reviewer `.md` over N lines or re-declaring base boilerplate fails CI (prevents regrowth).

### Acceptance
- Reviewer line-count down ≥50% (~6k lines removed); `agent-prompt-integrity.test.mjs` green; `REVIEWERS_BY_ARCHETYPE` untouched; spot-check 3 reviewers still emit identical TM-{slug}.md sections.

---

## Sequencing
WS1 and WS2 are independent — run in parallel. WS1 ships behind a default-safe
fallback (unknown tier → T2 → today's behavior), so it can land incrementally
without a flag-day. Land WS1.1 (pure `effectiveGates` + tests) first; it's the
keystone and risk-free.

## Out of scope (explicitly)
- Runtime autopilot gates (B) — untouched.
- `REVIEWERS_BY_ARCHETYPE` / archetype detection — correct, stays.
- The signed-exception system (`great_cto-h4p`) — complementary; T0 auto-skip is the
  *automatic* counterpart to a *manual* signed waiver. Note the overlap, don't merge.
