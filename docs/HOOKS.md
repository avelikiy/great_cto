# Hooks

great_cto uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to enforce policies and capture state without manual intervention.

## What's wired

| Event | Matcher | Hook | What it does |
|---|---|---|---|
| `SessionStart` | — | inline (plugin.json) | Loads PROJECT.md, syncs agents/commands, primes context |
| `SessionEnd` | — | `session-end.mjs` | Writes session snapshot to `.great_cto/logs/` |
| `PreToolUse` | `Bash` | `destructive-guard.mjs` | Refuses what cannot be undone: `rm -r` of `/`, system dirs, home, the project or above, `.git`; force push (lease allowed on feature branches), any force/delete on main/release; DROP/TRUNCATE to a DB client; `dd of=/dev/…`, `mkfs`; `curl \| sh` |
| `PreToolUse` | `Bash` | `shared-tree-guard.mjs` | Refuses `git stash`, `checkout -- <path>`, `restore <path>`, `reset --hard`, `clean -f` — they destroy other sessions' uncommitted work in a shared tree |
| `PreToolUse` | `Bash` | `gate-bypass-guard.mjs` | Refuses skipping the git hooks: `--no-verify`, `commit -n`, `-c core.hooksPath=`, setting `core.hooksPath`, `HUSKY=0`, `SKIP=` |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | Blocks writes containing hardcoded API keys |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `gate-weakening-guard.mjs` | Refuses an edit that adds a test skip, a CI allow-failure, a lint/type suppression (`@ts-ignore`, `eslint-disable`, `noqa`, `#[allow(`…) or a weakened tsconfig/ESLint/Python-lint config |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | inline + `format-check.mjs` + `docs-reference-sync.mjs` + `typecheck-accumulate.mjs` | Logs writes to `.great_cto/agent-writes.log` + auto-formats by extension + regenerates `docs/reference/` + notes edited TS/Python files for the Stop typecheck |
| `PostToolUse` | — (all tools) | `loop-detector.mjs` | One nudge when the same call repeats 5× in 12 calls, or one file is edited 8× against failing tests. Never blocks |
| `Stop` | — | `stop-typecheck.mjs` **(opt-in)** | Typechecks the files edited this turn with the project's own `tsc` / pyright / mypy; errors send the model back once. Off unless `GREAT_CTO_TYPECHECK_AT_STOP=1` or `typecheck_at_stop: true` |
| `UserPromptSubmit` | — | `user-prompt-submit.py` + `cost-guard.mjs` | Sets session title + warns on expensive prompts |
| `UserPromptSubmit` | — | `classify-telemetry.mjs` **(opt-in)** | Records request-class metadata to a local log — off unless `GREAT_CTO_CLASS_TELEMETRY=1` |
| `PreCompact` | — | inline | Saves HANDOFF.md before context compaction |
| `SubagentStart` | — | inline | Injects project context to subagents |
| `PermissionDenied` | — | inline | Logs denials for diagnostics |

Source: `.claude-plugin/plugin.json`, scripts in `scripts/hooks/`.

### Measuring request-class distribution (opt-in)

The request classifier (see `CLAUDE.md` → "Request classifier") is a prompt
heuristic that leaves no trace, so we can't tell how often each class fires or
how ambiguous requests are — which is exactly what you'd need to decide whether
an explicit `mode:` override is worth building. `classify-telemetry.mjs` closes
that gap **only when you turn it on**:

```bash
export GREAT_CTO_CLASS_TELEMETRY=1     # dormant otherwise (node isn't even spawned)
# …work a while…
# aggregate the local, content-free log:
cut -f2 .great_cto/class-telemetry.log | sort | uniq -c | sort -rn
grep -c ambiguous .great_cto/class-telemetry.log   # how often signals collide
```

It writes **metadata only** (class · ambiguity · signal count · prompt length —
never the prompt text) to a **local** `.great_cto/class-telemetry.log`, never
sent anywhere. It's a regex *proxy* of the model's classifier: a high
`UNCLASSIFIED` share just means many requests are context-dependent
continuations ("do it", "continue") that keyword-matching can't judge — itself a
useful signal. Off by default per the telemetry rule in `CLAUDE.md`.

