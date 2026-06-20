# Build-pipeline quality assessment (2026-06-19)

Structured **readiness** scoring of the 6 Product Builder pipelines on a 0–100 scale.

> **Scope caveat (important):** this is a *readiness* rubric, not a measured build quality. No
> pipeline has been **exercised end-to-end** (i.e. no real product was built through it and graded).
> Doing that — one reference build per archetype through the live SDLC agents — is the deferred
> expensive path. These scores say "how ready is the pipeline to run well", not "how good is its
> output". The single biggest way to raise confidence is to ship one reference product per pipeline.

## Rubric (weights)

| Dimension | Pts | What it measures |
|---|---|---|
| Single-CTO-gate correctness | 25 | `effectiveGates(a, medium, T1) = [plan]` and T0 = `[]` — the one-gate promise |
| Engine wiring | 20 | present in GATES/REVIEWERS/ARCHETYPE_TITLE/COST/UI_BEARING + type union |
| Pipeline definition | 15 | the 6 stages defined with agents · skills · tools |
| Product coverage | 10 | # of the 40 products it serves + generated /build pages |
| Design integration | 10 | UI-bearing → design-advisor + ui-ux-pro-max in the build |
| Stack / integration fit | 10 | sensible stack + signature integration for the archetype |
| Verification | 10 | tests prove the gate/flow behavior (caps at 8 — no end-to-end build proven) |

## Scores

| Pipeline | Products | Single gate | Score | Notes |
|---|---|---|---|---|
| **A1 vertical-saas** (CRUD) | 12 | ✅ `[plan]` | **88** | Cleanest + widest coverage; fully wired; not yet exercised |
| **A3 crm + nurture** | 7 | ✅ `[plan]` | **84** | Clean; sequences/queue add build complexity |
| **A6 content / media** | 7 | ✅ `[plan]` | **83** | Clean; storage/CDN/monetization is the hardest build |
| **A2 booking / scheduling** | 6 | ✅ `[plan]` | **85** | Clean; Stripe + Twilio integration well-scoped |
| **A4 dashboard / analytics** | 4 | ✅ `[plan]` | **82** | Clean; smaller coverage; source-connector breadth untested |
| **A5 marketplace-lite** | 4 | ✅ `[plan]` | **88** | FIXED 2026-06-19 (great_cto-dei): distinct `marketplace-lite` archetype, clean single gate. |

**Average readiness: 85 / 100** (was 82; marketplace fixed great_cto-dei → 68→88).

## Key findings

1. **marketplace breaks the one-gate promise (the −20 outlier).** Five archetypes resolve to the
   clean single CTO gate; `marketplace` inherits the pre-pivot `marketplace` archetype's
   `security` + `compliance` floor, so even a reversible feature opens 4 gates. **Fix:** either add
   a distinct `marketplace-lite` archetype with the non-regulated baseline `[plan, qa, ship]`, or
   drop `security`/`compliance` from `GATES_BY_ARCHETYPE["marketplace"]` for the Product Builder
   use. Low effort, +~20 to A5.

2. **All 6 are well-defined + fully wired** — type union, GATES/REVIEWERS/TITLE/COST/UI_BEARING,
   the shared 6-stage pipeline (agents · skills · tools), 40 product pages + the pipelines page,
   and effective-gates/flow tests. The scaffolding is solid.

3. **None is exercised end-to-end.** The pipelines are *defined and gated*, but no product has been
   *built* through them. Readiness ≠ output quality. The flow stages (S2 scaffold → S7 deploy)
   are described, not yet implemented as a runnable archetype builder.

## Recommended next steps (to turn readiness into measured quality)

1. **Fix marketplace** (above) — restores the one-gate promise across all 6.
2. **Ship one reference product per pipeline** through the live agents (e.g. a dispatch app for A1,
   a class-booking app for A2). Grade the actual output (compiles · tests green · deploys · matches
   spec) — that converts these readiness scores into measured build-quality scores.
3. **Build a pipeline-eval harness** — a per-archetype golden build + a rubric, run in CI, so the
   score is continuous, not a one-off.
