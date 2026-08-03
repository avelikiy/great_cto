# Session Start

> Read when a session begins and the host or load order is in question. The
SessionStart hook already performs most of this; this file is what it does.

Load in order (later overrides earlier):
1. `~/.great_cto/preferences.md` — global CTO preferences
2. `.great_cto/PROJECT.md` — project config
3. `.great_cto/local.md` — local machine overrides (gitignored)

**Detect host platform** — great_cto runs in multiple AI-coding tools. Some
deps are Claude-specific and don't apply elsewhere. Detection uses runtime
env vars (set by the host process) first, filesystem markers second:

```bash
HOST="generic"

# Runtime env vars (most reliable — set by the host actually invoking us)
if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE_CODE_ENTRYPOINT" ]; then
  HOST="claude-code"
elif [ -n "$CODEX_HOME" ] || [ -n "$CODEX_SESSION" ]; then
  HOST="codex"
elif [ -n "$CURSOR_TRACE_ID" ] || [ "${TERM_PROGRAM:-}" = "Cursor" ]; then
  HOST="cursor"
elif [ -n "$AIDER_VERSION" ]; then
  HOST="aider"
elif [ -n "$CONTINUE_GLOBAL_DIR" ]; then
  HOST="continue"
else
  # Fallback to filesystem markers when env is empty (manual invocation, CI, ...).
  # Order matters: pick the most specific signal that exists.
  if [ -d ~/.claude/plugins ] || [ -d ~/.claude/skills ]; then HOST="claude-code"
  elif [ -d ~/.codex ]; then HOST="codex"
  elif [ -d ~/.cursor ]; then HOST="cursor"
  elif [ -d ~/.config/aider ]; then HOST="aider"
  elif [ -d ~/.continue ]; then HOST="continue"
  fi
fi
echo "HOST:$HOST"
```

**Dependency check** (run once, only if `.great_cto/deps-ok` does not exist):
```bash
MISSING=""
HARD_MISSING=""

# Beads is required everywhere (gate tracking + verdict log)
bd help >/dev/null 2>&1 || HARD_MISSING="$HARD_MISSING beads"

# Superpowers is Claude-Code-specific. Soft-warn elsewhere.
if [ "$HOST" = "claude-code" ]; then
  if ! ls ~/.claude/skills/superpowers/SKILL.md >/dev/null 2>&1 \
     && ! ls ~/.claude/plugins/cache/local/superpowers/*/skills/*/SKILL.md >/dev/null 2>&1; then
    MISSING="$MISSING superpowers"
  fi
fi

if [ -n "$HARD_MISSING" ]; then
  echo "DEPS_MISSING_HARD:$HARD_MISSING"
elif [ -n "$MISSING" ]; then
  echo "DEPS_MISSING_SOFT:$MISSING (host=$HOST)"
  touch .great_cto/deps-ok  # mark OK — soft deps are fallback-able
else
  touch .great_cto/deps-ok
fi
```

Resolution rules:
- **DEPS_MISSING_HARD** → installation issue, must fix before pipeline can run.
  Tell CTO: "Beads CLI not on PATH — install from https://github.com/steveyegge/beads. Pipeline gates will fall back to `.great_cto/tasks.md` until fixed."
- **DEPS_MISSING_SOFT** → optional dep. Tell CTO once: "Optional plugin missing:
  $MISSING (host=$HOST). Brainstorm/plan steps will use simplified flow.
  Install from your tool's plugin marketplace if you want the full Claude Code
  workflow."
- **DEPS_OK** → silent.

In Codex / Cursor / Aider / Continue, the brainstorm step from Claude Code's
superpowers plugin is replaced by an inline questionnaire built into the
architect agent — no plugin install needed.

**Cache directory init** (run once per project):
```bash
mkdir -p .great_cto/cache
# Ensure cache is gitignored (it's transient — CVE/digest/git log results)
if [ -f .gitignore ] && ! grep -q "\.great_cto/cache" .gitignore 2>/dev/null; then
  echo ".great_cto/cache/" >> .gitignore
fi
```

**Beads init check** (run once per project, only if `.great_cto/beads-ok` does not exist):

The previous version used `bd list` which returns success even with no local
DB — false positive that hides missing init. Use a structural check instead:

```bash
# Real check: does the .beads/ dir exist + does bd ready succeed?
# bd ready requires a usable DB and fails cleanly if uninitialized.
if [ -d .beads ] && bd ready >/dev/null 2>&1; then
  touch .great_cto/beads-ok
  echo "BEADS_OK"
else
  echo "BEADS_UNINIT"
fi
```

If BEADS_UNINIT:
1. Run `bd init` automatically (safe — only writes `.beads/` and adds gitignore line)
2. **Verify with a write-test:**
   ```bash
   PROBE_ID=$(bd create "great_cto-init-probe" --label setup-probe 2>&1 | grep -oE 'bd-[a-z0-9-]+ ' | head -1 | tr -d ' ')
   if [ -n "$PROBE_ID" ]; then
     bd close "$PROBE_ID" >/dev/null 2>&1
     touch .great_cto/beads-ok
     echo "BEADS_VERIFIED"
   else
     echo "BEADS_INIT_OK_BUT_WRITE_FAILED"
   fi
   ```
   Catches the case where `bd init` exited 0 but the DB is unwritable.
3. If write-test fails → tell CTO: "Beads CLI not functional — gate tracking and verdict logging will use `.great_cto/tasks.md` fallback. Install Beads for full pipeline: https://github.com/steveyegge/beads"

**Side effects of `bd init`:** creates `.beads/` (the SQLite DB), appends to
`.gitignore`, and on its first run inside a fresh `git init` repo also creates
an `AGENTS.md` template. None of these are great_cto's responsibility — they
ship from Beads. great_cto only invokes `bd init` once and verifies the DB is
writable afterwards.

All agents check for `bd` availability before each call. If unavailable, they fall back to `.great_cto/tasks.md`. This is degraded but functional — no agent will fail silently.

If PROJECT.md exists, show away summary:
```bash
git log --oneline --since="24 hours ago" 2>/dev/null | head -5
bd list --label gate --status open 2>/dev/null
bd ready 2>/dev/null | head -3
```

Format (3 lines max): `Back to <project> | Since last: N commits | Gates: [open/none] | Ready: [top task]`

**Stale gate check** — run at session start if PROJECT.md exists:
```bash
# Find open gates older than 24h (created_at field in Beads task)
NOW=$(date +%s)
bd list --label gate --status open 2>/dev/null | while read line; do
  TASK_ID=$(echo "$line" | awk '{print $1}')
  CREATED=$(bd show "$TASK_ID" 2>/dev/null | grep "created:" | awk '{print $2}')
  [ -z "$CREATED" ] && continue
  CREATED_EPOCH=$(date -d "$CREATED" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$CREATED" +%s 2>/dev/null || echo "$NOW")
  CREATED_EPOCH=${CREATED_EPOCH:-$NOW}
  AGE=$(( (NOW - CREATED_EPOCH) / 3600 ))
  [ "${AGE:-0}" -gt 24 ] && echo "STALE_GATE:$TASK_ID age:${AGE}h"
done
```
If STALE_GATE found → tell CTO: "⚠ Gate [task-id] has been open for [Nh]. Approve, reject, or it will auto-expire at 72h. Say 'approve' or 'reject gate [id]'."

If no PROJECT.md → "No project configured. Describe your project or say 'audit'."