## What each hook does

### `secret-scan.mjs`

Scans content of `Edit`, `Write`, and `MultiEdit` tool calls for hardcoded secrets (AWS keys, Stripe keys, GitHub PATs, OpenAI/Anthropic keys, PEM private keys, JWT tokens, etc.).

- **Blocks** the tool call (exit 2) on high-confidence detections
- **Warns** (stderr) on lower-confidence patterns like JWT tokens

**Skipped paths:** `tests/`, `fixtures/`, `*.test.*`, `*.spec.*`, `.example`, `.sample`, `.template`, `EXAMPLES.md`, `CHANGELOG.md`.

**Opt-out:**
```bash
# Disable for current session
export GREAT_CTO_DISABLE_SECRET_SCAN=1
```

Or per-file:
```typescript
// great_cto:allow-secrets
const TOK = "ghp_realToken...";  // intentional, e.g. tutorial code
```

See **ADR-014** for the full pattern catalogue.

### `destructive-guard.mjs`

Replaces an inline check that never fired: it read `command` from the top of the payload,
and Claude Code sends `tool_input.command` — `rm -rf ~` passed. Its regex would also have
refused every `rm -rf node_modules` and matched text inside a commit message. The command is
now parsed (`scripts/lib/shell-commands.mjs`) and only irreversible actions are refused:

| Refused | Passes |
|---|---|
| `rm -r` of `/`, a system dir, home or `~/*`, the project (`.`, `*` after a `;`-separated `cd`), anything above it, `.git`, `$EMPTY/` | `rm -rf node_modules dist .next`, `/tmp/…`, `$X/sub` |
| `git push --force` / `+ref`; any force or delete on main, master, production, release* | `--force-with-lease` on a feature branch |
| DROP DATABASE/SCHEMA/TABLE, TRUNCATE sent to psql, mysql, sqlite3, mongosh… (args or heredoc) | the same words in a commit message or `echo` |
| `dd of=/dev/…`, `mkfs*`, recursive chmod/chown of system paths, `curl … \| sh`, `bash <(curl …)`, fork bomb | `curl … \| jq` |

Each refusal names a safe alternative. Bypass: a signed `destructive-command` exception, or
`GREAT_CTO_DISABLE_DESTRUCTIVE_GUARD=1`. Not covered (the path is only known at run time):
`rm -rf $(pwd)`, `psql -f drop.sql`, `find -delete`.

### `loop-detector.mjs`

PostToolUse on every tool. Nudges once — via `additionalContext`, never a block — when the
same call repeats 5× within 12 calls with no edit between, or one file is edited 8× while
tests keep failing. Re-running tests after an edit is not a repeat; polling tools are ignored.
State is per session (and per subagent) in the OS tmpdir. Opt-out: `GREAT_CTO_DISABLE_LOOP_DETECTOR=1`.

### `stop-typecheck.mjs` + `typecheck-accumulate.mjs` (opt-in)

Code that does not compile is not done. With `GREAT_CTO_TYPECHECK_AT_STOP=1` or
`typecheck_at_stop: true` in `.great_cto/PROJECT.md`, the files edited this turn are
typechecked once at Stop — the project's own `node_modules/.bin/tsc --noEmit -p` (never npx),
or pyright/mypy if on PATH. Errors in edited files (≤15 lines) send the model back once per
error set. Budget `GREAT_CTO_TYPECHECK_BUDGET_S` (60 s); on the deadline the checker's process
group is killed and the result is reported as not verified. `GREAT_CTO_DISABLE_STOP_TYPECHECK=1` wins.

### `shared-tree-guard.mjs`

Several Claude Code sessions often work in **one** working tree. Their uncommitted edits are in
neither the index nor the history, so a command that resets the tree destroys them for good.
This hook refuses, at the tool layer:

