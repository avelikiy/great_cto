# Task API: `tracker`

One door to a project's tracker tasks. Use it instead of calling `bd` directly: a read that
fails stays a failure here, and every write records who made it.

Design and reasons: [ARCH-task-api.md](../architecture/ARCH-task-api.md).
Background: [RFC-task-tracker-and-kanban.md](../rfc/RFC-task-tracker-and-kanban.md).

## From a shell or an agent prompt

```
node scripts/tracker.mjs <command> [options]      # inside the plugin or the repository
great-cto tracker <command> [options]             # the npm CLI — the same program
```

| Command | Does |
|---|---|
| `list [--status S] [--label L] [--parent ID] [--text T] [--all]` | tasks that are not closed; `--all` or `--status closed` includes closed ones |
| `show <id>` | one task |
| `create "<title>" --actor A [--type T] [--priority 0-4] [--label L]… [--parent ID] [--description D]` | prints the new id |
| `move <id> <status> --actor A [--reason R]` | changes status; the reason is appended to the task's notes |
| `close <id> --actor A [--reason R]` | closes |
| `link <id> --depends-on <id> --actor A` | `<id>` waits for the other task |
| `note <id> "<text>" --actor A` | appends a note |
| `find-open [--label L] [--text T]` | open tasks by label or title text — the duplicate check |

Common options: `--dir PATH` (the project; default is the current directory) and `--json`.

- **Status:** `open`, `in_progress`, `blocked`, `deferred`, `closed`.
- **Actor:** `human`, `agent:<role>` (for example `agent:qa-engineer`) or `system:<name>`.
  Required on every write. It is what the caller declares: a record of who acted, not a
  permission check. Approving a gate is not done here; it stays on the board.

### Exit codes

| Code | Meaning | What the caller may conclude |
|---|---|---|
| `0` | read, or written | the answer is real — an empty list means there is nothing |
| `2` | usage error | nothing was sent to the store |
| `3` | absent | the store answered: no such task |
| `4` | unread, or a write that could not be confirmed | **nothing.** Not "no task", not "no duplicate", not "done" |
| `5` | refused | the store answered and rejected the write |

A script that creates a task only when none exists must treat `4` as "stop":

```bash
found=$(node scripts/tracker.mjs find-open --text "CVE-2026-0001" --json) || exit $?
```

With `--json`, a success is `{"ok":true,…}` on stdout and a failure is
`{"ok":false,"error":"absent|unread|unknown|refused|usage","message":…,"cause":…}` on stdout
with the exit code above. Without it, results go to stdout and failures to stderr, starting
with `NOT READ` or `NOT CONFIRMED` where that is the case.

## From JavaScript

```js
import { openTaskStore, TaskReadFailed } from '../scripts/lib/task-store.mjs';

const store = openTaskStore(projectDir);
const { tasks } = await store.list({ label: 'gate' });      // throws TaskReadFailed if not read
const got = await store.get(id);                             // { state: 'found', task } | { state: 'absent' }
const { id: created } = await store.create({ title, labels: ['finding'], actor: 'agent:security-officer' });
await store.move(created, 'in_progress', { actor: 'agent:senior-dev', reason: 'claimed' });
```

| Error | When | `code` |
|---|---|---|
| `TaskReadFailed` | the store did not answer | `timeout`, `not_installed`, `not_initialized`, `store_refused`, `bad_output`, `backend_unavailable` |
| `TaskWriteFailed` | the store answered and refused | `absent`, `unsupported`, `store_refused`, `not_installed`, `not_initialized` |
| `TaskWriteUnknown` | a write timed out and one look afterwards could not confirm it | `unknown` |
| `TaskUsageError` | bad arguments; nothing was sent | `usage` |

No function returns `[]`, `null` or `{}` for a read that failed.

A write that times out is not retried. The store looks once: if the write landed, the result
carries `recovered: true`; if that cannot be told, it throws `TaskWriteUnknown`. Read the task
before trying again.

## Backends

| Backend | Chosen when | Supports |
|---|---|---|
| `beads` | a `.beads/` directory is found in the project or above it, or `BEADS_DIR` is set | everything above |
| `tasks-md` | no Beads store, and `.great_cto/tasks.md` exists | `list`, `show`, `find-open`, `move` and `close` for table rows with a status cell. `create`, `link` and `note` are refused with exit `5` |

`GREAT_CTO_TASK_BACKEND=beads|tasks-md` forces one. `GREAT_CTO_BD_BIN` names the `bd` binary.
A project with neither source is `unread` (exit `4`), not empty.

## What it costs today

Each call starts one `bd` process, and `bd` makes callers wait in line. On this repository's
store (1132 issues), 2026-11-11, on a heavily loaded machine: one read 3–15 s, a note 5 s,
three reads started together 20 s. Batch what you can: one `list --json` and a filter in the
caller is cheaper than several `show` calls.

## What still calls `bd` directly

Most of the repository, until the callers are moved. `tests/lib/raw-bd-ratchet.test.mjs`
freezes the count and fails on a new direct call; lower its numbers when you move one.
