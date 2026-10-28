# ADR-039: The graph guards a dispatch it can prove wrong — observed first, enforced on evidence

**Date:** 2026-10-20
Status: Accepted — rule 1 shipped in observe mode
Deciders: great_cto maintainers
Tracking: Beads epic great_cto-1puj (graph-2: great_cto-1puj.2)
Related: [ADR-027](ADR-027-one-agent-registration.md) (why an executing controller is not an option on Claude Code), [ADR-037](ADR-037-lesson-needs-evidence.md) (the same rule — nothing ships without a measurement)

## Context

`shared/pipeline.toml` is the pipeline graph. On Codex a controller executes it
(`scripts/lib/codex-pipeline.mjs`). On Claude Code it is advice:
`pipeline-dispatcher.mjs` (PostToolUse) tells the orchestrating model what to run
next, and the model decides, reading 37 KB of routing prose in `SKILL.md`.

Measured 2026-10-20 over every local Claude Code transcript (graph-1,
great_cto-1puj.1): 30 sessions with pipeline agents, 1,388 consecutive dispatch
pairs. 11.4% left the graph after accounting for repeats, new chains, rework
loops, graph-allowed skips and parallel siblings. **94 of those 158 were one
pair: product-owner → design-advisor** — the graph and design-advisor's own card
put design *after* architect. In **84 of 93** such cases architect did not run
before the next senior-dev: the architecture stage and `gate:arch` were skipped
for UI features, in 15 sessions across 12 projects. Nothing reported it.

## Options and decision

| Option | Benefit | Cost / risk | Decision |
|---|---|---|---|
| Executing controller on Claude Code (as on Codex) | deterministic path | needs `claude -p` dispatch, which `shared/orchestrator.toml` forbids; skips skill preloads | Rejected |
| Allow-list every dispatch against `next` | strict | the graph has legitimate paths `next` does not express (rework, new chains, auto-attached reviewers); measured, a whole-graph allow-list would refuse many legitimate dispatches | Rejected |
| **Guard the proven hole; observe before enforcing** | closes the measured failure; false positives are counted before anyone is blocked | covers one rule at first; more rules only on new evidence | **Chosen** |

## Contract

A PreToolUse hook on `Agent|Task` (`scripts/hooks/graph-guard.mjs`) runs one rule
per measured hole. Rule 1, **architecture before build after a brief**:

- trigger: dispatch of `design-advisor`, `senior-dev` or `mobile-app-builder`;
- condition: the project's latest success verdict of `product-owner` is newer than
  its latest success verdict of `architect` — a brief exists with no architecture
  after it;
- not triggered when the brief's verdict says `depth=small` or `NO_BUILD`, or when
  an approved `/exception` for gate `graph` is open.

Modes, read from `.great_cto/PROJECT.md` `graph-guard:` (default `observe`):

