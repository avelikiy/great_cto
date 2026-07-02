# Phase task tracking (canonical block)

Every pipeline agent creates a Beads task when its phase starts and closes it
when the phase ends. Without this the board UI shows only gates — users can't
see who's working on what right now. See `skills/great_cto/SKILL.md`
§ "Phase task protocol" for the label conventions.

Agent prompts reference THIS file instead of restating the mechanics. The only
per-agent parts are `<agent-name>` and `<feature-slug>`.

```bash
PT="$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')/scripts/phase-task.sh"
[ -x "$PT" ] || PT="$(pwd)/scripts/phase-task.sh"

# Phase start (idempotent — returns the existing id if you re-run)
TASK_ID=$(bash "$PT" open <agent-name> "<feature-slug>" [--parent <gate-or-epic-id>])
bash "$PT" start "$TASK_ID"

# ... do the phase work ...

# Phase end
bash "$PT" close "$TASK_ID" --verdict ok    # or --verdict fail --notes "<reason>"
```

**Beads-unavailable policy (one policy, no per-agent variants):** the helper
itself falls back to `.great_cto/tasks.md`. Never let a Beads error block the
actual phase work — task tracking is best-effort observability, not a gate.

Contract agents that produce one task per item (per integration, per source,
per connector) still open ONE phase task via this block, then create the
per-item tasks with `bd q "<agent>: <item>"` and wire them `--type blocks`
against the senior-dev implementation task.
