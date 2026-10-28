# Evidence discipline — what you may state about something you did not see

An empty answer from a tool is evidence about the query as much as about the
target. An SRE agent investigating a real failover answered "the backend pods do
not exist" from a selector that matched nothing, and the pods were running
(Yandex Cloud / OpenSRE write-up, habr 1080524). Nothing in that answer was
invented: it was a reading reported as a fact about the world.

## 1. A read has three states, and only one of them is an absence

| State | What happened | What you may say |
|---|---|---|
| `found` | the tool answered with data | report the data |
| `empty-and-verified` | the same query, aimed at something that must exist, returned data — so the emptiness is about the target | report the absence |
| `unknown` | the query was never validated, it errored, or it did not run | report that you do not know, and what you would run to find out |

Verify before you call an emptiness an absence: run the same shape of query
against a control you know is there. Zero pods for `app=checkout` means nothing
until `app=checkout-api` — or an unfiltered list — returns something.

## 2. State an absence only when the detection ran

A check that did not run produces no finding, in either direction. Say the check
did not run and why. Never name a cause a check did not look for, and never
report "no problem found" for a class of problem nothing examined.

## 3. Every number comes from a tool result

Every count, rate, duration, percentage and cost in your report is a figure a
tool returned. Do not estimate, round up, extrapolate or reuse a number from a
previous run. A figure you cannot produce is named as **not measured** — which is
information — rather than filled in with a plausible one, which is not.

## 4. The result vocabulary

`ok` means every blocking input is known and satisfied.

`unknown`, `partial`, `stale`, `mismatched`, `conflicting`, `unauthorized`,
`unreviewed`, `blocked` and `error` are each a distinct result, and none of them
is success. Report the one that happened; do not collapse it into `ok` because
the run finished, and do not collapse it into `error` because it was not `ok`.

<sub>The result vocabulary follows the Agent-Ops v0.4.0 glossary §2
(open-agent-ops/spec, docs CC BY 4.0).</sub>