| Command | Allowed forms |
|---|---|
| `git stash` — any form, incl. `-u`, `push`, `pop`, `apply`, `drop` | `git stash list`, `git stash show` |
| `git checkout -- <path>`, `git checkout <ref> -- <path>`, `git checkout .`, `git checkout -f` | branch switches: `git checkout main`, `-b feat/x` |
| `git restore <path>` | `git restore --staged <path>` (index only) |
| `git reset --hard` | `git reset`, `--soft`, `--mixed` |
| `git clean -f` (any cluster with `f`) | `git clean -n` (dry run) |

The command is **parsed, not grepped**: text inside quotes, comments and heredoc bodies is a
word, so a commit message that *mentions* `git stash` passes; the command itself is caught
inside `a && …`, `( … )`, `$( … )`, backticks, `bash -c '…'`, `eval`, and behind `VAR=1`,
`env`, `git -C <dir>`.

The refusal tells the agent what to do instead: save a patch (`git diff > /tmp/x.patch`,
reversible with `git apply` / `git apply -R`) or test the baseline in a separate tree
(`git worktree add "$(mktemp -d)" HEAD`).

Why: in the S3 effort A/B (`docs/plans/PLAN-2026-09-23-agent-speed.md`) senior-dev at effort
MEDIUM ran `git stash -u && npm test; git stash pop` in 2 of 3 runs to check its baseline.

**Opt-out** (a tree nobody else works in):
```bash
export GREAT_CTO_DISABLE_SHARED_TREE_GUARD=1
```

### `gate-bypass-guard.mjs`

The pre-push hook keeps private project names out of a public push and a push off a red
gate — and one flag switched it off. This refuses, from an agent's shell:

| Refused | Passes |
|---|---|
| `git … --no-verify` (commit, push, merge, rebase, am …) | `git push -n` (on push, `-n` is `--dry-run`) |
| `git commit -n`, incl. clusters like `-anm` | `git commit -am "…"` — letters after `-m` are the message |
| `git -c core.hooksPath=… <cmd>` | `git config --get core.hooksPath`, `git config core.hooksPath` (a read) |
| `git config [--local…] core.hooksPath <value>`, `--unset core.hooksPath` | a commit message or `echo` that mentions `--no-verify` |
| `HUSKY=0 git …`, `SKIP=… git …` (husky's and pre-commit's off switches) | |

Parsed with the same `scripts/lib/shell-commands.mjs` as `shared-tree-guard`. The sanctioned
route is a signed, expiring exception for gate `git-hooks` (`/exception`). It is an audit
trail, not a lock: an agent that creates one has done it in the open, dated and attributed.
An env prefix inside the agent's own command does not switch the guard off.

