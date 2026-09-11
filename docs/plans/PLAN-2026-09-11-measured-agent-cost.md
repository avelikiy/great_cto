# PLAN — Measure each agent run, and say when it ran on another model

**Status:** released in 3.28.5 · **Date:** 2026-09-11 · **Owner:** senior-dev
**Beads:** `great_cto-ja2u` (T1), `great_cto-z6cd` (T1), `great_cto-y4oq` (T2), `great_cto-xzpa` (T3) ·
out of scope, filed: `great_cto-601c`, `great_cto-z2jm`
**Unblocks:** [What leaves Claude Code, and what it costs to move it](PLAN-2026-09-09-openrouter-routing.md),
whose §1 is "no agent has been measured".
**Sources:** HarnessRouter CE `docs/harness-verification.md` rule 2 and conformance C-03 / report
states; UltraContext `packages/parsers` (both Apache-2.0). Ideas taken, no code copied.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a subagent's measured cost lands against that agent, together with whether it ran on the
model it asked for; a timed-out Codex review leaves no process behind; a gate with skipped tests
does not print the banner that means "everything was checked".

**Architecture:** one new pure lib (`scripts/lib/subagent-cost.mjs`) that the SubagentStop hook
calls; a process-group spawn in `codex-exec`; one new pure lib (`scripts/lib/count-skips.mjs`) that
`ci-local.sh`'s `step()` calls on each step's output.

**Tech stack:** Node ≥ 20 ESM, `node:test`, bash (macOS `/bin/bash` 3.2 must work).

## Global constraints

- Three states, never two: `match` / `substituted` / `unverifiable`; `unverifiable` is not `match`.
- `cost-history.log` line prefix stays `<ts> <agent> <usd> turns=N …` — nine readers parse it;
  new data goes only in trailing `key=value` fields.
- Hooks fail open: nothing added here may block a subagent stop.
- No private project names, no `/Users/<name>` paths in committed files.
- `ci-local.sh` exit code semantics do not change (`cd-local.sh` depends on them).

---

## 0. What is wrong, measured

| | Evidence (2026-09-11) |
|---|---|
| SubagentStop reads the wrong file | Claude Code 2.1.260 declares the SubagentStop input as `{agent_id, agent_transcript_path, agent_type, stop_hook_active, last_assistant_message}`. The hook reads `transcript_path` — the **session** transcript. |
| Consequence | 8 `cost-history.log` lines in September, **0** attributed to an agent with a figure; the August lines are `(unattributed) 3752.2003 turns=9799` and similar — the 400-turn guard catching the session every time. |
| Same field, second use | `main()` passes `transcript_path` to `stopShape`, so cut-off detection also reads the whole session. |
| Model never compared | `usage-from-transcript` records `message.model`; nothing compares it with `model:` in `agents/*.md` (59 `sonnet`, 5 `haiku`, 4 `claude-opus-5`, …). |
| Codex timeout | `runCodexExec` spawns without a process group and `SIGKILL`s only `proc`. |
| Gate banner | `step()` judges by exit code; `node --test` exits 0 with skipped tests. |

## Task 1 — Attribute measured cost to the agent, with a model check (`ja2u`, `z6cd`)

**Files:** create `scripts/lib/subagent-cost.mjs`, `tests/lib/subagent-cost.test.mjs`,
`tests/hooks/subagent-stop-measured-cost.test.mjs`; modify
`scripts/hooks/subagent-stop-completion.mjs` (`recordMeasuredCost`, `main`),
`verification/witness.json`.

**Produces** (`scripts/lib/subagent-cost.mjs`):

```js
stopTranscript(payload) → { path: string|null, source: 'agent'|'session'|null }
stopAgent(payload)      → string|null            // agent_type without the great-cto: prefix
requestedModel(agentsDir, name) → { model: string|null, advisor: string|null }
sameModel(asked, served) → boolean               // vendor prefix and date/version suffix are aliases
modelCheck({ model, advisor }, servedModels) → { state, requested, served: string[], why }
costLine({ ts, agent, measured, check }) → string // legacy prefix + model= asked= served=
```

Rules:
- `agent_transcript_path` wins; `transcript_path` is the legacy fallback and keeps the existing
  400-turn `(unattributed)` guard.
- A frontmatter alias (`opus|sonnet|haiku|fable`) matches any served id of that family; an exact id
  matches by `sameModel` (`claude-haiku-4-5` ≡ `claude-haiku-4-5-20251001`; `claude-fable-5` ≠
  `claude-fable-5-1`; `-lite` is never an alias).
- The agent's `advisor-model:` is an allowed served model, not a substitution.
- `inherit`, no `model:`, a non-great_cto agent, or no served model → `unverifiable`.
- `<synthetic>` and `unknown` are not served models.
- A substitution is reported on stderr as `[great_cto:model] <agent>: asked X, served Y`; never blocks.
- Timestamp: the agent's own verdict line if written within the completion window, else now —
  never another agent's newest verdict.

Steps:
- [ ] Write `tests/lib/subagent-cost.test.mjs` (pure cases above) — run, see it fail on the missing module.
- [ ] Write `tests/hooks/subagent-stop-measured-cost.test.mjs`: run the hook with a temp
  `GREAT_CTO_DIR` and `GREAT_CTO_AGENTS_DIR`, a 500-turn session transcript and a 3-turn agent
  transcript. Expect `senior-dev <usd> turns=3 … model=match asked=sonnet`; a served
  `claude-opus-5` gives `model=substituted` plus the stderr note; a payload with only
  `transcript_path` still gives `(unattributed)`.
