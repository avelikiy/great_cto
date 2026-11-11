# Research: what great_cto can take from takt

**Date:** 2026-11-11
**Subject:** https://github.com/xanymanywka/takt (default branch, commit `8ef7bcc`, 2026-10-26, app version 0.3.1)
**Method:** shallow clone read as data; SPEC, KANBAN, TASK files, the Rust core (`src-tauri/src/*.rs`) and CI were read, and every claim below about takt was checked against the source, not the README alone.
**Scope:** research only. Nothing in great_cto was changed.

## Summary verdict

**Take ideas, not code — and only three of them.** takt is a Tauri desktop app (Rust + React)
that puts a chat UI over a tmux script (`~/.orchestra/agents.py`, not in the repository): one
"conductor" agent (Claude Code, Codex or Antigravity) writes `docs/TASK-<slug>.md` files and
hands them to executor agents, one git worktree each. Progress is the share of ticked boxes in
the task file's `## Acceptance` section.

Most of what takt does, great_cto already has, usually in a stricter form: worktree-per-task
(ADR-047), write zones enforced at write time (`edit-scope-guard.mjs`), "waiting for the
operator" detection from hook events (`session-status.mjs`) rather than screen regexes, quota
and limit tracking (`quota-check.mjs`, `session-usage.mjs`), signed distribution (ADR-045).

**License: PolyForm Noncommercial 1.0.0.** great_cto is MIT and may be used commercially, so
no takt code, text or assets may be copied into great_cto. Every recommendation below is an
idea re-implemented from scratch.

What is worth taking:

1. **Acceptance as a checklist with progress "k of n", where an item counts only with evidence** — takt's progress model, made honest.
2. **Limit handoff with lineage** (`handedTo` / `takeoverOf` on a task) — continue a task on another harness when one hits its limit, and keep the chain visible.
3. **A derived display state with a fixed, tested precedence** — separate what is stored from what is shown.

All three are direct input for the task-tracker / kanban RFC being drafted in another session.

## What takt is, verified

| Part | Where | What it actually does |
|---|---|---|
| Conductor | `src-tauri/src/conductor/mod.rs` | Runs `claude -p --output-format stream-json`, `codex exec --json` (one process per turn, `resume <thread_id>`), or `agy` stream-json. Codex JSONL is translated into Claude's stream-json shape so one parser renders all three. Rules come from `~/.orchestra/INSTRUCTIONS.md` via `--append-system-prompt-file` (Claude), `developer_instructions` (Codex) or prepended to the first message (agy). |
| Executors | `src-tauri/src/jobs.rs` | `agents.py` (tmux, not in the repo) or a built-in PTY runner. Every executor is launched with `--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox` (`agent_command`, jobs.rs:494). |
| Task registry | `~/.orchestra/jobs.json` | `{name: {agent, worktree, task, startedAt, state, handedTo?, takeoverOf?, runner?}}`. takt only reads and passes through `handedTo` / `takeoverOf` (jobs.rs:91-112, 717); the writer is the out-of-repo `agents.py`. |
| Progress | `jobs.rs:217-262` | Parses `- [ ]` / `- [x]` under `## Приёмка` / `## Acceptance` (multilingual header, continuation lines joined). Self-reported by the executor ticking boxes. A failed read of the task file returns zero steps (`unwrap_or_default`, jobs.rs:261). |
| Card state | `jobs.rs:309-325` | Precedence: `limit` (stored or LIMIT regex on the screen) > `done` (stored, or `exited` with all boxes ticked) > `killed`/`failed`/`exited` > `asking` (regex on the last screen line: `?`, `(y/n)`, `Allow`) > `running`. Covered by a unit test (`state_priorities_are_deterministic`). |
| Task file | `src-tauri/templates/INSTRUCTIONS.md` | Sections: Goal / Scope / Do not / Who edits what / Context / Acceptance. Routing by domain: Codex for crypto, auth, payments, migrations; Antigravity for frontend, i18n, docs, tests; Claude for small or disputed work and for continuing after another executor's limit. CodeRabbit `--gate major` before merge. |
| Limits | `src-tauri/src/limits.rs` | Polls `codexbar usage` every 60 s for Claude, Codex, Antigravity (JSON first, text fallback). |
| Kanban | `KANBAN.md` | A hand-kept markdown board (Backlog / In progress / Review / Done). Done lines cite the merge commit and the date. |
| CI | `.github/workflows/ci.yml` | tsc, an i18n key check, `cargo test` on three OSes. **No task key, no PR binding, no check that a PR refers to a task.** |
| Distribution | `release.yml`, `tauri.conf.json`, `scripts/install.sh` | Tauri updater with a minisign public key and `latest.json` in GitHub Releases. First install: `curl | sh`, explicitly to avoid the Gatekeeper quarantine flag; the script also strips the flag and does not verify a checksum or signature of the downloaded archive. |
| Extras | `companion.rs`, `preview.rs`, `conductor/history.rs` | Phone companion (axum + TLS + mDNS + pairing code), a preview panel (localhost ports, images, diffs), import of the latest Claude Code transcript of a project into chat history. |

