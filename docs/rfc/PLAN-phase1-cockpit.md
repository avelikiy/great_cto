# Plan: phase 1 — the cockpit in the board

**Status:** The governing ADR was accepted on 2026-11-11 as
[ADR-049](../adr/ADR-049-board-starts-work.md). Slice S1 may start once these documents are committed.
**Date:** 2026-11-11
**Source:** [RFC-cockpit-for-non-developers.md](RFC-cockpit-for-non-developers.md) (phase 1),
[ADR-049](../adr/ADR-049-board-starts-work.md), approved mockups
(first run and Home: `https://claude.ai/artifact/1aEcghVTBUJYnzwrXtAejq` version 7; decision
screen: `https://claude.ai/artifact/1Rh5ciqwVNhcWfuQpfxHiV` version 5).

## What reading the controller showed

The open question was whether the existing controller can drive Claude Code stages. It can,
and most of what the ADR draft asks for already exists.

| Requirement from the ADR draft | Already in the code | Where |
|---|---|---|
| The controller owns the stops; a stage cannot run into the next one | yes. One stage per subprocess; the loop runs only while the run is `ready`; a gate sets a pending token and the process exits | `scripts/codex-pipeline.mjs:201-204`, `docs/HOST-CODEX.md` "Implemented controls" |
| A decision is a record with a one-time token; model output cannot approve it | yes | `approve`, `reject`, `approve-task` in `scripts/codex-pipeline.mjs:186-195` |
| Claude Code as the host of a role | yes, per role, with `--routes role=claude-code` | `scripts/lib/codex-pipeline.mjs:39,49`, `scripts/lib/claude-exec.mjs` |
| Sign-in is probed, not assumed | yes: `claude --version` and `claude auth status --json`, `loggedIn === true` | `detectClaude`, `scripts/lib/claude-exec.mjs:16-25` |
| A failed call is a failed stage (`is_error`, bad JSON, timeout) | yes | `parseClaudeResult`, `scripts/lib/claude-exec.mjs:27-37` |
| The agent cannot write; the controller is the only writer | yes, stricter than the worktree rule: Claude runs with `--safe-mode --restricted --tools Read,Glob,Grep`, no hooks, no plugins, and returns file proposals that the controller validates and writes | `scripts/lib/claude-exec.mjs:44-46` |
| No session-end learner spending outside the budget | yes for controlled stages: safe mode removes hooks, and `--no-session-persistence` is set | same lines |
| Stop, recover, reject with a reason | yes | `cancel`, `recover`, `reject` |
| One unfinished run per project | yes | `scripts/codex-pipeline.mjs:112-113` |
| Task record linked to the run | yes | `beginWork`, `linkWork`, `observeWorkRun` in `scripts/lib/work-tasks.mjs` |

So phase 1 is mostly wiring and four gaps, not a new engine.

### Gaps

| # | Gap | Evidence |
|---|---|---|
| G1 | **The verifier is always Codex.** A user with only Claude Code cannot complete a stage | `scripts/lib/codex-pipeline.mjs:205` (`agent = 'codex-verifier'`), `:878-880` (`host: 'codex'`, `execute \|\| runCodexExec`) |
| G2 | **A controlled task must have host `codex`.** The entrypoint refuses any other task host and creates tasks as `codex`; in the CLI the `claude-code` host means the interactive native session | `scripts/codex-pipeline.mjs:106,109,165`; `packages/cli/src/run.ts:146-176` |
| G3 | **Unlisted roles default to Codex.** A Claude-only start has to route every role explicitly | `roleHost`, `scripts/lib/codex-pipeline.mjs:49` |
| G4 | **No model and no money cap per Claude call.** `runClaudeExec` passes neither `--model` nor `--max-budget-usd`; the stage timeout is fixed at 300 s | `scripts/lib/claude-exec.mjs:44-46`, `scripts/lib/codex-pipeline.mjs:789` |
| G5 | **Gate reductions are not applied by default**: every gate declared on a selected edge is enforced unless a gate policy file is passed. "Two stops" needs such a policy, and a regulated tier refuses skips | `docs/HOST-CODEX.md` "Boundaries"; `scripts/lib/codex-pipeline.mjs:497-526` |
| G6 | **The board does not call the controller** to start, stop or decide. It calls the operator script only for publication | `packages/board/lib/routes.mjs:57,164,190,740` |
| G7 | **Task records do not say failed / finished / waits for a decision** in a way Home can show. Seen in the headless check for native sessions; to be re-checked for controlled runs, where `observeWorkRun` projects the run status | `scripts/lib/work-tasks.mjs:194`, RFC "Headless check" |

### Limits the user will meet (existing, documented)

From `docs/HOST-CODEX.md` "Boundaries": full-text file proposals only — no file deletion, no
binary files; tests that need to write run only through the optional offline Docker executor,
which a non-developer does not have; at most 32 worker stages per run; `devops` ends in
`manual-action` unless a release adapter is configured. The mode is marked experimental.

