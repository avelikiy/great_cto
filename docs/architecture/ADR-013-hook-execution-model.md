# ADR-013 — Hook execution model

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —

## Context

great_cto needs to enforce policies (no leaked secrets, consistent formatting, cost-cap awareness) and capture state (session-end summaries) without manual CTO intervention.

Claude Code provides a native [hooks API](https://docs.anthropic.com/en/docs/claude-code/hooks) that fires scripts on lifecycle events (`SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionEnd`, etc.). The hook protocol is:
- stdin = JSON payload describing the event
- stdout = ignored (or special JSON like `{"sessionTitle": ...}`)
- exit code 0 = allow, exit code 2 = block (PreToolUse only)
- stderr = surfaced to user / agent

Two approaches were considered:

1. **Custom bash wrappers** (the path Everything Claude Code took)
2. **Native Claude Code hooks via `plugin.json`** (the path we chose)

## Decision

Use **native Claude Code hooks** registered in `.claude-plugin/plugin.json`. Hook implementations live in `scripts/hooks/` as standalone Node.js scripts (`.mjs`) referenced from inline shell commands in `plugin.json`.

### Architecture

```
event (PreToolUse, PostToolUse, etc.)
   ↓
plugin.json `hooks.<Event>[].matcher` → matches tool/event
   ↓
plugin.json `hooks.<Event>[].hooks[].command`
   ├── inline shell: minimal — just resolves PLUGIN_DIR and execs node
   └── exec: node ${PLUGIN_DIR}/scripts/hooks/<name>.mjs
       ↓
       reads JSON from stdin
       does its job
       exits 0 (or 2 to block)
```

### Hook taxonomy

| Hook event | matcher | Action | Exit codes |
|---|---|---|---|
| `PreToolUse` | `Bash` | Block dangerous bash (rm -rf, git push --force, etc.) | 0 \| 2 |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | Scan for hardcoded secrets | 0 \| 2 |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | Log writes + auto-format file | 0 |
| `UserPromptSubmit` | `null` | Set session title + cost-guard warning | 0 |
| `SessionStart` | `null` | Load project context, sync agents/commands | 0 |
| `SessionEnd` | `null` | Write session-end snapshot to `.great_cto/logs/` | 0 |
| `PreCompact` | `null` | Save HANDOFF.md before context compaction | 0 |
| `SubagentStart` | `null` | Inject project context to subagents | 0 |
| `PermissionDenied` | `null` | Log permission denials for diagnostics | 0 |

### Execution rules

1. **Hooks are non-blocking by default.** Only `PreToolUse` may exit with code 2 to deny a tool call. Every other hook MUST exit 0 even on internal failure — otherwise we'd corrupt the session.

2. **Hooks are best-effort.** A formatter failure, a missing dependency, a transient I/O error — none of these may break the workflow. Failures are logged to `.great_cto/<hook>.log` and the hook returns 0.

3. **Hooks are short.** Hard timeout is 5 seconds for PreToolUse, 12 seconds for PostToolUse formatters, 8 seconds for SessionEnd. Anything slower must move to a background process or a separate agent invocation.

4. **Hooks are opt-out-able.** Every hook honors `GREAT_CTO_DISABLE_<NAME>=1` environment variable. Per-file opt-out via `# great_cto:allow-secrets` comment for secret-scan.

5. **Hooks may be additive on the same matcher.** Claude Code runs all matching hooks in order; we register `format-check.mjs` after the existing `agent-writes.log` hook on `Write|Edit|MultiEdit`. Order = registration order in `plugin.json`.

### Why Node.js (`.mjs`) over Python (`.py`) or pure bash

- **Bash:** error-prone for JSON parsing and string regex with backreferences; brittle on different platforms
- **Python:** requires `python3` on PATH; mixing inline JSON parsing with regex matching is verbose
- **Node.js:** Claude Code already requires Node (it's a JS app); zero new dependency; clean ESM modules; native JSON parsing

We keep one Python hook (`user-prompt-submit.py`) for backward-compat — new hooks are `.mjs`.

## Consequences

### Positive

- **No new runtime dependency.** Node is already on every machine running Claude Code.
- **Testable in isolation.** Each hook is a standalone script — feed JSON via stdin, assert on exit code + stderr. See `tests/hooks/*.test.mjs`.
- **Composable.** Multiple hooks per matcher run sequentially; users can layer their own without forking.
- **Per-feature opt-out.** Granular env vars let users disable any single hook without disabling the plugin.
- **Native to Claude Code.** No bash wrappers, no shim scripts. We use the platform as designed.

### Negative

- **Inline shell command in `plugin.json` is verbose.** We need to resolve `PLUGIN_DIR` because hooks fire from arbitrary CWDs. Mitigation: documentation + helper var pattern reused everywhere.
- **No way to share state between PreToolUse and PostToolUse for the same tool call.** Acceptable — hooks should be stateless. If we need shared state, write to `.great_cto/`.
- **Claude Code may change the hook protocol.** Mitigation: pin Claude Code version range in plugin's `engines` field once Anthropic publishes a stability guarantee.

### Risks

- **A buggy hook breaks every session.** Mitigation: each hook has `try/catch` at top level + tests + `2>/dev/null` in the inline shell wrapper.
- **Slow hooks degrade UX.** Mitigation: hard timeouts, profiling in tests, no network I/O without explicit user opt-in.
- **Hook-induced false positives block legitimate work.** Mitigation: (1) opt-out env vars, (2) per-file allowlist comments, (3) directory denylists (e.g. `tests/`, `.example`).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Bash-only hooks (ECC's approach) | Doesn't scale; brittle JSON parsing; harder to test |
| External daemon (long-lived background process) | Complexity not justified for current scope |
| Skip hooks, do enforcement in agents | Agents don't run on every tool call; hooks fire at the right granularity |
| Pre-commit git hooks | Different lifecycle — only fire at git commit time, miss in-session work |

## References

- [Claude Code hooks docs](https://docs.anthropic.com/en/docs/claude-code/hooks)
- ADR-014 — Secret detection patterns
- `docs/HOOKS.md` — user-facing documentation
- `tests/hooks/*.test.mjs` — test suite
