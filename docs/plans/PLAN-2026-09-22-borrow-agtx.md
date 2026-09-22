# Plan — five mechanisms from agtx

Status: done · Started 2026-09-22

Source: [fynnfluegge/agtx](https://github.com/fynnfluegge/agtx) (Apache-2.0), a terminal
kanban that gives each task its own worktree and tmux window and runs any of nine CLI
agents in it. It is a session manager, not a reviewed pipeline, so the mechanisms are
taken and the product is not. Code here is written for this project; nothing is copied.

## Taken

| # | In agtx | Here |
|---|---|---|
| 1 | Agent state from hook events (`src/agent/hook_status.rs`): a permission prompt is *blocked*, with its text | `scripts/lib/session-status.mjs` + `scripts/hooks/session-status.mjs` on Notification, Stop, UserPromptSubmit, SessionEnd → `.great_cto/status/<session>.json`. A granted prompt fires no event, so the reader checks the transcript: written after the blocked moment means the session moved on. The board's Decisions screen shows a blocked session above everything else; sessions that only finished a turn are one muted count. |
| 2 | A phase counts only with an artifact written after the phase began (`phase_artifact_fresh`) | `ship-evidence`: security-officer's verdict, like QA's, must be newer than the last code change. |

| 3 | `merge_task_branch` (`src/git/mod.rs`): refuse instead of stash, an empty branch is not success, a virtual merge first | `scripts/lib/merge-preflight.mjs`: `clean` / `conflict` (files named) / `nothing-to-merge` / `refused-dirty` / `refused-not-on-base` / `not-checked`, via `git merge-tree --write-tree`; touches no tree, index, ref or stash (tested). coordinator runs it before merging a lane. |
| 4 | `wait_for_board_change` (`src/mcp/board_watch.rs`): one blocking wait that returns only what needs the caller (their count: 73 sleeps and 96 listings in one 14-task run) | `scripts/lib/board-watch.mjs`, from the project's own files — no board process needed: new verdicts (negative first) and sessions blocked on a prompt, with a cursor so nothing between calls is missed. coordinator's MONITOR phase uses it; under Codex it is the MCP tool `wait_for_board_change`. |
| 5 | Re-review from a `reviewed-at` marker | `scripts/lib/review-range.mjs`: code-reviewer reviews `marker..HEAD` plus uncommitted files, `nothing-new` when nothing changed, and a full review with the reason when the marked commit was rebased away. Recorded after each verdict. |

## Not taken

The nine-agent tmux layer, the plugin system for spec frameworks (its project-local
`init_script` is an open local-code-execution issue, #133), remote input into an agent
from a phone, and the benchmark (two runs).