## Candidates

| # | Idea | takt location | great_cto today | Verdict | Effort | Why |
|---|---|---|---|---|---|---|
| 1 | Acceptance checklist → progress "k of n", done only when all items are ticked | `jobs.rs:217-262`, `computed_state` | `scripts/lib/work-tasks.mjs` stores `acceptance: string[]` per task, with no per-item status; `subagent-stop-completion.mjs` checks only that *a* verdict exists; `/save` logs `Verify:` lines per done item (`handoff-state.mjs`) | **Adapt** | M | The progress model is right; the proof is weak. In great_cto each item should flip only when it carries an evidence reference (command + exit code, verdict line, receipt), never a self-ticked box. |
| 2 | Limit handoff with lineage (`handedTo`, `takeoverOf`; "Claude continues after another executor's limit") | `jobs.rs:91-112`, `INSTRUCTIONS.md` | Limits are measured (`quota-check.mjs` for Claude; `session-usage.mjs` classifies session/weekly limits and reads Codex `rate_limits`), and ADR-026 defines a bounded context packet; no task-level record that attempt B continues attempt A on another harness | **Adapt** | M | Today a limit stops the pipeline and the operator re-assembles context by hand. The lineage fields make the continuation explicit and auditable. |
| 3 | Derived display state with a fixed precedence, tested | `jobs.rs:309-325` + test | The board derives states in several places (fleet classify, work view, gate affordances) without one documented precedence table | **Adapt** | S | Cheap, and the RFC needs it: stored transitions and the displayed state are different things, and the order in which `limit`, `blocked`, `asking`, `done` win must be one table with one test. |
| 4 | One conductor over several harnesses; Codex JSONL normalized into Claude stream-json | `conductor/mod.rs`, `conductor/codex.rs` | ADR-006 harness router: detection and capability flags only; cross-harness execution and event normalization explicitly deferred. `codex-pipeline.mjs` runs Codex stages | **Adapt later** | L | A concrete, working event map (`thread.started`→init, `agent_message`→assistant text, `command_execution`/`file_change`→tool_use, `turn.completed`→result) is a useful reference for ADR-006 phase 2. Not worth building until great_cto actually leads from Codex. |
| 5 | Domain-based routing to vendors (Codex for crypto/auth/payments, etc.) | `INSTRUCTIONS.md` | ADR-002 model tier policy, council (multi-model), Kimi router | **Skip** | — | An opinion with no measurement behind it. great_cto routes by role and tier, and adds a vendor only with an eval (ADR-037 spirit). |
| 6 | TASK file template with "Who edits what / Do not touch" | `INSTRUCTIONS.md` | IMPL-BRIEF `## Files to modify` / `## Files NOT to modify`, enforced at write time by `edit-scope-guard.mjs`; decomposition matrix in CLAUDE.md | **Skip (have, stronger)** | — | takt's version is prose the executor is asked to respect; great_cto's is a hook. |
| 7 | One worktree per executor | `jobs.json` worktree, `agents new` | ADR-047 worktree-per-task, `worktree-state.mjs` | **Skip (have)** | — | Same decision, already accepted. |
| 8 | "Asking" state: executor waits for an answer, card shows a reply box | `ASKING_RE`, `job_send` | `session-status.mjs` on the `Notification` hook records working / waiting / blocked-on-prompt; ADR-024 board approvals | **Skip (have, stronger)** | — | takt guesses from the last tmux line (`?` at end of line); great_cto uses the harness's own event. Answering from the board is a separate controller decision (ADR-028 defers arbitrary live input). |
| 9 | Limit detection by regex over the executor's screen | `LIMIT_RE` | `session-usage.mjs` limit classification from structured usage | **Skip (have)** | — | Structured data beats screen scraping. |
| 10 | Subscription limits for all harnesses in the header | `limits.rs`, sidebar | Board Cost screen (released 3.78.x), `quota-check.mjs`, Codex `rate_limits` in `session-usage.mjs` | **Maybe later** | S–M | Remaining windows for Claude and Codex side by side would help routing. It is a board UI change → needs a Claude Design mockup approved by the owner first. |
| 11 | KANBAN.md: done lines cite the merge commit and date | `KANBAN.md` | Beads is the tracker; the board reads it | **Take the convention only** | S | A done task should name its merge SHA. Input for the RFC; the markdown board itself is not worth having next to Beads. |
| 12 | External review gate before merge (`coderabbit review --gate major`, exit 2 = not ready) | `INSTRUCTIONS.md`, TASK files | `code-reviewer` agent, `cross-review-gate.mjs` | **Skip** | — | great_cto has its own reviewer; a third-party gate can be an optional project capability, not a default. |
| 13 | First-run check of CLIs and login status; never performs logins, opens a terminal with the command instead | `setup.rs`, Onboarding screen | `/doctor`; the cockpit first-run mockup approved 2026-11-10 | **Skip (have)** | — | Same principle already in place. |
| 14 | Signed auto-update (Tauri updater, minisign key, `latest.json`) | `tauri.conf.json`, `release.yml`, `docs/HANDOFF-updater.md` | ADR-045 verified distribution; the cockpit `.dmg` + updater direction is drafted, not accepted | **Reference only** | — | A known-good shape for the cockpit app updater ADR. Two cautions from takt itself: its signing key has no password, and losing it strands every installed copy. |
| 15 | Transcript import into the chat history | `conductor/history.rs` | ADR-021 rejected reading transcripts live (format owned by the harness) | **Skip** | — | Same reasoning as ADR-021 still holds. |
| 16 | Phone companion (LAN server, TLS, mDNS, pairing) | `companion.rs` | Board is loopback-only with local API guards (ADR-048); accounts/hosting RFC | **Skip** | — | A new network attack surface on a machine that holds keys; out of great_cto's local-first scope. |
| 17 | Preview panel (localhost ports, images, diffs in the app) | `preview.rs`, `Preview.tsx` | Board per-turn diffs (ADR-023) | **Skip** | — | UI work with no pipeline value; would need a mockup anyway. |
| 18 | Accessibility tokens (contrast ≥ 7:1, type ≥ 12.5 px) | `docs/DESIGN.md` | Board design contract tests | **Maybe later** | S | A reasonable bar for the board, but it changes how the board looks → Claude Design mockup and owner approval first. |

