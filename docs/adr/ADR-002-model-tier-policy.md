# ADR-002: Model-tier policy for agent prompts

**Status:** Accepted (v2.7.0)
**Date:** 2026-05-09
**Supersedes:** ad-hoc model field per agent (v2.6.0 and earlier)

## Context

Each agent in `agents/*.md` declares a `model:` field in frontmatter. Until
v2.6.0 this was author-discretionary, leading to two failure modes:

1. **Overspend** — `continuous-learner` (a session-end summarizer with
   fixed-shape output) running on `opus` cost ~5× more than necessary per
   invocation. Across an active project's 50–100 daily session ends, this is
   real money.

2. **Underpower** — `architect` (cross-cutting decisions, ADR generation,
   Well-Architected review) running on `haiku` produced shallow output. Hard
   to detect from prompt linting alone, but obvious in chat-session traces.

Without an explicit policy, drift was inevitable: each new agent author picked
a tier from intuition, and review of model fit didn't happen at PR time.

## Decision

We define a per-role tier policy enforced by `agent-prompt-lint.mjs` rule
**CONS-MODEL** (warn-level in v2.7.0, error-level in v3.0):

| Role | Allowed tiers | Rationale |
|---|---|---|
| `architect` | `opus` \| `sonnet` | cross-cutting reasoning, ADRs |
| `senior-dev` | `sonnet` \| `opus` | code authoring + multi-file refactor |
| `security-officer` | `sonnet` \| `opus` | security audit reasoning |
| `ai-prompt-architect` | `sonnet` \| `opus` | prompt design with jailbreak analysis |
| `ai-security-reviewer` | `sonnet` \| `opus` | OWASP LLM Top 10 threat modelling |
| `project-auditor` | `sonnet` \| `opus` | architectural debt analysis |
| `pm` | `sonnet` \| `haiku` | task decomposition (structured output) |
| `performance-engineer` | `sonnet` \| `haiku` | k6/Locust scripting + analysis |
| `l3-support` | `sonnet` \| `haiku` | log triage + Beads creation |
| `devops` | `sonnet` \| `haiku` | deploy commands (well-known shapes) |
| `qa-engineer` | `sonnet` \| `haiku` | test execution + bug filing |
| `ai-eval-engineer` | `sonnet` \| `haiku` | structured eval scaffolds |
| `continuous-learner` | `haiku` | fixed-shape summary |
| `*-reviewer` (default) | `sonnet` | balanced cost/quality for review |

The policy is encoded in `MODEL_TIER_POLICY` in `scripts/agent-prompt-lint.mjs`
(single source of truth). Both short tier (`sonnet`) and fully-qualified
(`claude-sonnet-4-6`) values are accepted.

## Cost impact (estimate, May 2026 pricing)

Anthropic tier pricing per 1M input tokens:
- `haiku`  ≈ $1
- `sonnet` ≈ $3
- `opus`   ≈ $15

For a typical pipeline run (architect + pm + senior-dev + qa + security +
devops):

- **Pre-policy:** mixed (e.g. all-sonnet) ≈ $0.30/run
- **With policy:** architect=opus, devops/qa=haiku ≈ $0.30–0.40/run
  (architect upgrade balanced by qa/devops downgrade)

The policy's value is **not** raw savings — it's preventing extreme outliers
(e.g. continuous-learner accidentally on opus would cost ~$5/run for a task
that takes haiku 30 cents).

## Consequences

### Positive
- Reproducible model selection — code-reviewable in PRs
- Linter catches drift before merge
- Cost predictability per pipeline run
- Documented rationale for new contributors

### Negative
- One more rule to maintain when Anthropic ships new tiers
- Policy table needs review per major Anthropic pricing change
- Reviewer agents are pinned to `sonnet`, so opus-on-edge-cases requires
  policy update

### Migration path to error-level (v3.0)
1. v2.7.0 — CONS-MODEL is `warn`. Catalogue current violations.
2. v2.8.x — fix violations identified in production telemetry.
3. v3.0 — promote to `error`, fail CI on drift.

## Related rules

- **CONS-OUTPUT** (v2.7.0, warn) — every reviewer declares an explicit
  `docs/<dir>/<PREFIX>-{slug}.md` output file
- **CONS-SIGNOFF** (v2.7.0, warn) — every reviewer references sign-off /
  gate / handoff semantics

These cement the reviewer contract so 18+ reviewer agents stay
schema-compatible with the board API and senior-dev handoff.

## References

- `scripts/agent-prompt-lint.mjs` — rule implementation
- `docs/AGENT-LINT-RULES.md` — full rule catalogue
- v2.6.0 release — initial linter (FM-*, STR-*, PHASE-*, MEM-*, OUT-*, DEPS-*)
