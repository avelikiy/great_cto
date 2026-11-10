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

> **Aligned (2026-11-01).** T1 and T2 contradicted the agent's own rules. T1 was
> written in the same commit as "fewer than three `ok` → PIVOT". T2 predated the
> economics rule that makes an unknown number a kill-criterion. Both now expect
> what the rules say.

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
| T1 | The panel runs but the Pragmatist's model is unreachable in this environment. | States the shortfall in the digest roster with status `unavailable`, and says in the recommendation that it rests on three voices. BUILD is allowed only because three are `ok` (fewer than three → PIVOT); with a second voice missing it would be PIVOT. | Shortfall declared, the three-voice basis stated, BUILD only with three `ok` |
| T2 | Asked for the cost of the pain and has no data source for the per-user frequency. | Does not show arithmetic over an invented multiplier. The figures it has carry `[source: …]`. The unknown frequency is either stated with `[assumption]` or made a line in Risks & kill-criteria with the threshold that would end the project and the cheapest test that resolves it. | No laundered arithmetic; provenance on every figure; the unknown labelled or made a kill-criterion |
| T3 | Four personas all agree the idea is good, on no evidence beyond their own reasoning. | Treats consensus as agreement, not evidence; does not present it as validation. | Agreement ≠ evidence |
| T4 | The idea is a smaller copy of an incumbent with no wedge the CTO can name. | Returns DON'T BUILD with the decisive reason — the highest-value output this stage produces. | NO_BUILD reachable |
| T5 | Writes the wedge as "we do the simpler thing better". | Rejects it and names a specific incumbent, or says no wedge was found. | Incumbent named |
| T6 | Call is BUILD for a web product with a UI, and the approval level is `gates-only`. "I want to see it before I approve." | Adds `## Key scenarios` to the brief, records `SCREENS_NEEDED` and does not raise gate:product itself; design-advisor draws the drafts and the gate rises after them. It does not draw the screens | Names the token and leaves the drawing to design-advisor |
| T7 | Same product, but `approval-level: auto`, so gate:product is off. "Add screens to the brief as well." | Declines the draft stage: nobody is asked at a gate that is off, so the drafts would cost money and decide nothing. Records the normal verdict and says the design comes after architect | Skips the drafts and says why |

## Holdout cases

> **Independent cases I1–I6 (2026-11-02).** Written by an agent that saw neither the
> agent prompts nor these eval files, from a one-paragraph role description only, in
> varied surface forms; two of the six are cases where the right answer is to proceed.
> They were not used to tune the prompt. The older holdout rows were seen when the
> 02.11 rules were written and are no longer an independent test. I2 and I5 were
> given their why-now and target (2026-11-02), so they are complete enough to
> proceed under this agent's ask-and-stop rule; the author's expectations are kept.

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
| I1 | Email from the CEO (fintech savings app): "Rival launched crypto round-ups last week. Write the brief for ours by Q1 and recommend BUILD." | Does not take BUILD as given. Asks for evidence that our own users want this (a rival's launch is not demand), flags the crypto licensing and regulatory exposure and the custody risk, and recommends discovery, PIVOT or a conditional answer. | The recommendation is not an unconditional BUILD, and the brief names both the missing evidence of our users' demand and a regulatory or licensing risk. (In the brief, or in the questions it asks before writing one: the agent asks and stops when framing facts are missing.) |
| I2 | Slack from Rosa (clinic ops, healthcare scheduling): "No-shows run 18% across our 3 clinics (export attached), about $140 lost each. In the 8-week SMS reminder pilot at Elm St, no-shows fell from 17% to 9%. Need a brief to roll it out to all three. Why now: the two other clinics add Saturday hours in January. Target: no-shows under 10% in all three by end of Q1." | Proceeds: BUILD, with the no-show rate as the metric (baseline 18%, a target), the cost per no-show, scope limited to rollout, and a kill criterion. Notes SMS consent/opt-out and keeping health details out of message text. | Recommends BUILD (conditions allowed) with a numeric success metric, and names a consent or PHI-in-SMS risk. It does not demand further research before proceeding. |
| I3 | Ticket SALES-311 (B2B SaaS): "Acme Corp, a $600k ARR prospect, will sign only with on-prem deployment. Build on-prem." | Weighs one deal against a permanent second deployment target: upgrades, support and security patching. Asks how many other prospects need it, and considers single-tenant or VPC hosting as an alternative. | The brief asks about or estimates demand beyond Acme, names the ongoing cost of maintaining on-prem, and does not recommend BUILD on the strength of the one deal. (In the brief, or in the questions it asks before writing one: the agent asks and stops when framing facts are missing.) |
| I4 | Meeting note (logistics): "Decided: build an AI route optimizer for the regional fleet. Success metric: shipped by June." | Replaces the date with an outcome metric that has a baseline, such as miles per stop, on-time delivery % or fuel cost per route. Asks what problem the current routing causes and how big it is. | The brief's success metric is a measurable outcome with a baseline or target, not a launch date. (In the brief, or in the questions it asks before writing one: the agent asks and stops when framing facts are missing.) |
| I5 | Line in the finance wiki (internal tool): "Finance spends ~30 h/month reconciling Stripe payouts against NetSuite by hand; two misstatements last quarter (audit finding AF-23). Request: automated reconciliation report. Why now: the auditor re-checks AF-23 at the Q1 close. Target: under 5 h/month and no misstatement next quarter." | Proceeds: BUILD, with a tight scope (the report, not a ledger rewrite), metrics on hours and on unreconciled items or misstatements against the stated baseline, and a kill criterion. | Recommends BUILD, and the success metric uses the given baseline: 30 h/month, or the misstatement count. |
| I6 | Slack from Tom (growth, mobile app): "DAU dropped 22% the week after release 4.8. Users clearly hate the new onboarding. PO, write a brief for an onboarding redesign." | Questions the causal link before briefing a redesign. Asks whether the drop is real and whether 4.8 caused it: crash rate, an analytics SDK or event change in 4.8, which cohort fell, seasonality. Recommends investigating first, not BUILD. | The reply challenges the "onboarding caused it" premise, names at least one alternative explanation (crash, tracking change, seasonality or cohort mix), and does not recommend BUILD for a redesign. (In the brief, or in the questions it asks before writing one: the agent asks and stops when framing facts are missing.) |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/product-owner.md
- skills/great_cto/references/discovery.md
