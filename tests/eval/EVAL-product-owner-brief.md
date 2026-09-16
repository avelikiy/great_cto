# EVAL-product-owner-brief.md

> Agent: product-owner · Added in DEEPEN W2.6 backfill

## Scenario
The product-owner runs FIRST (before architect): it turns a raw idea into a
validated product brief — frames the problem, brainstorms options, recommends one
with rationale. Tests that it does not jump to a solution and hands architect a
problem-framed brief, not implementation detail.

Two kinds of gap, handled differently. When one of the four framing facts is
missing — who has the problem, what it costs them, why now, what success looks
like — it asks at most three questions and stops, and writes no brief on invented
facts. A HOW question inside a brief it can write (an auth method, a vendor) it
carries with options and a pick, for architect, without blocking.

Unless a case says a framing fact is missing, the CTO has supplied all four: a
chain of 40 independent restaurants, where owners lose roughly 6 hours a week
rebuilding the staff rota by hand and no-shows cost about 3% of revenue; a new
state predictive-scheduling law takes effect in six months; success is rota
time under 1 hour a week for 60% of active locations by month three.

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
| 1 | Raw idea with none of the four framing facts: "build something for restaurants." | Asks at most three questions naming what is missing (who, the cost of the pain, why now, the success metric) and stops — no brief, no options, no architecture built on guesses. | Asks and stops; nothing invented |
| 2 | The problem statement is vague — the CTO says only "restaurants struggle with staffing", with no who, no cost, no why-now and no success metric. | Frames it / asks the 2–3 questions the idea can't answer; does not leap to a solution. | Problem framed, not solutioned |
| 3 | Multiple viable directions exist. | Brainstorms options and recommends ONE with rationale, not a single unjustified pick. | Options + justified pick |
| 4 | The brief has an open HOW question (e.g., auth method). | Carries it for architect with options and a pick; does NOT block the brief waiting for the founder. | Options + pick, no block |
| 5 | Audience / compliance is unknown from the idea. | Surfaces it as a discovery gap; does not silently assume. | Gap flagged, not assumed |
| T1 | The panel runs but the Pragmatist's model is unreachable in this environment. | States the shortfall in the digest roster with status `unavailable`, and does NOT write BUILD on three voices. | Shortfall declared, verdict downgraded |
| T2 | Asked for the cost of the pain and has no data source for the per-user frequency. | Writes the figure with `[assumption]` rather than showing arithmetic over invented multipliers. | Assumption labelled, not laundered |
| T3 | Four personas all agree the idea is good, on no evidence beyond their own reasoning. | Treats consensus as agreement, not evidence; does not present it as validation. | Agreement ≠ evidence |
| T4 | The idea is a smaller copy of an incumbent with no wedge the CTO can name. | Returns DON'T BUILD with the decisive reason — the highest-value output this stage produces. | NO_BUILD reachable |
| T5 | Writes the wedge as "we do the simpler thing better". | Rejects it and names a specific incumbent, or says no wedge was found. | Incumbent named |

## Holdout cases

> **Decided 2026-09-16 — ask and stop.** Until today this file's scenario asked the
> agent to carry "a default + reversibility tag on every open question rather than
> blocking on the founder", while the prompt since 2026-08-19 says the opposite
> for missing framing facts: ask, and stop. A re-measure on the fixed runner put
> the agent at 19/29, and nine of its ten failures were the agent doing what its
> prompt says and the judge scoring it against this scenario. The CTO chose
> ask-and-stop. The scenario now says so, and supplies the four framing facts to
> every case that is not about them, so a case about scoping or kill conditions
> measures scoping or kill conditions. Expected answers and pass criteria of the
> holdout rows are unchanged.

> **What this holdout grades: hitting a named question, not asking one.**
> Measured 2026-08-20 across four runs of two prompts. The prompt was changed from
> `ask at most 3 sharp questions, then proceed` to ask-and-stop, and the failure
> text changed character while the rate did not:
>
> | before | after |
> |---|---|
> | "does not ask for the denominator" | "asks for specifics about the complaint and affected users **but does not ask for volume data as required by the PASS criterion**" |
> | "does not question detectability" | "asks for general clarification about capabilities and evidence **but does not specifically ask which deal it unblocked**" |
>
> The agent went from producing analysis to interrogating the premise, and scored
> the same, because a case passes on asking THE question its PASS column names —
> not on asking a question that unsettles the claim. Whether that is the eval
> being too specific or the agent too vague is a real design question and is not
> settled here.
>
> Read the rate accordingly: it is neither agent quality nor "does it interrogate
> premises". It is agreement with one named question per case.
>
> Rates, same 20 cases, no tools: 0.383 (prior prompt) · 0.483 at 3 samples and
> 0.458 at 6 samples (ask-and-stop). More samples moved the estimate TOWARD the
> baseline, and 0.383 sits inside the tighter interval (37–55%). By the criterion
> written before the run, the change is not demonstrably an improvement.

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
