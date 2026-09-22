# Plan — two mechanisms from agtx

Status: done (items 1–2) · Started 2026-09-22

Source: [fynnfluegge/agtx](https://github.com/fynnfluegge/agtx) (Apache-2.0), a terminal
kanban that gives each task its own worktree and tmux window and runs any of nine CLI
agents in it. It is a session manager, not a reviewed pipeline, so the mechanisms are
taken and the product is not. Code here is written for this project; nothing is copied.

## Taken

| # | In agtx | Here |
|---|---|---|
| 1 | Agent state from hook events (`src/agent/hook_status.rs`): a permission prompt is *blocked*, with its text | `scripts/lib/session-status.mjs` + `scripts/hooks/session-status.mjs` on Notification, Stop, UserPromptSubmit, SessionEnd → `.great_cto/status/<session>.json`. A granted prompt fires no event, so the reader checks the transcript: written after the blocked moment means the session moved on. The board's Decisions screen shows a blocked session above everything else; sessions that only finished a turn are one muted count. |
| 2 | A phase counts only with an artifact written after the phase began (`phase_artifact_fresh`) | `ship-evidence`: security-officer's verdict, like QA's, must be newer than the last code change. |

## Next, not done

- `git merge-tree --write-tree` preflight and a hard refusal on an empty branch when a
  parallel lane finishes (`merge_task_branch`) — for `lane-diff.mjs`. M.
- `wait_for_board_change`: one blocking wait instead of polling, for the coordinator and
  codex-host (their comment counts 73 sleeps and 96 listings in one 14-task run). M.
- Re-review from a marker: code-reviewer reviews `marker..HEAD`, not the whole diff. S.

## Not taken

The nine-agent tmux layer, the plugin system for spec frameworks (its project-local
`init_script` is an open local-code-execution issue, #133), remote input into an agent
from a phone, and the benchmark (two runs).
