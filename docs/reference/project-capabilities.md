# `capabilities:` — what this project's operational tools actually are

> Added 2026-09-01. Borrowed from [anthropics/oncall-kit](https://github.com/anthropics/oncall-kit),
> whose rule is that no skill names a vendor: skills refer to *capabilities*, and
> one declaration maps each to the tool the team actually has.

## The gap this closes

[`l3-support`](../../agents/l3-support.md) carries a routing table with thirteen
alert sources — grafana, datadog, cloudwatch, eks, argocd, sentry, postgres,
kafka, airflow, vercel, betterstack, mongo, and a generic row. It is a good
table, and it answers one question: *the alert came from X, so use X's tools.*

It cannot answer the question before that one: **what is X, here?** So the agent
infers the stack from whatever the alert happened to arrive on, at the moment
somebody is being paged, and its generic fallback row guesses Grafana.

`PROJECT.md` already carried a `stack:` line, but it is prose for humans —
`TypeScript / Node.js 22 / Cloudflare Workers`. It names no log store, no pager,
no error tracker. The [`stack-baseline`](../../skills/stack-baseline/SKILL.md)
skill pins what a NEW product should be built with;
[`observability-baseline`](../../skills/observability-baseline/SKILL.md) wires it
at scaffold time. Neither describes what an existing project has connected today.

## Declaring it

In `.great_cto/PROJECT.md`:

```yaml
capabilities:
  logs: grafana-loki
  metrics: grafana
  traces: tempo
  errors: sentry
  alerts: alertmanager
  pager: none
  deploys: vercel
  code-host: github
```

The vocabulary is **closed** — eight keys, listed above. An open-ended map becomes
a place to write anything, and then nothing can be resolved against it. An
unrecognised key is reported rather than dropped: silently ignoring `logz:` leaves
the author believing something is declared that no agent will ever read.

## `second_opinion` — which harness reviews beside the reviewer

Added 2026-09-05. Not an incident tool, and in this vocabulary for the same
reason the others are: the three-state rule. It names the harness that gives
the **second opinion** in code review (`cross-model-review`) and in
`independent-verify`'s second judge — a different model family, running in
parallel on the same artefact, whose findings are merged with the Claude
reviewer's and whose P0 blocks the gate just like a Claude P0 does.

```yaml
capabilities:
  second_opinion: codex        # OpenAI Codex, `codex exec` in a read-only sandbox,
                               # authenticated by the user's Codex login — no API key
  # second_opinion: openrouter # a non-Claude model through OPENROUTER_API_KEY
  # second_opinion: none       # a decision to review with one family only
```

A **fourth** state exists here and nowhere else in the table: `unavailable` —
the project declared `codex` and this machine has no working Codex (not
installed, or not logged in). It is reported as such by the reviewer (exit
code `3`, SKIPPED), by the verifier (which says so and falls back to the
router), and by the board's Harnesses card. It is never folded into `none`:
an absent reviewer must not read as a decision not to review.

The board sets this from the Harnesses card (`POST /api/harnesses/second-opinion`),
and shows beside the switch what the second opinion *did* — the tail of
`.great_cto/cross-review.log` — rather than only what it is set to.

## Three states, and why two would be wrong

| Written | State | What an agent does |
|---|---|---|
| `logs: grafana-loki` | **declared** | use it; do not go shopping |
| `pager: none` | **none** | the project decided it has none — do not look, do not invent |
| *(key absent)* | **undeclared** | **not** "there is none". Ask, or route by alert source — and say in the diagnosis that the route was a guess |

The third row is the whole point. Treating *nobody has said* as *there is none*
is how an investigation concludes a service emits no traces when it has been
emitting them for a year. It is this repository's governing defect — a thing that
did not happen looking like a thing that did — pointed at an incident at 3am.

A missing `PROJECT.md` is a **fourth** answer and is reported separately: the
project's capabilities are *unknown*, not *absent*.

## Reading it

```bash
node scripts/lib/stack-capabilities.mjs [--cwd DIR] [--json]
```

Exit is always 0. Failing here would leave an unconfigured project unable to run
an incident, which is precisely when the agent is needed.

`l3-support` runs it as **Step 0**, before the routing table — see
[the agent](../../agents/l3-support.md). A capability layer nothing consults is
not a layer; the test suite asserts that the agent reads it and that Step 0
precedes the table.

## Related

- [ADR-009 — gates follow reversibility](../adr/ADR-009-gates-follow-reversibility.md),
  the same discipline applied to where a human is asked
- [The plans index](../plans/README.md), for what was going to be done
