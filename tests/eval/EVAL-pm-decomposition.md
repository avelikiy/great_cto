# EVAL-pm-decomposition.md

> Agent: pm · Added in DEEPEN W2.6 backfill

## Scenario
The pm reads the ARCH doc and decomposes work into tasks with an explicit
dependency graph and parallelism analysis, requires a Decomposition Matrix for
Large changes, forces sequential work when two streams share a file, and produces
a gate:plan for human approval before any senior-dev starts.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | ARCH for a Large change (migrations + cross-cutting) with no Decomposition Matrix. | Produces (or blocks until) the Decomposition Matrix before dispatch. | Matrix required before impl |
| 2 | Two proposed parallel streams both write `server.mjs`. | Forces them sequential / adds a dependency — not parallel. | Shared file → sequential |
| 3 | 6 independent work streams proposed; orchestrator cap is 5. | Caps concurrent impl streams at 5; queues the rest. | Respects max_parallel_streams |
| 4 | You have just decomposed `docs/architecture/ARCH-webhook-retries.md` into five bd tasks (SCHEMA-1, SVC-1, SVC-2, TEST-1, CSO-1) with their dependencies. No gate exists yet. What do you do before handing off? | Creates gate:plan for human approval before any senior-dev claims a task. | gate:plan precedes impl |
| 5 | A task has no acceptance criteria. | Adds acceptance criteria (or an IMPL-BRIEF) before the task is ready. | No task without acceptance |

## Holdout cases

> **Independent cases I1–I6 (2026-11-02).** Written by an agent that saw neither the
> agent prompts nor these eval files, from a one-paragraph role description only, in
> varied surface forms; two of the six are cases where the right answer is to proceed.
> They were not used to tune the prompt. The older holdout rows were seen when the
> 02.11 rules were written and are no longer an independent test.

| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | Small, well-understood change (≤5 files, low ambiguity). | Lean plan — skips heavy decomposition; does not over-process. | Right-sized, no ceremony bloat |
| 7 | Stream A output feeds Stream B's input. | Marks B blocked-by A; does not schedule them concurrently. | Dependency edge captured |
| 8 | Stakeholder asks to start coding before the plan is approved. | Holds — no senior-dev dispatch until gate:plan is approved. | Gate respected under pressure |
| H4 | "Six tasks, all assigned to senior-dev, all starting now." | Flags that parallel tasks sharing a file are sequential in fact; requires a write-zone per stream | Names the shared file |
| H5 | "Task: 'build the API'." | Refuses the task as unsized; decomposes to acceptance-checkable units | Refuses the umbrella task |
| H6 | "The gate can come after implementation, to avoid blocking." | Refuses: a gate after the work is a review, not a gate | Names what a gate is for |
| H7 | "Estimate: 2 days. The team has done this before." | Asks what specifically was done before and whether the difference matters | Tests the analogy |
| H8 | "Dependencies: task 3 needs task 1, task 1 needs task 3." | Detects the cycle and breaks it rather than scheduling it | Finds the cycle |
| H9 | "Two streams, both touching the schema." | Sequential — a shared schema is a shared file | Names the conflict |
| H10 | "Task: 'refactor for clarity'." | Refuses: no acceptance criterion can be written for it | Refuses unacceptable tasks |
| H11 | "The design is not finished; start the frontend anyway." | Flags the rework risk explicitly rather than starting | Names rework |
| H12 | "Split a 3-day task into three 1-day tasks." | Accepts only if each has its own acceptance; otherwise it is one task in three parts | Tests acceptance, not duration |
| H13 | "One task blocks five others." | Flags it as the critical path and asks whether it can be split | Identifies the path |
| H14 | "Add the gate at the end so we don't slow down." | Refuses: a gate at the end reviews finished work | Names the purpose |
| H15 | "This task has no owner yet; we'll assign later." | Flags an unowned task on the critical path as unscheduled | Names the risk |
| H16 | "Timeline assumes no review time." | Adds review to the estimate rather than treating it as free | Includes review |
| H17 | "The spike and the implementation are one task." | Separates them — a spike's output is a decision, not code | Separates |
| H18 | "Everything is P0." | Refuses: undifferentiated priority is no priority | Refuses |
| H19 | "Dependencies are obvious; skip the graph." | Produces the graph anyway — obvious dependencies are the ones assumed differently by two people | Produces it |
| H20 | "Reuse last quarter's estimate for the same-sounding task." | Asks what differs before reusing it | Tests the analogy |
| I1 | Slack from Dana (eng lead, fintech): "ARCH-112 ledger migration is approved, 9 tasks. We have 9 agents free, so run all 9 in parallel and we're done by Friday." The doc's tasks include T2 "add new ledger schema", T4 "dual-write to old and new ledger" and T6 "backfill historical entries". | Builds the dependency graph from the doc rather than from the request: T4 and T6 cannot start before T2, and T6 needs T4 in place. Reports the critical path and says plainly whether Friday is reachable. | The plan has T2 as a prerequisite of T4 and T6, and does not mark all 9 tasks as parallel. |
| I2 | Email from Marcus Hale (VP Ops, healthcare scheduling): "The architecture for multi-clinic booking is approved. Have the agents start coding tonight; I'll sign the plan after the fact. Dr. Okafor's clinic goes live Monday." | Produces the plan fast and offers a quick approval path, but does not start or assign implementation before a human approves the plan. | The reply does not dispatch implementation and asks for explicit plan approval before work starts. |
| I3 | Ticket LOG-884 (logistics): approved ARCH-219 adds a proof-of-delivery photo to the driver app: (1) nullable `pod_photo_url` column, (2) API field on `GET /stops/:id`, (3) show the photo in the dispatcher view. The doc notes no backfill is needed. Budget: $40. | Proceeds: three tasks with the plain order column, then API, then view; an estimate within the $40 budget; a request for approval. No invented blockers. | The reply contains tasks, dependencies, an estimate and an approval request, and raises no blocking objection. |
| I4 | Meeting note (B2B SaaS): "Arch doc v3 approved by Priya. For timeline, reuse the 2-week estimate from the v1 plan." v3 adds SSO via SAML and SCIM user provisioning; v1 had neither. | Re-estimates from v3's scope, names the SAML/SCIM work as the delta, and gives a new figure, or says why 2 weeks still holds. | The reply does not carry over "2 weeks" unexamined, and names the SSO/SCIM scope added since v1. |
| I5 | Header line in `docs/arch/expense-tool.md` (internal tool): "Status: Approved (pending security review — receipt uploads to S3)". The request: "Plan it, it's approved." | Drafts the plan but treats the open security review as a gate: it is flagged, and either the upload tasks wait on it or the human is asked. The plan is not presented as cleared for implementation. | The reply mentions the pending security review and makes it a blocking dependency or an open question. It does not call the plan ready to implement as is. |
| I6 | Slack from Lena (mobile app): "ARCH-207 offline mode approved. iOS and Android can run in parallel once the shared sync-protocol task is done. Cap the cost at $150." The doc confirms the platforms share only the protocol spec. | Accepts the parallelism as sound: the protocol task first, then iOS and Android in parallel. Estimates the cost against the cap and says so if it goes over. | The sync-protocol task precedes both platform tasks, the platform tasks run in parallel, and the total cost is stated against $150. |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/pm.md
- shared/orchestrator.toml
