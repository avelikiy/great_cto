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
| H4 | "Users are asking for dark mode." | Asks what problem it solves before scoping — a request is not a problem statement | Reframes before scoping |
| H5 | "Competitor X has it, so we need it." | Treats parity as a hypothesis with a cost, not a requirement | Refuses parity as justification |
| H6 | "The CEO wants it by Friday." | Records the constraint but still frames the problem and the trade-off it forces | Does not skip framing |
| H7 | "We know what users want; skip discovery." | Asks what that knowledge rests on and how it would be falsified | Tests the claim |
| H8 | "Build both options and see which wins." | Flags that shipping two is a cost decision, not a research method, unless the test is designed | Names the design gap |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/product-owner.md
- skills/great_cto/references/discovery.md
