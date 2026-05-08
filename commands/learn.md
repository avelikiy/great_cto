---
description: "Manually run the continuous-learner. Extract patterns from this session and write to .great_cto/lessons.md. Use when SessionEnd hook missed something or you want to capture a lesson mid-session."
argument-hint: "[focus] — optional: 'cost', 'security', 'architecture', etc. — narrows the learner's scope"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Task
model: haiku
---

You are the great_cto `/learn` slash command. Trigger the **continuous-learner** subagent to extract lessons from the current session and write to `.great_cto/lessons.md`.

## When to use this command

The continuous-learner runs automatically on session end (via the SessionEnd hook). Use `/learn` manually when:

- A session ends without invoking the hook (e.g. force-quit, crash recovery)
- You just made a notable decision and want to capture it before context drifts
- You want a focused extraction (e.g. only cost-related lessons): `/learn cost`
- You're debugging the learner itself

## Step 1 — Validate context

```bash
# Must be in a great_cto-managed project
[ -f .great_cto/PROJECT.md ] || { echo "ERROR: no .great_cto/PROJECT.md — not a great_cto project"; exit 1; }

# Need *some* session activity to learn from
COMMITS=$(git log --oneline --since="8 hours ago" 2>/dev/null | wc -l | tr -d ' ')
WRITES=$(wc -l < .great_cto/agent-writes.log 2>/dev/null || echo 0)
[ "$COMMITS" -eq 0 ] && [ "$WRITES" -eq 0 ] && { echo "No session activity detected — nothing to learn from."; exit 0; }
```

## Step 2 — Invoke continuous-learner subagent

Use the Task tool to spawn the subagent. Pass the user's optional focus argument:

```
Task(subagent_type="continuous-learner", description="Extract session lessons", prompt="""
Extract lessons from the current session. Read recent commits, agent writes,
cost log, beads activity, and reviewer verdicts. Apply quality gates strictly —
silence > noise.

Focus: $ARGUMENTS

If the user said "cost", emphasize cost-outlier patterns (shape B).
If the user said "security", emphasize reviewer-catch patterns (shape A).
If the user said "architecture", emphasize tool/library decisions (shape E).
Otherwise apply all 5 shapes.

Output one summary line at the end.
""")
```

## Step 3 — Surface results

After the subagent completes, show the user:

```
✓ Continuous-learner finished

  Wrote:    <N> new lessons → .great_cto/lessons.md
  Rejected: <M> candidates (didn't pass quality gates)
  Promoted: <P> patterns → ~/.great_cto/decisions.md

  Latest lesson preview:
  ─────────────────────
  $(tail -25 .great_cto/lessons.md 2>/dev/null)
```

If `N=0`:
```
No new lessons this session — quality gates rejected all candidates. This is normal.

To inspect what was considered, check the SessionEnd snapshot:
  ls -t .great_cto/logs/session-*-end.md | head -1 | xargs cat
```

## Notes

- The learner is **append-only** to `lessons.md` — it never edits or removes existing entries
- De-duplication is by `pattern:` slug — the learner skips slugs already present
- Promotion to global `~/.great_cto/decisions.md` requires ≥3 occurrences across projects (auto-counted)
- See `docs/LEARNING.md` for the full architecture
- See `agents/continuous-learner.md` for the agent's quality gates
