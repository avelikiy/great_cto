# ADR-004: Tier-aware judge policy (model tier × cost-of-error)

**Status:** Accepted (2026-06-19)
**Date:** 2026-06-19
**Extends:** [ADR-002](ADR-002-model-tier-policy.md) (model tier by agent role)
**Relates:** [ADR-003](ADR-003-two-axis-gate-model.md) (change_tier), great_cto-65y

## Context

ADR-002 picks a model tier by agent **role** (architect→opus, qa→sonnet/haiku, …). That
is one axis. It misses a second: **the cost of the judge being wrong**, which depends on
the **change_tier** (ADR-003), not the role.

A judge/eval/scorer agent (`decision-scorer`, `ai-eval-engineer`, the decision-scoring in
`eval-gate`) on a **T0/T1** change is grading a reversible thing CI also checks — a wrong
"looks good" is cheap (caught downstream, trivially reverted). The same judge on a **T2**
change (irreversible / regulated / prod deploy) gates a decision where a false-APPROVED
carries real liability — there the cost of error is high.

Industry signal (2026-06): a fine-tuned open judge (Qwen-class) now matches or beats a
frontier model on a range of eval benchmarks at **~100× lower cost**. Paying frontier
prices to grade every routine T0/T1 decision is pure overspend; reserving the frontier
(and a human) for the T2 decisions that actually carry liability is the correct split.

## Decision

Add a **cost-of-error axis** to the model policy for judge/eval/scorer roles, keyed off
`change_tier`:

| change_tier | Judge model | Human |
|-------------|-------------|-------|
| **T0 / T1** | cheap — fine-tuned open / `haiku` judge | no |
| **T2 / regulated** | frontier (`opus`/`fable`) | yes (the one CTO gate) |

- Judge/eval/scorer agents are **allowed** the cheap tier by policy (CONS-MODEL): they no
  longer must run `sonnet`+. `decision-scorer` and `ai-eval-engineer` may run `haiku`.
- A T2 change escalates judging back to the frontier model **and** the human gate
  (`effectiveGates` already forces `ship` at T2 — the human is in the loop there).
- The cheap judge is **not** trusted blindly: before a candidate open/cheap judge replaces
  the current one in production scoring, it must be validated against the current judge on
  the project's eval golden-set (the `ai-eval-engineer` owns this regression). Switch only
  on parity-or-better at the lower cost.

This is the judge-side analog of ADR-003: spend reasoning (and money, and human attention)
in proportion to the blast radius of being wrong — not uniformly.

## Consequences

- Direct cost reduction on the highest-frequency LLM calls (routine decision-scoring /
  evals run on most T0/T1 changes). Feeds the autopilot unit-economics (`costPerOutcomeUsd`).
- No safety loss: the frontier+human path is unchanged for T2/regulated — where a wrong
  judgment costs something.
- **Follow-up (not in this ADR):** the runtime model-router that actually selects the judge
  model from the change's `change_tier` at call time, and the `ai-eval-engineer` validation
  harness for qualifying a candidate cheap judge. Tracked separately.
