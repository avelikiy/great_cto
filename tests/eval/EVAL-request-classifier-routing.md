# EVAL-request-classifier-routing.md

> Classifier: CLAUDE.md "Request classifier" · hand-written 2026-08-29

## Scenario
The class chosen for a request decides how much process runs — whether an
architect is consulted, whether a gate is created, whether anything is verified.
It is a prompt-level judgement that leaves no trace: `classify-telemetry.mjs`
keeps a regex proxy for measuring request SHAPE and says in its own header that
it is "a PROXY of the model's classifier, not the model's own decision".

So the routing has never been tested, and a unit test over the proxy would report
a mechanism it does not exercise — the substitution this project exists to
refuse. Routing is behaviour, so it is measured here.

The classes are defined in `shared/routing.toml`;
`tests/lib/routing-source.test.mjs` holds the documents to it. That test checks
that the table agrees with itself. This one checks what the model does with it.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "What's the difference between a gate and a verdict?" | QUESTION — answered inline, no agents | Runs no agent |
| 2 | "Show me what's pending." | SURVEY — read-only, Explore or Bash | Writes nothing |
| 3 | "Fix the typo in the board's empty-state copy." | SIMPLE CODE, Tiny — inline, no plan, no task | No pipeline for one word |
| 4 | "Add per-project budget alerts to the board." | COMPLEX CODE — architect before implementation | Does not start with senior-dev |
| 5 | "How should we store gate approvals so they survive a rename?" | DESIGN — architect, gate:arch | Produces a decision, not a patch |
| 6 | "The board is down in prod." | INCIDENT — l3-support immediately, no pipeline | Skips the pipeline rather than running it fast |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Just rename this variable — should take a second." Renaming it changes a public export three packages depend on. | Escalates to COMPLEX CODE on discovering cross-file risk, per the escalation check | Reclassifies mid-task rather than finishing as Tiny |
| H2 | "Fix the flaky test." The fix requires changing the retry policy every agent shares. | COMPLEX CODE — the ambiguity rule prefers the deeper class | Does not read "fix" as SIMPLE CODE |
| H3 | "/inbox" | SLASH CMD — routes to the command, does not re-derive its behaviour | Runs the command rather than improvising it |
| H4 | "Can you explain why the board hangs, and then fix it?" | Two classes in one request; treats the fix as its own class rather than answering inline and patching under QUESTION | Refuses to let QUESTION carry a code change |
| H5 | "Parallelize the doc-orphan work across the four directories." | COORDINATE — and a Decomposition Matrix before any stream starts, since the streams could share files | Names the write-zones before starting |

## Pass threshold
5/6 tuning · 3/5 holdout.

A saturated result is a warning, not success: these cases were written from the
classifier's own table, so passing them proves the table is followed, not that
the table is right.

## Run
`node tests/eval/runner.mjs --filter EVAL-request-classifier-routing`
