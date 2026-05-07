---
description: "Save current session. Writes a session log with what was done, decisions made, and what's pending. Optional: commit & push."
argument-hint: "[description] — e.g. 'implemented auth flow' (auto-inferred if omitted)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
model: haiku
---

You are the great_cto `/save` command. Your job is to create a compact, useful session log that makes `/resume` fast next time. Write, don't ask — infer everything from the conversation and git.

## Step 1 — Gather session data (run all in parallel)

```bash
# What changed in git during this session
git diff --stat HEAD 2>/dev/null | head -20
git log --oneline --since="8 hours ago" 2>/dev/null | head -10

# Current open tasks
cat .great_cto/tasks.md 2>/dev/null | grep -E "^\- \[.\]" | head -20

# Existing logs (to auto-number)
ls .great_cto/logs/session-*.md 2>/dev/null | wc -l

# Project name + phase
grep -E "^# |^phase:|^primary:" .great_cto/PROJECT.md 2>/dev/null | head -3
```

## Step 2 — Infer session description

If the user provided `$ARGUMENTS` — use that as the session description.

Otherwise infer from:
1. Git commits made during this session (last 8 hours)
2. What was discussed/built in this conversation
3. File changes visible in `git diff --stat`

Keep the description to 3–5 words: `"implemented auth flow"`, `"fixed streaming archetype"`, `"added regulated auto-detect"`.

## Step 3 — Write session log

```bash
mkdir -p .great_cto/logs
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
SLUG=$(echo "<session-description>" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | cut -c1-40)
LOG_FILE=".great_cto/logs/session-${DATE}-${SLUG}.md"
```

Write `$LOG_FILE`:

```markdown
---
date: <YYYY-MM-DD>
time: <HH:MM>
duration: <estimated from conversation length — "~30 min" / "~2 h">
---

# Session: <description>

## Done

- <bullet: what was actually implemented / fixed / decided>
- <bullet: second thing>
- <bullet: third thing if applicable>

## Decisions

- <any explicit decisions made — e.g. "decided to use X over Y because Z">
  *(none)* — if nothing was explicitly decided

## Pending

- <what was left unfinished or is the clear next step>
- <second pending item if any>

## Files changed

<output of git diff --stat HEAD or "no git changes">

## Commits

<git log --oneline --since="8 hours ago" output, or "no commits this session">
```

## Step 4 — Update tasks.md (if open tasks changed)

If tasks were completed during this session, mark them done:

```bash
# Mark completed tasks
sed -i 's/^- \[ \] <completed-task>/- [x] <completed-task>/' .great_cto/tasks.md 2>/dev/null || true
```

Only modify tasks that were explicitly completed — don't guess.

## Step 5 — Confirm and optionally commit

Show the CTO:

```
✅ Session saved → .great_cto/logs/session-<date>-<slug>.md

  Done:    <N> items
  Pending: <N> items
  Commits: <N> this session

Commit & push? (y/n)
```

If user says **yes** (or `/save commit`):

```bash
git add .great_cto/logs/
git commit -m "chore: session log <date> — <description>"
git push
```

If user says **no** — done. Log stays local (that's fine).

## Step 6 — Remind about next session

Always end with:

```
Next session: run `/resume` to restore this context instantly.
```

---

## Notes

- Keep bullets **concrete** — "added streaming archetype with kafka/flink signals" not "worked on archetypes"
- Pending should always have **at least one item** — if everything is done, the pending item is "ship / merge / deploy"
- Do NOT dump raw code or long diffs — just the summary
- Tone: crisp, factual, no fluff
