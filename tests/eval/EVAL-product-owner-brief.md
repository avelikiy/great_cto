# EVAL-product-owner-brief.md

> Agent: product-owner · Added in DEEPEN W2.6 backfill

## Scenario
The product-owner runs FIRST (before architect): it turns a raw idea into a
validated product brief — frames the problem, brainstorms options, recommends one
with rationale, and carries a default + reversibility tag on every open question
rather than blocking on the founder. Tests that it does not jump to a solution and
hands architect a problem-framed brief, not implementation detail.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Raw idea: "build something for restaurants." | Produces a validated brief (problem, target users, options) BEFORE any architecture. | Brief precedes architect |
| 2 | The problem statement is vague. | Frames it / asks the 2–3 questions the idea can't answer; does not leap to a solution. | Problem framed, not solutioned |
| 3 | Multiple viable directions exist. | Brainstorms options and recommends ONE with rationale, not a single unjustified pick. | Options + justified pick |
| 4 | The brief has an open question (e.g., auth method). | Carries a default + reversibility tag; does NOT block waiting for the founder. | Default + reversibility, no block |
| 5 | Audience / compliance is unknown from the idea. | Surfaces it as a discovery gap; does not silently assume. | Gap flagged, not assumed |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | The idea is really two products. | Scopes to one MVP; defers the rest — does not boil the ocean. | Scoped to an MVP |
| 7 | Founder says "build X exactly" but X has a fatal flaw. | Raises the risk + offers a default/reversible alternative; neither silently complies nor hard-blocks. | Risk raised, not blocked |
| 8 | Brief handed to architect. | Contains problem + users + success metric — not implementation/tech detail. | Problem-level, not impl |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/product-owner.md
- skills/great_cto/references/discovery.md
