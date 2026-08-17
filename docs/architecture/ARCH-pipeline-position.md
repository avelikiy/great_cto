# ARCH — pipeline position (where is the pipeline right now)

**Date:** 2026-08-06
**Stale after:** 2027-02-02

Reader: the senior-dev who will implement this, and any contributor who runs
`/inbox` or the board, sees no injected `PIPELINE-NEXT` directive, and cannot tell
whether the pipeline is *waiting on a human gate* or *simply stalled*. The
decision: a read-only pure function plus a node CLI that answer three questions on
demand — which stage last succeeded, which stage is next, and whether that next
stage is behind a human gate or just hasn't been dispatched.

## Depth and signal

| | |
|---|---|
| **Depth** | **Small** — one new file (`scripts/lib/pipeline-position.mjs`, lib + CLI in one, mirroring `approval-level.mjs`), plus one test file, plus a 1-line export added to the dispatcher. No new service, no schema, no runtime dependency, no writes. |
| **Signal** | **None — no regulated or correctness signal in this feature.** It is strictly read-only: no jurisdiction/regime, no PII crossing a boundary, no money, no auth/tenant boundary, no destructive or irreversible operation. The one correctness-adjacent property — never render a *blocked* pipeline as ready to proceed — is handled as an internal safeguard (S1 below), not a gate-forcing signal. |
| **Gate that follows** | This is a DESIGN task → `gate:arch` (active under this repo's `gates-only`). Implementation lands later behind `gate:ship`. No signal raises the floor above Small. |

## The problem, restated in one line

`pipeline-dispatcher.mjs` is **push-only**: it computes "what runs next" and injects
a `PIPELINE-NEXT` directive, but *only* as a PostToolUse hook the instant a subagent
finishes. There is no way to **ask** "where are we?" at an arbitrary moment — after a
compaction, at the start of a session, or when a run stalled hours ago. The board
shows outcomes (verdicts, gates, tasks); none of them says *this is the current
position and this is what it is waiting on*. All the state to answer it already
exists and is already read by the dispatcher — `shared/pipeline.toml`,
`.great_cto/verdicts/<agent>.log`, `scripts/lib/approval-level.mjs`. This feature
adds the missing **pull** view over exactly that state.

## Non-goals

- **No UI, no board wiring.** The board/inbox rendering is a separate task. This
  ships a library and a node CLI only.
- **No writes, no dispatch.** It never spawns an agent, approves a gate, or mutates
  a log. It reports; humans and the existing dispatcher act.
- **No new transition logic.** It does not re-decide what "next" means — it reuses
  the dispatcher's `decideNext` (see Decision).
- **No history/timeline.** It reports the *current* position, not a run's full trace.
  A `/trace`-style timeline is out of scope.

## Decision

Two decisions, both toward one principle: **the pull-view must never disagree with
the push-directive, because they answer the same question from the same state.**

### D1 — Reuse `decideNext`; do not re-derive transitions

The new lib computes the current position, then hands that agent to the dispatcher's
already-exported pure function `decideNext({ agent, transitions, verdict,
joinVerdicts, activeGates })`. `decideNext` already returns a `kind` that is exactly
the answer we need — one of `blocked | join-wait | done | gate | next | no-verdict` —
and already honours the project's active gates. The position lib translates that
`kind` into a position report. It imports `parsePipelineToml`, `parseVerdictLine`,
and `decideNext` from `scripts/hooks/pipeline-dispatcher.mjs` (all exported today and
already consumed by `tests/hooks/pipeline-dispatcher.test.mjs`), and
`gatesForApprovalLevel` / `levelFromProjectMd` from `scripts/lib/approval-level.mjs`.

**Alternatives considered:**

- **Re-implement transition + gate logic in the new lib** — rejected. It would
  duplicate `decideNext`, and the pull-view and push-directive would drift and could
  disagree on whether a gate blocks — the exact confusion this feature exists to
  remove.
- **Extend the dispatcher to also serve an on-demand query** — rejected. The
  dispatcher is a PostToolUse hook with a fixed stdin/stdout contract (`exit 0`
  always, silent-when-nothing-to-say). Overloading it couples an interactive CLI to
  the hook lifecycle. Keep the hook single-purpose; share the pure functions instead.

### D2 — Cursor = the newest verdict *event*; show stale, don't hide it

"Which stage last succeeded" is computed as the agent whose latest verdict line has
the **newest timestamp** (ISO-8601 UTC, lexically sortable; file mtime as tiebreak).
That agent is the cursor; `decideNext` runs against it.

The position lib reads **every** agent's latest verdict **regardless of age** and
labels each `fresh` (≤ 30 min, mirroring the dispatcher's `FRESH_MS`) or `stale`. It
deliberately does *not* reuse the dispatcher's `latestVerdict`, which *filters out*
anything older than 30 min. The dispatcher hides stale verdicts so it never
resurrects yesterday's run into a fresh directive; the position view must do the
opposite — a 3-day-old `architect` verdict with nothing after it is the true answer
("stalled at architect for 3 days"), and hiding it would answer "nothing is
happening."

**Alternatives considered:**

- **Cursor = furthest-along agent in topological order** (deepest agent with a
  success verdict) — rejected. It breaks on ADR-005 mid-build re-entry (a re-run
  early agent would not move the cursor back to where work actually resumed) and on
  the parallel `qa-engineer`/`security-officer` branch. Newest-event is simpler and
  matches how the pipeline actually advances.
- **Reuse `latestVerdict` (30-min filter) for the cursor too** — rejected. It would
  make the CLI report "idle" for any pipeline that stalled more than 30 minutes ago,
  which is precisely the case an operator most needs surfaced.

> **Skipping formal decision-eval scoring.** The binding decision (D1, reuse
> `decideNext`) has a single viable option — duplicating transition logic is an
> obvious anti-choice per `skeptical-triage` skip criteria. D2's trade-off is
> documented inline above; no contested option remains to score.

## Components / file structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `scripts/lib/pipeline-position.mjs` | **Create** | Pure `pipelinePosition()` + IO helpers (`readAllVerdicts`, `pipelineOrder`) + CLI guard (`--json`, `--dir`). One responsibility: compute and render the current position. |
| `scripts/hooks/pipeline-dispatcher.mjs` | **Modify** (1 line) | `export const FRESH_MS = …` so the position lib shares the single fresh/stale boundary instead of duplicating the constant. |
| `tests/lib/pipeline-position.test.mjs` | **Create** | Unit tests for the pure function + a CLI smoke test. |

One new file for the whole behaviour, matching `approval-level.mjs`'s lib-plus-CLI-in-one-file pattern. No new directory, no new dependency.

## The current-position algorithm

```
1. transitions = parsePipelineToml(read shared/pipeline.toml)
2. verdicts    = readAllVerdicts(<dir>/verdicts)
                 → { <agent>: { verdict, ts, ageMs, fresh } } for each *.log whose
                   name is a known transition agent (or ends in "-reviewer");
                   stray logs (e.g. 2026-06-27.log) are ignored.
3. activeGates = gatesForApprovalLevel(levelFromProjectMd(PROJECT.md), { archetype })
4. cursor      = verdicts entry with max ts  (null → position 'idle')
5. joinVerdicts= { j: verdicts[j] } for j in transitions[cursor.agent].join
6. decision    = decideNext({ agent: cursor.agent, transitions,
                              verdict: { agent, verdict: cursor.verdict },
                              joinVerdicts, activeGates })
7. map decision.kind → position + next + gates  (table below)
8. stages      = pipelineOrder(transitions) annotated per-agent status
```

`decision.kind` maps one-to-one onto the reported `position`:

| `decideNext` kind | `position` | `next` | `gates` |
|---|---|---|---|
| `blocked` | `blocked` | `[]` (non-actionable) | — |
| `gate` | `awaiting-gate` | `rule.next` | active gates on the edge |
| `next` | `ready-to-dispatch` | `rule.next` | `[]` |
| `join-wait` | `join-wait` | pending join partners | active gates (if any) |
| `done` | `complete` | `[]` | — |
| `no-verdict` | `no-verdict` | — | — |
| (no cursor) | `idle` | `[]` | — |

Per-stage status in the ordered view: `blocked` (verdict is a blocked token) >
`current` (agent == cursor) > `next` (agent ∈ next) > `done` (has a success verdict) >
`pending` (no verdict). `pipelineOrder` is a BFS from root agents (those never named
in another agent's `next`, i.e. `product-owner`) following `next` edges; off-chain
contract-stage specialists (`ai-prompt-architect`, `db-migration-reviewer`, …) are
appended only when they have a verdict.

## API / data contract

`pipelinePosition({ transitions, verdicts, activeGates, now })` is pure and returns:

```js
{
  cursor:   { agent, verdict, ts, ageMs, fresh } | null,
  position: 'blocked'|'awaiting-gate'|'ready-to-dispatch'|'join-wait'|'complete'|'no-verdict'|'idle',
  next:     string[],   // agents to run next; [] when blocked/complete/idle
  gates:    string[],   // active gates guarding `next`; [] if none
  stages:   [ { agent, status, verdict, ts, ageMs, fresh } ],  // pipeline order
  summary:  string      // one-line human answer
}
```

This shape is a **public JSON contract** (`--json`) under the repo's `api-stability`
compliance — document the fields; a breaking change needs a note in the ADR history.

## CLI contract

```
node scripts/lib/pipeline-position.mjs [--json] [--dir <projdir>] [--exit-code]
```

- default: a human table (stages + one-line `Position:` summary), `exit 0`.
- `--json`: the structured object above, `exit 0`.
- `--dir`: project dir (default `.great_cto`) — the only path input; no traversal beyond it.
- `--exit-code`: opt-in scripting mode — `exit 2` when `position === 'blocked'`, else `0`. Off by default so the tool stays purely informational.

Human render sketch:

```
Pipeline: great_cto   (approval-level: gates-only)

  ✓ product-owner   APPROVED   2d ago
  ✓ architect       DONE       3h ago    ← current
  ⏸ pm              —          behind gate:arch (not approved)
    senior-dev      —          pending
    …
Position: awaiting-gate — architect succeeded; pm is behind gate:arch.
```

## Security

Read-only, local, no network, no secrets, no PII. It only reads files already in
the project (`pipeline.toml`, verdict logs, `PROJECT.md`) and writes nothing. Verdict
log lines are treated strictly as data — parsed field-by-field, never executed or
interpolated into a shell/eval. Path input is confined to `--dir`; there is no
user-supplied path that reaches beyond the project dir. No new attack surface.

## Risks and the safeguards that answer them

- [ ] **S1 (data-fidelity, correctness):** a `BLOCKED`/`FAIL`/`REJECTED` newest
      verdict MUST render as `position: 'blocked'` with `next: []` — a blocked
      pipeline is never presented as ready to proceed. Covered by a dedicated test.
- [ ] **S2 (no side effects):** the lib and CLI never write, mutate, spawn, or open a
      socket. A test asserts the module performs no fs-write / no child-process call.
- [ ] **S3 (single source of transition truth):** `next` and `gates` come from
      `decideNext`, not from logic re-derived in this lib. A test feeds one fixture to
      both `decideNext` and `pipelinePosition` and asserts they agree.
- [ ] **S4 (api-stability):** the `--json` field set is documented and treated as a
      contract; a shape change is a noted, reviewed change.

## Rollback

- **Compute/deploy surface:** revert the commit — one new file plus one additive
  export line. Nothing else references the new file.
- **Schema/data surface:** none. No migration, no writes, no persisted state to
  reverse. Both surfaces answered.

## Cost Estimate

No new cloud components — no cost delta. Pure local CLI over files already on disk.

## Cost Model

Runtime cost: none (local file reads; no compute, DB, API, or transfer). N/A for a
read-only local tool — no unit economics to model.

## Requirements Checklist

> qa-engineer verifies each at QA.

- [ ] REQ-1: `pipelinePosition()` selects the cursor as the newest verdict *event*, and returns `position: 'idle'` when no verdict logs exist.
- [ ] REQ-2: `next` and `gates` are produced by `decideNext` (not re-derived), and `gates` reflect the project's approval-level + archetype via `gatesForApprovalLevel`.
- [ ] REQ-3: a blocked newest verdict yields `position: 'blocked'` and `next: []` (safeguard S1).
- [ ] REQ-4: stale verdicts (> 30 min) appear in `stages` labeled `fresh:false`, not filtered out.
- [ ] REQ-5: the CLI prints a human table by default and the JSON contract on `--json`; both `exit 0`; `--exit-code` returns 2 only on `position: 'blocked'`.
- [ ] REQ-6: no new runtime dependency; ESM, `node:` builtins only; imports the shared pure functions rather than copying them (S3).
- [ ] REQ-7: the module performs no writes / no process spawns (safeguard S2).

## Definition of Done

- `pipelinePosition()` unit tests cover: idle (no logs), success→gate, success→dispatch, blocked, join-wait, complete, stale-label, and ADR-005 re-entry (newest-event wins over an older downstream success).
- CLI smoke test asserts the `--json` shape and a non-empty human render.
- `node --test` green; `git grep` confirms no new `dependencies` entry and no `/Users/` path in the new file.
- The `--json` field set is listed in this ARCH's API contract section (done above).