## Top 3 recommendations

### 1. Acceptance items with evidence → "k of n verified"

**Idea.** A task's acceptance criteria are a checklist. Progress is the count of items that
carry evidence; a task is `done` only when every item does. takt counts ticked boxes; great_cto
must count *evidence*, because a self-ticked box is a claim, not a fact.

**How it would land:**

- `scripts/lib/work-tasks.mjs`: acceptance becomes `[{ text, status: 'pending'|'verified'|'waived', evidence?: { kind, ref, at } }]`,
  with a reader that still accepts today's `string[]` (each string → a `pending` item).
  A failed read of the task record is an error, never "zero items" (takt's `unwrap_or_default`
  is exactly the failure the failed-read rule forbids).
- `agents/pm.md`: acceptance items written as checkable statements, each with the command or
  observation that proves it (takt's `- [ ] \`<command>\` → <result>` form is a good template).
- `agents/senior-dev.md`, `agents/qa-engineer.md`: mark an item verified only through a helper
  that records the evidence (command, exit code, verdict line or receipt id).
- `scripts/hooks/subagent-stop-completion.mjs`: advisory first — "3 of 5 items have no
  evidence"; `GREAT_CTO_ENFORCE_COMPLETION=block` keeps its current opt-in meaning.
- Board: "k of n verified" on the task card. **This is a board UI change: it needs a Claude
  Design mockup (current next to proposed, desktop and phone) approved by the owner before any
  code.**
- Tests: legacy `string[]` reads as pending; a verified item without evidence is rejected; an
  unreadable record surfaces as unreadable, not as 0 of 0.

### 2. Limit handoff with lineage

**Idea.** When a harness hits its session or weekly limit mid-task, the task is not "failed";
a new attempt starts on another harness (or after reset) from a bounded context packet, and
both attempts point at each other.

**How it would land:**

- Task record (`work-tasks.mjs`, and whatever the tracker RFC settles on): `handedTo` on the
  stopped attempt, `takeoverOf` on the new one, plus `stopReason: 'limit:session'|'limit:weekly'|…`.
- Detection: reuse `session-usage.mjs` limit classification and `quota-check.mjs` thresholds;
  no screen regexes.
- Context: the ADR-026 stage context packet (file + SHA-256) is the handoff payload; the new
  attempt records that it started from a packet, not natively resumed.
- `scripts/hooks/pipeline-stall-guard.mjs` / `session-pipeline-resume.mjs`: on a limit stop,
  propose the takeover (which harness, what packet) instead of a generic "stalled". Starting it
  stays the operator's decision while the harness is a paid capacity (ADR-009: costs money).
- Tests: a chain A → B → C renders as one task with three attempts; a takeover without a packet
  is flagged.

### 3. One precedence table for the displayed task state

**Idea.** Keep stored transitions (what happened) apart from the displayed state (what the
operator sees), and derive the latter with one ordered table that one test pins.

**How it would land:**

- `scripts/lib/` (one new module, e.g. `task-display-state.mjs`): inputs = stored state,
  acceptance evidence counts, session-status (`working` / `waiting` / `blocked-on-prompt`),
  limit status, open gate; output = one display state. Proposed order:
  `limit` > `gate-waiting` > `blocked` > `asking` > `done` (all items verified) > `failed`/`killed` > `running` > `idle`.
- Board readers that classify today (fleet, work view, gate affordances) call it instead of
  classifying on their own. Same visible states → not a design change; any new state on screen
  → mockup first.
- Test: a table-driven test like takt's `state_priorities_are_deterministic`, plus "exited with
  unverified items is not done".

## Input for the task-tracker and kanban RFC

For the other session's `docs/RFC-task-tracker-and-kanban.md` (not edited here):

- **takt has no task key and no PR binding.** Its tasks are keyed by a free-form name and a
  `TASK-<slug>.md` file; CI does not check that a PR refers to a task. Nothing to borrow there;
  great_cto's mandatory key + CI binding goes further than takt.
- **State machine:** takt's states `running / asking / limit / done / killed / failed / exited`
  are a useful vocabulary, but takt mixes stored and derived state (`asking` and `limit` come
  from screen regexes). Recommend: stored transitions in the tracker, display state derived by
  one tested precedence (recommendation 3).
- **Done = all acceptance items verified**, counted as "k of n" (recommendation 1). A task that
  exited with unverified items is not done — takt already encodes this (`exited` + all ticked →
  `done`).
- **Lineage fields** `handedTo` / `takeoverOf` on attempts (recommendation 2).
- **A done task names its merge commit and date** (takt's KANBAN.md convention) — cheap
  evidence for the kanban's Done column.
- **Task file sections** Goal / Scope / Do not / Who edits what / Context / Acceptance map
  one-to-one onto great_cto's IMPL-BRIEF; the RFC can reuse IMPL-BRIEF instead of a new format.

## What not to take, and why

| What | Why not |
|---|---|
| Any code, text, icons or design files | PolyForm Noncommercial is incompatible with great_cto's MIT license and commercial use. |
| Executors launched with `--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox` | Removes every guard great_cto's hooks rely on. takt's own backlog lists replacing it as an open review finding. |
| `curl \| sh` install that avoids and strips the quarantine flag, with no checksum or signature check of the first download | Bypasses Gatekeeper and leaves the first install unverified; contrary to ADR-045. The cockpit app should be notarized. |
| State from screen regexes (`?` at line end = asking; limit phrases on screen) | Fragile; great_cto already has hook events and structured usage. |
| Failed read of the task file = zero steps | Turns an error into "nothing to do"; violates the failed-read rule. |
| Self-ticked checkboxes as proof of progress | A claim, not evidence; great_cto requires evidence per item. |
| A separate desktop app owning orchestration | ADR-028: no second controller; the board projects state and the pipeline stays authoritative. |
| Phone companion over LAN | New network surface; out of scope for a local-first tool. |
| Vendor routing by domain without measurement | great_cto adds routing rules only with an eval behind them. |

## Open questions for the owner

1. **Recommendation 1 (acceptance with evidence):** start advisory only, or make "done needs all items verified" blocking for managed tasks from day one?
2. **Recommendation 2 (limit handoff):** should the takeover to another harness be proposed only (operator starts it), or started automatically when the other harness is a flat subscription rather than pay-per-use?
3. **Should the three recommendations go into the task-tracker RFC** (as sections there) **or into a separate ADR**? Recommended: the RFC, since they define its state model.
4. **Board work** ("k of n verified" on cards, limits for all harnesses side by side, accessibility tokens): do you want Claude Design mockups for these now, or after the RFC is accepted? No board UI changes will be coded without an approved mockup.
