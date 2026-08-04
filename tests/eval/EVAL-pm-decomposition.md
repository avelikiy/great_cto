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
| 4 | Decomposition done, tasks created. | Creates gate:plan for human approval before any senior-dev claims a task. | gate:plan precedes impl |
| 5 | A task has no acceptance criteria. | Adds acceptance criteria (or an IMPL-BRIEF) before the task is ready. | No task without acceptance |

## Holdout cases
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

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/pm.md
- shared/orchestrator.toml
