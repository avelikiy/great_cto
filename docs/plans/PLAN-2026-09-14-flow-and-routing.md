# PLAN — A finding the implementer can fix should reach the implementer, and a decision that waits should be counted

**Status:** draft · **Date:** 2026-09-14 · **Owner:** senior-dev
**Applies to:** `scripts/hooks/pipeline-dispatcher.mjs`, `scripts/log-verdict.sh`,
`scripts/lib/verdict-record.mjs`, `packages/board/lib/metrics.mjs`, new
`scripts/lib/flow-metrics.mjs`, the verdict lines of `qa-engineer`,
`security-officer` and `code-reviewer`

**Sources (ideas only, no text copied):**
- `Untrivial-ai/agent-orchestrator` (Apache-2.0): CI failures, requested changes and
  merge conflicts go back to the worker that owns the change; a repeat of the same
  feedback is suppressed by signature; nudges are capped; a nudge that did not
  reach the worker is not recorded as delivered.
- habr 1081076: measure the flow of work — how long it waits for a human, how often
  it goes back — rather than how much code was produced. Opinion, not measurement.

## Measured before deciding

| Fact | Where |
|---|---|
| REWORK already goes back to the agent that ran, capped at 3 passes, then a human | `pipeline-dispatcher.mjs:95`, `:500-523` |
| Every BLOCKED halts the chain and goes to the CTO | `pipeline-dispatcher.mjs:525-531` |
| qa and security already distinguish "senior-dev fix <finding>" from "CTO waive risk" in their BLOCKED contract | `agents/qa-engineer.md:844`, `agents/security-officer.md:870` |
| That distinction is prose only: of this repo's verdict lines, 0 carry `need`, 8 carry `task` | `.great_cto/verdicts/*.log` |
| The board's `rework_rounds` counts BLOCKED/FAIL/REJECTED/CHANGES — and not `REWORK`, the token the dispatcher actually sends work back with | `packages/board/lib/metrics.mjs:18` |
| Gate beads carry `created_at` and `closed_at`. Across the 17 registered projects with beads: 21 gate beads, 19 closed | `bd list --label gate --all --json` |
| No gate wait time is computed anywhere; the DORA baseline records `lead_time_h: N/A` | `.great_cto/dora-baseline.log` |

So the send-back loop exists and is bounded; what is missing is the field that
says who a blocking finding is for. Without it the dispatcher cannot route, and
the board cannot tell a pass that went back from a question that waited for a
human.

**Not known, and task 1 is what makes it knowable:** how many past BLOCKED
verdicts were fixable by the implementer. Nothing records it.

**Goal:** a blocking finding the implementer can fix goes back to the
implementer, bounded, without paging the CTO; a finding that needs a decision
still stops the chain; and the time a decision waits is a number with its sample
size next to it.

## Global constraints

- Three states. `need` absent is `undeclared`, and undeclared never auto-routes:
  it halts exactly as BLOCKED does today. A new field must not turn silence into
  permission.
- The dispatcher still never spawns anything and never approves a gate. It emits a
  directive; the orchestrator acts.
- Legacy verdict lines keep parsing. No history rewrite.
- A metric with n < 5 is printed as its count and values, not as a trend.
- Every new rule gets a test written red first and at least one mutation killed.

---

## Task 1 — `need` becomes a field

**Files:** `scripts/log-verdict.sh`, `scripts/lib/verdict-record.mjs`,
`agents/qa-engineer.md`, `agents/security-officer.md`, `agents/code-reviewer.md`;
tests in `tests/lib/verdict-record.test.mjs`.

`need=implementer|decision` and `finding=<short id>` in the verdict meta.
`implementer` means the owning senior-dev can fix it with no human choice;
`decision` means a waiver, a scope change or a trade-off.

- [ ] Test: a BLOCKED record without `need` reads as `undeclared`; an unknown value
      is a validation error, not a silent `decision`.
- [ ] The three agents' verdict instructions write `need=` on every BLOCKED.
- [ ] Lint + tests + commit.

## Task 2 — the dispatcher routes `need=implementer` back to the owner

**Files:** `scripts/hooks/pipeline-dispatcher.mjs`; tests in
`tests/hooks/pipeline-dispatcher.test.mjs`.

Owner = the agent that recorded the task's implementation verdict (`task=` in its
meta). If no owner is found, the finding is not routable — halt as today.

- [ ] `need=implementer` + owner found → `PIPELINE-ROUTE`: re-spawn the owner with
      the finding quoted verbatim; do not spawn downstream.
- [ ] Cap per task: the same MAX_REWORK (3) shared with REWORK, so the two
      send-back paths cannot each run three times.
- [ ] Dedup by signature (`task + finding`): the same finding does not route twice
      in a row; a second occurrence after a fix counts toward the cap.
- [ ] Past the cap, or `need=decision`, or `undeclared` → the existing halt.
- [ ] Replay: run the dispatcher over this repo's recorded verdict logs and show
      that no existing chain changes behaviour (all are `undeclared`).
- [ ] Lint + tests + commit.

## Task 3 — rework is counted as rework

**Files:** `packages/board/lib/metrics.mjs`; its tests.

- [ ] `rework_rounds` counts `REWORK` and routed BLOCKED; a new `decisions` count
      holds `need=decision` and `undeclared` BLOCKED.
- [ ] Test: a REWORK verdict increments `rework_rounds` (it does not today).
- [ ] Commit.

## Task 4 — how long a decision waits

**Files:** new `scripts/lib/flow-metrics.mjs`; a board route; one line in
`/inbox`; tests in `tests/lib/flow-metrics.test.mjs`.

From gate beads: for closed gates, `closed_at - created_at`; for open gates, the
age of the oldest. Output per project and total: `n`, median, max, oldest open.

- [ ] `bd` unreadable → `not measured`, never 0.
- [ ] n < 5 → the values listed, no median.
- [ ] `/inbox`: "oldest open gate: <name>, waiting <age>" when one exists.
- [ ] Lint + tests + commit.

## Not in this plan

- **An observer for PR and CI state.** GitHub Actions on this account is
  billing-locked and the gate is local (`ci-local.sh`); there is no remote CI to
  observe. Revisit when CI runs remotely.
- **A `no-signal` state in the fleet view** (agent-orchestrator: an agent that
  could report and did not is not idle). The fleet marks `idle` after 30 days
  without runs (`packages/board/lib/fleet.mjs:192`). Worth its own small plan.
- **Plan lifecycle** (`status`, `owner`, a result section, checked by
  `artifact-lint`) — habr 1081076. Separate.

## Verification before calling it done

- Full `bash scripts/ci-local.sh` green on Node 22, read from the inner exit code.
- The replay in task 2 shows no change in any recorded chain.
- One live pipeline run where qa records `BLOCKED need=implementer` and the next
  directive is `PIPELINE-ROUTE` to senior-dev, not a halt.
