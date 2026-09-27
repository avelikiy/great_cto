---
description: "Have an existing codebase? Run it — you get the detected stack, a gap list with severity and file:line evidence, a task per gap, and a PROJECT.md. Same as `/start audit`."
argument-hint: "[optional: 'eval' | 'lint' | focus area, e.g. 'focus on security']"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

`/audit` is an alias: **same as `/start audit`**. The audit lives in one place — the
`## Path: audit` section of the `/start` command — so the two can never drift apart.

## Run it

1. Read the `/start` command file — the plugin's `commands/start.md`:

```bash
PD=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}
for F in "$PD/commands/start.md" "$HOME/.claude/commands/start.md"; do
  [ -f "$F" ] && { echo "START_MD=$F"; break; }
done
```

2. Jump to `## Path: audit` and follow it to the end, with this command's whole
   argument as "the audit argument":

| You typed | Runs |
|-----------|------|
| `/audit` | `/start audit` — full audit |
| `/audit eval` | `/start audit eval` — eval harness |
| `/audit lint` | `/start audit lint` — anti-pattern scan of artefacts |
| `/audit focus on security` | `/start audit focus on security` |

Do NOT run the new-project guards or Steps 0–6 of `/start` — only the audit path.