**What this means.** The first cockpit can honestly promise "plans, writes and reviews code
in your folder, with you deciding twice". It cannot yet promise "runs your tests" on a
machine without Docker, or "puts it live". Home and the decision screen must say what was
and was not checked — the "Checked by" line in the approved mockup is where that goes.

Not checked while reading: whether a controlled run works in a git worktree per task
(ADR-047) or in the project tree; how well Claude-hosted roles perform on real tasks (the
existing tests use fake workers).

## Slices

Each slice ends with its own tests green and the local gate green on the merge result.
Days are focused work, without waiting for approvals.

| # | Slice | Write zone | Depends on | Done when | Days |
|---|---|---|---|---|---|
| S1 | **Claude-only controlled run.** Verifier host follows a route (G1); controlled tasks may have host `claude-code` in a distinct controlled mode (G2); a start option routes every role and the verifier to one host (G3) | `scripts/lib/codex-pipeline.mjs`, `scripts/codex-pipeline.mjs`, `scripts/lib/work-tasks.mjs`, `tests/lib/codex-pipeline.test.mjs` | ADR accepted | with fake workers and no Codex binary on `PATH`, a run goes entry → gate → approve → next stage → done; a mixed run still works; the interactive `great-cto run` path is unchanged | 3–4 |
| S2 | **Money and model per call** (G4): model and per-call cap passed to Claude; spend summed into the task budget; the run stops and raises a decision at the budget | `scripts/lib/claude-exec.mjs`, `scripts/lib/agent-execution-budget.mjs`, tests | S1 | a fake worker reporting cost over the cap blocks the run with a budget decision; nothing continues after it | 1–2 |
| S3 | **Two stops for cockpit projects** (G5): a generated gate policy for `product-only`; regulated tiers keep all their gates | `scripts/lib/gate-policy.mjs` (generated), `packages/cli/src/archetypes.ts`, tests | S1 | a fixture run stops exactly at "what gets built" and "ship"; a regulated fixture refuses the reduction and says why | 1–2 |
| S4 | **Task states Home can show** (G7): failed-to-start, running, waits for a decision, finished, stopped by the user | `scripts/lib/work-tasks.mjs`, `packages/board/lib/work.mjs`, tests | S1 | each state reached in a test and visible in `GET /api/work`; a start that fails before the first model call leaves no waiting task | 1–2 |
| S5 | **Board routes** (G6): readiness (Claude probe, project folder, git); start with goal, folder and budget; stop; approve and send back through the controller's token protocol. Origin-checked; every start, stop and refusal is an event | `packages/board/lib/routes.mjs`, new `packages/board/lib/start.mjs`, `packages/board/server.mjs` only if needed, `tests/` | S1, S4 | route tests for every refusal in the ADR; a detached controller survives a board restart and is found again; a second start is refused | 3–4 |
| S6 | **Screens, exactly as approved:** readiness, Home with the start box and the team strip, decision screen; desktop and 390 px | `packages/board/public/index.html` | S5; approved mockups | E2E journeys with a fake Claude binary: first run with Claude absent → present; start; decision approve; decision sent back with a note; stop. a11y baseline holds. Screenshots compared with the mockups and given to the owner | 3–4 |
| S7 | **Proof on a real run**: one paid controlled run on a throwaway project, started from the board | none (evidence only) | S6 | the run stops at "what gets built" with nothing built; approve continues; cost recorded next to the budget | 1 |

Total: about 13–19 days, in line with the revised RFC estimate.

### Order and parallel work

S1 first, alone: everything else builds on it. Then S2, S3 and S4 touch the same library
files as each other in places (`work-tasks.mjs`, `codex-pipeline.mjs`), so they run one after
another, not in parallel. S5 can start once S4's state names are fixed. S6 is one writer in
`index.html` (it is a single 10k-line file; two writers there do not merge). S7 last.

### What needs the owner before or during

| When | What |
|---|---|
| Done 2026-11-11 | "Board may start work" accepted as ADR-049 |
| Done 2026-11-11 | Verifier on a Claude-only machine: a fresh Claude session, named as such in "Checked by" (ADR-049, rule 15) |
| Before S5 | Default budget per task shown on the start form (the mockup shows $10 as sample data) |
| Before S6 | Nothing new if the screens match the approved versions. Any deviation goes back to Claude Design first |
| S7 | Run or approve the paid check (a project hook forbids agent sessions from calling `claude -p`; whether it also covers a controller started by the board was not tested) |
| Any time | Anthropic's answer on driving the user's CLI. A "no" replaces the Claude executor's sign-in path with an API key; the controller, routes and screens stay |

## Not in phase 1

The `.dmg`, the updater, site and README copy, the start form for Codex-only users, deploy to
a live URL, tests on machines without Docker, Windows and Linux.

## Preconditions outside this plan

- Managed plugin activation (ADR-050, accepted, implementation in progress in another
  session): a new user cannot install at all until it lands. Phase 1 can be built and tested
  on a machine that already has the plugin.
- `packages/cli/**` is being edited by another session. Phase 1 touches `scripts/lib/**`,
  `packages/board/**` and one generated file fed from `packages/cli/src/archetypes.ts` (S3).
  S3 is announced to that session before it starts.
