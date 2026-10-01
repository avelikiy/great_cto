# Troubleshooting

Failures that have actually happened, what they look like, and the fix. Each one cost
someone an afternoon before it was written down. See also the [FAQ](FAQ.md) and
[HOOKS.md](HOOKS.md).

## Hooks seem not to run

**Looks like:** a guard that should refuse something doesn't; the operating rules never
appear at session start; a new release's behaviour doesn't show up.

1. Check which plugin copy Claude Code actually loaded:
   ```bash
   claude -p ok --debug hooks
   grep -i "stubbing\|great_cto" ~/.claude/debug/latest | head
   ```
   `Stubbing unparseable marketplace plugin entry` means that registration loads **without
   hooks**. Disable it and use the git marketplace:
   ```bash
   claude plugin marketplace update great-cto
   claude plugin update great_cto@great-cto
   ```
2. Restart the session — plugin updates apply to new sessions only.
3. For git hooks (pre-push): `git config core.hooksPath` must point at an existing directory.
   A stale path means **no** git hook runs, silently.

## "Agent type 'X' not found", or the board's Fleet is short of agents

Agents are dispatched by their short name (`senior-dev`) from `~/.claude/agents/great_cto-*.md`,
which session start installs from the plugin. A plugin copy is also registered as
`great-cto:<name>`; the short name does **not** resolve to it.

- Count them: `ls ~/.claude/agents | grep -c '^great_cto-'` — it should equal the number of
  agents the release ships.
- If short: start a new session (the sync runs at start), or reinstall with
  `npx great-cto@latest install`.
- An agent installed *during* a session's start is available from the **next** session.

## A command was refused by great_cto

Three guards refuse things that cannot be undone or that switch a gate off:

| Refusal says | Guard | What to do instead |
|---|---|---|
| destructive-command | `destructive-guard` | the message names a safe alternative (a specific path, `--force-with-lease`, a migration) |
| shared-tree | `shared-tree-guard` | save a patch (`git diff > /tmp/x.patch`) or test in `git worktree add` |
| gate-bypass / gate-weakening | `gate-bypass-guard`, `gate-weakening-guard` | fix what the check reports |

If the refusal is wrong for your case, record a signed, expiring exception instead of
disabling the guard: `/exception` (or `node scripts/lib/exceptions.mjs create --gate <gate> --reason "…"`).
Every guard also has a `GREAT_CTO_DISABLE_*` switch for a whole session — see [HOOKS.md](HOOKS.md).

## Every command exits 126 and no test reports a failure

A binary built for another OS or CPU is shadowing the real one on your `PATH` (seen with a
Linux `node`/`npm` left in `~/.local/bin` on a Mac). Check `which -a node npm npx` and remove
or reorder the wrong one.

## Tests hang, or a second run is much slower than the first

A previous run left `node --test` processes behind (parent id 1). They hold ports and locks
and wedge the next run.

```bash
ps -axo pid,ppid,etime,command | grep "node --test" | awk '$2==1'
```

Kill the whole process group of the leftover. Don't wrap a long test run in `timeout` — it
kills the runner and orphans its children, which is how the leftovers appear.

## Two test runs at once, and one of them goes red

The board and task-tracker tests share machine-wide state. Two full runs in parallel (two
sessions, or two worktrees) flake each other. Run one at a time and re-run a red that
appeared under load on a quiet machine before believing it.

## The board's browser tests are skipped

`board e2e: SKIP` usually means the Playwright browser is missing — another project's cleanup
can remove the shared cache. Reinstall it in this checkout:

```bash
npx playwright install chromium
```

A skip is "not checked", never "passed".

## `claude -p` says "OAuth session expired"

The terminal `claude` and the desktop app keep separate credentials; logging in to one does
not log in the other. Check and log in the CLI itself:

```bash
claude auth status
claude auth login
```

## A fresh git worktree fails with `Cannot find module …/packages/cli/dist/…`

`dist/` is build output and not committed. In a new worktree, install or link dependencies
and build the CLI once:

```bash
npm ci && (cd packages/cli && npm ci && npm run build)
```
