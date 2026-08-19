# EVAL-product-owner-brief.md

> Agent: product-owner · Added in DEEPEN W2.6 backfill

## Scenario
The product-owner runs FIRST (before architect): it turns a raw idea into a
validated product brief — frames the problem, brainstorms options, recommends one
with rationale, and carries a default + reversibility tag on every open question
rather than blocking on the founder. Tests that it does not jump to a solution and
hands architect a problem-framed brief, not implementation detail.

## Cases

Cases 6-10 were added after an audit found
that every existing case tested the QUESTIONS this agent asks and none tested the
ARTEFACT it writes. That split is deliberate now and belongs in two places: this
eval measures judgment, `artifact-lint`'s BRIEF rules measure the document. Cases
about R-numbers and section structure are NOT here, because the eval actor runs a
single text call with no tools and cannot produce a file to be checked.

They belong in **this** section and not in Holdout. They were first appended
after the last numbered row in the file, which sat in `## Holdout cases` — so
five freshly-written cases landed in the set whose whole purpose is to be the one
nobody tuned against. Holdout is not a harder set of cases; it is a set with a
property, and appending to it destroys the property silently.
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Raw idea: "build something for restaurants." | Produces a validated brief (problem, target users, options) BEFORE any architecture. | Brief precedes architect |
| 2 | The problem statement is vague. | Frames it / asks the 2–3 questions the idea can't answer; does not leap to a solution. | Problem framed, not solutioned |
| 3 | Multiple viable directions exist. | Brainstorms options and recommends ONE with rationale, not a single unjustified pick. | Options + justified pick |
| 4 | The brief has an open question (e.g., auth method). | Carries a default + reversibility tag; does NOT block waiting for the founder. | Default + reversibility, no block |
| 5 | Audience / compliance is unknown from the idea. | Surfaces it as a discovery gap; does not silently assume. | Gap flagged, not assumed |
| T1 | The panel runs but the Pragmatist's model is unreachable in this environment. | States the shortfall in the digest roster with status `unavailable`, and does NOT write BUILD on three voices. | Shortfall declared, verdict downgraded |
| T2 | Asked for the cost of the pain and has no data source for the per-user frequency. | Writes the figure with `[assumption]` rather than showing arithmetic over invented multipliers. | Assumption labelled, not laundered |
| T3 | Four personas all agree the idea is good, on no evidence beyond their own reasoning. | Treats consensus as agreement, not evidence; does not present it as validation. | Agreement ≠ evidence |
| T4 | The idea is a smaller copy of an incumbent with no wedge the CTO can name. | Returns DON'T BUILD with the decisive reason — the highest-value output this stage produces. | NO_BUILD reachable |
| T5 | Writes the wedge as "we do the simpler thing better". | Rejects it and names a specific incumbent, or says no wedge was found. | Incumbent named |

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
| H9 | "Retention is down 4% this month." | Asks which cohort and against what baseline before framing a problem | Requires the cohort |
| H10 | "Add the feature three customers asked for." | Asks what those three have in common and how many others share it | Tests representativeness |
| H11 | "Success metric: engagement." | Refuses an unoperationalised metric; asks what action counts | Requires the definition |
| H12 | "We'll measure after launch." | Requires the measurement be designed before, or the launch teaches nothing | Names the ordering |
| H13 | "This is table stakes for enterprise." | Asks which deal it unblocked or lost | Requires the instance |
| H14 | "The support team says it's the top complaint." | Accepts as a signal and asks for the volume behind it | Asks for volume |
| H15 | "Ship the MVP, then iterate." | Asks what would make us stop rather than iterate | Names the kill condition |
| H16 | "Users don't understand the current flow." | Asks where they drop, before proposing a redesign | Locates it |
| H17 | "Competitor shipped it and their stock went up." | Rejects the causal chain | Names the non-sequitur |
| H18 | "The brief is done; architect can start." | Checks that the problem, the metric and the non-goals are all present | Checks completeness |
| H19 | "Non-goals: none." | Pushes back — a scope with no non-goals has not been bounded | Requires non-goals |
| H20 | "Two options; pick the cheaper one." | Asks what each buys before comparing cost | Compares value first |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/product-owner.md
- skills/great_cto/references/discovery.md
