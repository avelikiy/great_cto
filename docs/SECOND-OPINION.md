# Second opinion — where two judges disagree

**Date:** 2026-08-01

`mcp__great_cto_llm_router__ask_kimi` has been in the `tools:` list of nineteen
agents since v1.0.100 and was invoked by none of them. The capability was
declared and never exercised. This is how it is used now, and why it is not used
the obvious way.

## Not a censor

The obvious use is a second model reading the first one's report and saying
whether it looks right. That fails twice.

A reviewer reading a report judges **plausibility**, and a confident wrong
finding is precisely what passes a plausibility check. "The secret is not set",
written because it looks true, reads exactly like the same sentence written
after running `grep`. A second model cannot separate them either — it is reading
the same prose.

And agreement between two models is **weak evidence**. They are trained on
overlapping data and fail in correlated ways. "Both said yes" is close to no
information, but it feels like confirmation, which makes it worse than no check
at all.

## The signal is divergence

So the second judge does not grade prose. Both judges walk the **same DAG of
closed questions** (`scripts/lib/dag-metric.mjs`) and the output is the set of
nodes where their answers differ.

A divergence names a specific question — *"does this finding cite a file:line?"*
— which a human settles in seconds. "Is this report good?" is not answerable in
seconds by anyone.

Three outcomes, and only one of them is actionable:

| Outcome | Reported as | What to do |
|---|---|---|
| They differ on a node | the question, both answers, both scores | look there |
| They agree everywhere | *"weak evidence, not confirmation"* | nothing — this is an absence of signal, not a pass |
| One could not answer | *"no comparison possible there"* | neither a vote nor agreement |

The wording of the agreement case is deliberate. Nothing in the report may use
"verified", "confirmed", or "confident" — an abstention counted as agreement
would let a broken judge confirm anything, and a clean comparison read as
confirmation is the failure this whole approach exists to avoid.

## Running it

```bash
node scripts/lib/second-opinion.mjs <dag.json> --answers '{"node-id":"yes"}'
```

You supply your own answers; the router answers the same questions
independently. Exit 1 on divergence — not because divergence is a failure, but
because it is the case a human should see.

A node you did not answer is an **abstention**, not a default. Filling it in
would manufacture the agreement this tool exists to avoid claiming.

Each question spawns a fresh router process. That is slower, and it is the
correct trade: the second judge must not accumulate its own earlier answers into
a context that biases the next one. A second opinion that saw the first is not a
second opinion.

## When to spend it

This costs an API call per question. It is for a **contested fork** — a severity
call that decides whether `gate:ship` blocks, an architecture choice with two
defensible answers — not for every "done".

The cheap check runs first and catches a different thing: `finding-evidence.mjs`
asks whether the agent touched the world at all. Only a claim that already
carries its command is worth a second opinion on whether it was read correctly.

## Adding a graph

`tests/eval/dags/security-officer-finding-gate.dag.json` is the worked example:
six closed questions from "does the diff show a confirmed vector?" to "does the
gate decision follow the severity?".

A graph is plain JSON, so an agent can write one. Validate before spending
anything on it:

```bash
node scripts/lib/dag-metric.mjs <dag.json> --validate
```