- `observe` — never blocks. Appends a `hint` event (hook `graph-guard`, outcome
  `would-block-<rule>`, with a `why`) to `.great_cto/events.jsonl` and lets the
  call through. Shape: [Event shape](#event-shape).
- `enforce` — denies with the reason and the command that lifts it, and appends a
  `denied` event (outcome `blocked-<rule>`, same `why`).
- `off` — nothing.

Failure to read a verdict log is not a reason to block: the guard allows, and
appends one `unreadable` event per call naming the log and the error code (it
guards a route, not data integrity — but a guard that could not look must not read
the same as a guard that saw a clean route). See [Event shape](#event-shape).

## Delivery

1. `graph-guard.mjs` + rule 1, unit tests per mode, unreadable logs, the
   exception, the small-depth exemption; registered in `plugin.json` and Codex
   hooks where applicable.
2. The graph-1 measurement script committed (`scripts/graph-adherence.mjs`) so the
   number can be re-taken.
3. After 14 days in `observe`: read the `would-block-*` events and their `why`.
   Enforce by default only if every sampled one was a real skip; otherwise fix the
   rule first. Count the `unreadable` events beside them: they are the calls the
   guard could not judge.

Not in scope: an executing controller on Claude Code; rules for pairs not yet
measured as harmful; changing `pipeline.toml` itself.

## Consequences

- The architecture stage can no longer be skipped silently: at first it is
  recorded, later refused.
- One more hook on every Agent call; it reads two small logs.
- Each new rule needs its own measurement — the guard grows by evidence, not by
  listing every edge.

## Rule 2 — the edge being taken carries its contract (2026-10-26, great_cto-1puj.3)

`produces` in `shared/pipeline.toml` names what a stage must hand on. The Codex
controller checks it before a transition (`scripts/lib/codex-pipeline.mjs`); on
Claude Code nothing did — `pipeline-dispatcher` named the next stage whether or
not the stage before it had named its output.

Measured with `scripts/edge-contract-adherence.mjs` over local verdict logs since
2026-10-01 (3 projects):

| stage | met | unnamed | named a path that does not exist |
|---|---|---|---|
| senior-dev (receipt) | 46/46 | 0 | 0 |
| code-reviewer (receipt) | 14/16 | 2 | 0 |
| qa-engineer (report) | 7/12 | 5 | 0 |
| security-officer (report) | 1/30 | 29 | 0 |
| design-advisor (design) | 0/2 | 0 | 2 |
| pm (plan, briefs) | 0/1 | 0 | 1 |

security-officer's 29 were the contract's fault, not the agent's: its log-verdict
line never asked for `report=`. smart-contract-auditor logged `audit=` against a
contract asking for `report`. Both prompts now name the key, and
`tests/lib/pipeline-produces-prompts.test.mjs` holds every declared key to the
stage agent's own log-verdict instruction — a contract the agent was never told
about is one nobody can meet.

Contract: on dispatch of stage X, of the stages whose `next` holds X the one with
the newest success verdict is the edge being taken. If it declares `produces`,
each key must be named in its verdict (`receipt` by the receipt's files), and a
value containing `/` must exist on disk. Same modes, same exception (`graph`), same
observe-first default as rule 1; an unreadable predecessor log drops only this rule,
and is recorded (below).

Enforce by default only after its own observation window shows the would-block
events are real misses — the numbers above are mostly a prompt defect that this
change fixes, so the window starts now, not from the old logs.

## Event shape

(2026-10-28, great_cto-2u72.1.) This ADR first said an observe event is
`{ts, rule, agent, would_block: true, why}` of kind `graph-guard`, and that an
unreadable log "records `unreadable`". The code wrote neither: it wrote `kind: hint`
with an `outcome` and no reason, and nothing at all for an unreadable log — so the
enforce decision (great_cto-1puj.5) could not read why a call would have been
blocked, and a silent guard looked the same as a guard that saw nothing. What the
hook writes is below; the older shape is retired (`kind: graph-guard` is not in
`EVENT_KINDS`, and `rule` and `would_block` live in `outcome`).

Every event goes to `.great_cto/events.jsonl` through `appendEvent`, with the
fields its allowlist permits (`scripts/lib/agent-events.mjs`):

| Field | Observe | Enforce | Unreadable |
|---|---|---|---|
| `v`, `ts` | 1, UTC | 1, UTC | 1, UTC |
| `kind` | `hint` | `denied` | `hint` |
| `hook` | `graph-guard` | `graph-guard` | `graph-guard` |
| `agent` | the stage being dispatched | same | same |
| `session` | session id | same | same |
| `outcome` | `would-block-<rule>` | `blocked-<rule>` | `unreadable` |
| `why` | the reason, see below | same | the logs and their error codes |

`<rule>` is `architecture-before-build` or `edge-contract`. One event per
violation; a call that violates both writes two. A rule that passes, or a
violation an approved `graph` exception covers, writes nothing.

**`why`** is a short reason built from rule ids, stage names and error codes, at
most 120 characters of `[A-Za-z0-9 :=,._-]`. It is not the sentence the deny
message shows: that one carries the predecessor's timestamp and whatever path its
verdict named, and `events.jsonl` records facts, never content (ADR-021,
`docs/PRIVACY.md`). A `why` that does not fit the charset is dropped, not trimmed.

| Rule / case | `why` |
|---|---|
| `architecture-before-build` | `architecture-before-build: architect has not run since the product-owner brief` |
| `edge-contract`, `receipt` | `edge-contract: <stage> named no receipt` |
| `edge-contract`, any other key | `edge-contract: <stage> named no <key>` |
| `edge-contract`, a named path that is missing | `edge-contract: <stage> <key> path does not exist` |
| unreadable | `<stage>=<CODE>[,<stage>=<CODE>…]`, e.g. `product-owner=EISDIR,architect=EACCES` |

**Unreadable.** A verdict log is unreadable when reading it fails with anything but
"does not exist" (`EISDIR`, `EACCES`, …; the code is recorded, never the message,
which names a path), or when it has content and not one parseable record
(`MALFORMED`: a write cut short, binary noise). The call is allowed, the rule that
needed the log is dropped, and **one** event per call lists every such log. A log
that does not exist is not unreadable: it is a stage that never ran. A log is read
only when the decision needs it — rule 1 reads `product-owner` and `architect` only
for a build or design stage, rule 2 only the predecessors of the stage dispatched —
so a broken log nothing asked about is not an event.

Reading it: `jq 'select(.hook=="graph-guard")' .great_cto/events.jsonl`. `would-block-*`
and `blocked-*` are calls the guard judged and found wrong; `unreadable` are calls it
could not judge; a call with no event was judged and found fine — or never reached
the hook (`graph-guard: off`, no `.great_cto/PROJECT.md`, a host without the hook).