**Opt-out** for a whole session (operator's environment): `GREAT_CTO_DISABLE_GATE_BYPASS_GUARD=1`.

### `gate-weakening-guard.mjs`

The cheapest way to turn a red check green is to stop it checking. This refuses an
`Edit`/`Write`/`MultiEdit` that **adds**, compared with what was there:

| Where | Refused additions |
|---|---|
| JS/TS tests (`*.test.*`, `*.spec.*`, `__tests__/`) | `it/test/describe.skip(`, `.only(`, `xit(`, `xdescribe(` |
| Python tests (`test_*.py`, `*_test.py`) | `@pytest.mark.skip[if]`, `@unittest.skip…`, `pytest.skip(` |
| Go / Rust / Dart | `t.Skip(` · `#[ignore]` · `skip: true` |
| CI (`.github/workflows`, `.gitlab-ci.yml`, `cloudbuild*`, CircleCI, Azure, Bitbucket) | `continue-on-error: true`, `allow_failure: true`, `*SKIP*: 1\|true` |

Existing skips are not re-reported, removing one passes, docs and ordinary source may say
the words, and a commented line is not a setting. A quarantined flaky test goes through a
signed exception for gate `gate-weakening` with its ticket in the reason.

**Opt-out** for a whole session: `GREAT_CTO_DISABLE_GATE_WEAKENING_GUARD=1`.

### `format-check.mjs`

After `Edit`/`Write`/`MultiEdit`, auto-formats the file by extension if a matching tool is on PATH:

| Extensions | Formatter | Fallback |
|---|---|---|
| `.js .jsx .ts .tsx .mjs .cjs .json .md .yml` | `prettier` | — |
| `.py` | `ruff format` | `black` |
| `.go` | `gofmt -w` | — |
| `.rs` | `rustfmt` | — |

Failures are logged to `.great_cto/format.log`, never block.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_FORMAT=1
```

### `docs-reference-sync.mjs`

After `Edit`/`Write`/`MultiEdit`, regenerates `docs/reference/` when the edited
file is one the reference is derived from.

`ci-local` has a `docs-reference in sync` gate and it works — it caught a stale
page twice in one session, once after editing a command and once after editing an
agent. The gate is not the problem. The problem is that its feedback arrives
minutes later, on finished work, about a file nobody edited by hand; that shape
is what teaches people to reach for `--no-verify`. This moves the feedback to the
write and leaves the gate as the last word.

Which files count is **not** listed in the hook. `GROUPS` in
`scripts/lib/system-map.mjs` is what the generator actually reads, so the hook
asks it — a group added there is watched here automatically, and a test asserts
that for every directory and extension `GROUPS` names.

Failures are logged to `.great_cto/docs-sync.log`, never block.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_DOCS_SYNC=1
```

### `cost-guard.mjs`

Watches for prompts that trigger expensive operations (`/start`, `/audit`, "architect this", large refactors) and prints a cost estimate to stderr.

If `.great_cto/PROJECT.md` has a `cost-cap-usd-month: <N>` line and `.great_cto/cost-history.log` shows recent spend, also prints remaining budget and a warning if the operation would push you over.

Informational only — never blocks.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_COST_GUARD=1
```

### `session-end.mjs`

Captures a snapshot at session end:

- Git state (branch, last commit, uncommitted files, commits in last 8h)
- Beads state (open / blocked tasks)
- Recent cost log
- Phase 2 (v1.2.0) will additionally trigger the continuous-learner agent

Writes to `.great_cto/logs/session-YYYY-MM-DD-HHMM-end.md`.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_SESSION_LEARNING=1
```

## Adding your own hook

1. Create `scripts/hooks/<your-hook>.mjs` reading JSON from stdin, exiting 0/2.
2. Register in `.claude-plugin/plugin.json` under the appropriate event:
   ```jsonc
   "PreToolUse": [
     {
       "matcher": "Edit|Write",
       "hooks": [
         {
           "type": "command",
           "command": "PLUGIN_DIR=$(...); node \"${PLUGIN_DIR}/scripts/hooks/your-hook.mjs\" 2>&1; exit $?",
           "timeout": 5,
           "statusMessage": "Running your-hook..."
         }
       ]
     }
   ]
   ```
3. Add tests in `tests/hooks/your-hook.test.mjs`.
4. Document here.

### Conventions

- Read JSON from `stdin`. Use `readFileSync(0, 'utf8')`.
- Exit 0 by default; exit 2 only in `PreToolUse` hooks that intend to block.
- Log to `.great_cto/<hook>.log` for debugging — never write to stdout (Claude Code interprets some stdout as control messages).
- Surface user-visible messages on stderr.
- Always wrap top-level logic in try/catch — a crashing hook breaks every session.
- Honor `GREAT_CTO_DISABLE_<NAME>=1` env var for per-feature opt-out.

## Disabling all hooks

If you need to disable everything at once (e.g. troubleshooting), uninstall the plugin temporarily:

```bash
# In Claude Code:
/plugin disable great_cto
```

Or set a master kill switch (env var consumed by all hooks):

```bash
export GREAT_CTO_DISABLE_HOOKS=1
```

> Note: the master kill switch is honored by all `*.mjs` hooks since v1.1.0 but
> not by inline shell hooks (which would require a plugin.json change).

## Testing hooks locally

```bash
# Run all hook tests
node --test tests/hooks/*.test.mjs

# Test a single hook with handcrafted input
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"AKIAIOSFODNN7EXAMPLE"}}' \
  | node scripts/hooks/secret-scan.mjs
echo "exit=$?"
# expected: exit=2 with stderr message
```

## Architecture

See:
- **ADR-013** — Hook execution model (why Node.mjs over bash, blocking vs non-blocking, etc.)
- **ADR-014** — Secret detection patterns (what we detect, why)