- [ ] Implement the lib; run both files green.
- [ ] Wire the hook: `recordMeasuredCost` and the `stopShape` call in `main` use `stopTranscript`.
- [ ] Full hook + lib suites green (`node --test tests/hooks/*.test.mjs tests/lib/subagent-cost.test.mjs tests/lib/usage-from-transcript.test.mjs`) and the board's cost-history parser test.
- [ ] Witness entry for the `agent_transcript_path` read. Commit.

## Task 2 — A timed-out Codex run leaves nothing behind (`y4oq`)

**Files:** modify `scripts/lib/codex-exec.mjs` (`runCodexExec`), `tests/lib/codex-exec.test.mjs`.

- Spawn with `detached: true` on POSIX, so the CLI leads its own process group.
- On timeout: `process.kill(-pid, 'SIGKILL')`, falling back to `proc.kill`. On close: the same,
  best effort, so a child the CLI left running does not outlive the review.
- Result gains `timedOut: boolean`; a timed-out run is never `state: 'ok'` (a truncated answer is
  not an answer) and carries `timed out after <ms>ms` in `errors`.

Steps:
- [ ] Test: a fake `codex` that starts `sleep 60 &`, writes the child pid, and waits. With
  `timeoutMs: 400`, the result has `timedOut: true`, `state !== 'ok'`, and the child pid is gone.
  Run — fails (child survives).
- [ ] Implement; check consumers of `state` (`cross-model-review`, `second-opinion`,
  `codex-pipeline`) still read the result correctly; suite green. Commit.

## Task 3 — Skipped tests are not "all gates green" (`xzpa`)

**Files:** create `scripts/lib/count-skips.mjs`, `tests/lib/count-skips.test.mjs`; modify
`scripts/ci-local.sh` (`step()`, final banner), `verification/witness.json`.

- `countSkips(text)` sums TAP `# skip N` and spec `ℹ skipped N` summary lines; CLI prints the
  number for a log file.
- `step()` tees each step's output to a temp log, takes the command's status from
  `PIPESTATUS[0]`, and records `name: N` when N > 0. No bash arrays (bash 3.2 with `set -u`).
- Banner: `ALL GATES GREEN` only when nothing failed **and** nothing was skipped; otherwise, with
  no failures, `GREEN, N TEST(S) SKIPPED — NOT CHECKED` plus the per-step list. Exit 0 in both
  cases — a skip is "not checked", not a failure, and `cd-local.sh` keys on the exit code.

Steps:
- [ ] Tests: TAP sum across two runs; spec reporter; zero; a subtest *named* "skip" is not counted;
  shape: `ci-local.sh` calls `count-skips.mjs`, reads `PIPESTATUS[0]`, and prints
  `ALL GATES GREEN` only inside the branch where the skip total is 0. Run — fail.
- [ ] Implement lib and `step()`; run `bash scripts/ci-local.sh --quick` and read the banner.
- [ ] Witness entry. Commit.

## Task 4 — Codex session parser: not built now (`z2jm`)

Nothing consumes it. `codex-exec` runs `--ephemeral` and already takes `usage` from the `--json`
stream; the real Codex gap is that `gpt-5.6-terra` has no price, which is already reported as
`null`. The format is recorded in the bead so the parser can be built when a Codex Desktop/app
session needs measuring.

## Out of scope, filed

- `great_cto-601c` — `cost-guard` parses `cost_usd=N`, the writer emits a bare number, so budgets
  compare against zero measured spend. Fixing it once Task 1 records real figures can start
  blocking prompts under `enforce=block`; that is a behaviour change to decide on its own.

## Result (2026-09-11)

| Task | Commit | Proof |
|---|---|---|
| 1 — agent-attributed cost + model check | `cecec2ff` | 20 tests; mutation (ignore `agent_transcript_path`) turns 4 red; on real transcripts: `great-cto:senior-dev` → `match asked=sonnet served=claude-sonnet-5`, `general-purpose` → `unverifiable` |
| 2 — Codex timeout kills the group | `6f78469c` | mutation (no process group): `resolved after 30169ms` |
| 3 — skips are not ALL GATES GREEN | `fbe4281c` | real `step()` under `/bin/bash` 3.2; three mutations killed |
| docs | `1f9987a2`, `9d61e8e2` | architecture map; this plan indexed (it had been an orphan and turned the gate red) |

Full `ci-local.sh`: inner exit 0, `ALL GATES GREEN`, no skips, no orphaned runners.

What this does not prove yet:
- A live SubagentStop writing an attributed line. 3.28.5 is installed; it needs a real subagent
  stop in a session started on that version.
- The model check is only valid at stop time. Replayed over an old transcript it compares against
  today's frontmatter: a 2026-08-09 `product-owner` run read as `substituted` because its
  `model:` changed on 2026-09-05.
- `count-skips` does not read `test-pipeline.sh`'s own `– N skipped` summary.
- Found on the way, filed: `great_cto-slm0` — SessionStart copies a hardcoded 55-agent list;
  15 agents had vanished from `~/.claude/agents` and were restored by hand.

## Verification before calling it done

- Full `bash scripts/ci-local.sh` green, read from the inner exit code.
- `docs/reference/architecture-map.md` regenerated and committed (two new libs).
- One real subagent stop after `install-local` writes an agent-attributed line — or, if that
  cannot be observed in this session, the report says so.
