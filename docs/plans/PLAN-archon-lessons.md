# PLAN: what great_cto takes from Archon, and in what order

**Date:** 2026-11-13
**Status:** Draft — item 1 (ADR-051, accepted 2026-11-13) implemented in full; items 2–7 await the owner
**Inputs:** a side-by-side read of [coleam00/Archon](https://github.com/coleam00/Archon) v0.14.0
(commit `2aabbd0`) and great_cto v3.79.0 (commit `a8032db`), every claim below re-checked
against great_cto's own tree.
**Related:** [ADR-051 verdict authority](../adr/ADR-051-verdict-authority.md) ·
[ADR-046 verdict seals](../adr/ADR-046-verdict-seals.md) · [ADR-049 board starts work](../adr/ADR-049-board-starts-work.md) ·
[ADR-018 dynamic workflows](../adr/ADR-018-dynamic-workflow-orchestration.md) · [ADR-021 live agent events](../adr/ADR-021-live-agent-events.md)

## Frame

Archon is an engine plus a YAML DSL: the user authors the process. great_cto ships the process
and argues from evidence. ADR-018 stopped at Phase 0 on 2026-05-29, and that stays right — a
general workflow builder makes great_cto a late copy of Archon. What is worth taking is
**mechanism that slots into `shared/pipeline.toml` and the controller**, not the DSL.

Where great_cto is already ahead and must not regress:

- **Proposals, not writes.** Controlled workers are read-only and return file proposals; the
  controller validates and is the only writer; a separate verifier session answers
  `verified | rework | unverifiable`. Archon agents write to the worktree directly.
- **Receipts.** `scripts/lib/receipt.mjs` fingerprints the reviewed tree file by file, dirty
  state included. Archon binds a verdict to the head SHA only.
  `packages/board/lib/merge-readiness.mjs:86` already counts only verdicts whose
  `receipt.head` equals the branch head.
- **Floors.** `REGULATED_FLOOR` and `IRREVERSIBLE_FLOOR` (`scripts/lib/approval-level.mjs`)
  hold even at `approval-level: auto`. Archon has no equivalent.
- **Permission posture.** Archon runs Claude with `permissionMode: 'bypassPermissions'` and
  Codex with `approvalPolicy: 'never'`. Not to be copied.

## Blockers found on the way (outside the Archon comparison, but first in line)

| # | Finding | Evidence | Owner action |
|---|---|---|---|
| B1 | `init` refuses in production: no release key is enrolled | `packages/cli/src/release-trust.mjs:392-395` pins `NOT_ENROLLED`; README L45-54 says so | Key ceremony (ADR-045/050). Cannot be done by an agent: it is the owner's signing key. Until then the current version has no install path except the legacy 3.70.1 flow. |
| B2 | ADR-049 is Accepted, `POST /api/work/start` does not exist | no route in `packages/board/lib/routes.mjs` | Already planned in `docs/rfc/PLAN-phase1-cockpit.md` (13–19 days, mockup approval first). Not duplicated here. |
| B3 | ADR-040 and ADR-048 still say Proposed while their code ships | `docs/adr/ADR-040-*.md`, `ADR-048-*.md` | Owner accepts or rejects; a status line is not an agent's to change. |

## Items

Ordered by trust gained per day of work. Estimates are judgement, not measurement.

### 1. Verdict authority — who may write a role's verdict  ·  ADR-051  ·  3–5 days total

**Gap.** ADR-046 says it plainly: "an agent can run `log-verdict.sh qa-engineer PASS` without
being the QA agent". The seal proves the writer ran, not who asked it to. `gate-state.mjs:40`
says the same of gate beads. Every one of the 73 agents calls `log-verdict.sh` itself.

**Archon's lesson.** A review verdict is written by a script from the role's structured output,
and only an author the system trusts counts.

**Slices.**

| Slice | What | Size | State |
|---|---|---|---|
| 1 | **Identity guard.** PreToolUse refuses a subagent writing a verdict under another role's name, and refuses any shell or edit-tool write, truncation or deletion of `.great_cto/verdicts/*.log` other than through the writer. | 1 day | **this branch** |
| 2 | **Harness attestation.** PostToolUse on a subagent's writer call appends `{agent_id, agent_type, line digest}` to a sealed attestation log; `receipt.mjs --verify --require` and merge-readiness show *attested* vs *self-reported*. | 2 days | implemented |
| 3 | **Regulated archetypes require attested or controller-written verdicts** for code-reviewer, qa-engineer, security-officer before `gate:ship`. | 1 day | implemented |

Slice 1 is a speed bump with a known way round (a variable holding the writer's path, a node
one-liner). It is shipped first because it turns the documented accidental path into a refused
one at zero cost to honest agents: all 73 agent prompts already write only their own name.
Slice 2 is the part that does not depend on parsing a shell command.

### 2. `pipeline dry-run` over stub verdicts  ·  2 days

**Gap.** A project may override `pipeline.toml`. A broken join, an unreachable stage or a
verdict token with no rule is found on a live, paid run.

**Archon's lesson.** `packages/workflows/src/dry-run.ts` + `fixtures/*.stubs.yaml`: stub every
node's output, assert the outcome and the set of nodes reached, call no provider.

**Shape.** `great-cto pipeline dry-run --stubs verdicts.yaml [--pipeline path]` drives the same
transition logic the dispatcher uses (`pipeline-dispatcher.mjs` / `pipeline-tick.mjs`) with
verdicts from the file, and prints the stage sequence, every hold at a gate, and every
`no-rule` / `unknown-verdict` / `no-map` outcome the journal would have recorded. Fixtures for
the shipped `pipeline.toml` go into CI, so a change to the graph is checked like code.

### 3. One event log, not five  ·  4–6 days, largest refactor

**Gap.** Run state lives in `codex-runs/*.json`, `pipeline-runs.jsonl`, `work-tasks/*.json`,
`tasks.db` and `verdicts/*.log`, and three engines (native hooks, controller, ZRS worker) each
write their own. `events.jsonl` (ADR-021) exists but carries facts for the board stream only.

**Archon's lesson.** One append-only event table with `event_order`; resume state is derived
from events (`getDagResumeSnapshot`); a CAS `execution_claim` stops a stale executor from
overwriting a new one.

**Shape.** Not a new store: promote `events.jsonl` into a `node:sqlite` table next to
`task-store.mjs`, have the journal, verdict writer and controller trace append to it, and make
the board's execution graph a query. Phase it: dual-write first, readers switch, old files
become views. Needs an ADR before work starts.

### 4. One attention queue  ·  3 days, after item 3

**Gap.** A human is asked through beads gates, board tokens, `/inbox`, the gates pane and the
task phase `needs_decision`. No single model of "what is waiting for me".

**Archon's lesson.** A discriminated union `attention | awaiting_response | usage_limit |
unreadable`; a form typed `approval | select | multi_select | message`; a
`recommendation {option, why, confidence}`; `revision` + `occurrence_id`, so an answer to an
occurrence that already closed is refused; `pause_cause` (`wait | gate | child | quota`).

**Shape.** Project every gate and controller `manual-action` into one queue built on item 3.
Board, CLI and pane become ways to answer it. `recommendation` fits the product and architect
decisions: the role proposes, the human confirms.

### 5. Budgets in USD, refused before an attempt starts  ·  2 days

**Gap.** `docs/DETAILS.md` (Limitations): per-agent cost is a ceiling, not a measurement,
because the hook sees a session-wide transcript; a stage with no measurement has no budget.

**Archon's lesson.** `budget.max_spend_usd` per run and `maxBudgetUsd` per node; a new attempt
is refused (`run_budget_refused`) on the provider's own reported cost; Codex's missing cost is
`total_tokens_unknown`, never zero.

**Shape.** The controller already runs one stateless call per stage, so each stage's cost comes
from that call's JSON result. `run-budget.mjs` refuses the next attempt, and ADR-049 rule 2 (a
budget is required) gets its enforcement point.

### 6. Provider contract with capability flags  ·  3 days

`HOSTS` is two hard-coded values. Archon's `IAgentProvider` declares `sessionResume`,
`structuredOutput: enforced | best-effort`, `mcp`, `skills`, `costControl`, and a run refuses
to start if a node needs something its provider cannot load. Separately worth a spike: Archon
drives Codex through `codex app-server` (JSON-RPC: streaming, resume) rather than `codex exec`.

### 7. Eval set for the reviewer roles  ·  3 days

Archon keeps real PRs with seeded `known_defects` and a judge over them
(`.archon/sdlc/eval/review/set.json`). great_cto's Insights are honestly labelled "not quality
scores"; a seeded-defect catch rate is the legitimate quality number for code-reviewer and
security-officer, and the one a fintech buyer asks for.

### Later

- **Two-way Slack** on top of item 4 (Archon: Block Kit answer buttons).
- **Path lock and resource slots** if ADR-047 (worktree per task) stops being opt-in.
- **Model tiers** `small | medium | large` with an `@alias` per role.

## Not taken

| Archon mechanism | Why not |
|---|---|
| `bypassPermissions` / `approvalPolicy: 'never'` | Read-only workers + one writer is stricter; for regulated work it is the product. |
| Visual builder, general YAML DSL | Contradicts the opinionated process. At most `trigger_rule` and `when` for `pipeline.toml`. |
| Auto-merge | "The board never merges" stays. If merge ever comes: behind `gate:ship`, CAS on head. |
| Container overlay backend | Archon's own SECURITY.md: not a sandbox against a hostile agent. |
| Better Auth on Postgres | One builder, loopback-only bind (ADR-048) is enough. |

## Order

| Sprint | Items | Why this order |
|---|---|---|
| 0 | B1 (owner), item 1 slice 1 | Nothing else matters if nobody can install; slice 1 is a day. |
| 1 | item 1 slices 2–3, item 2 | Trust model and graph checks: little code, large effect. |
| 2 | item 3, then item 4 | The refactor; the queue needs the log. |
| 3 | items 5, 6 | Budgets and provider contract; then the Codex app-server spike. |
| 4 | item 7 | Needs stable reviewer roles to measure. |
