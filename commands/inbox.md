---
description: "What needs your attention? Shows open gates, recent activity, blocked items, and pending decisions."
argument-hint: "[optional: hours — default 24]"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

Show the CTO everything that needs attention: pending gates, recent activity digest, and blocked items. This combines the old /inbox and /digest into one view.

## Gather Data (run all in parallel)

**Open gates + stale gate detection:**
```bash
bd list --label gate --status open 2>/dev/null || true
bd list --status open --priority 0 2>/dev/null || true
# Detect stale gates (open > 24h)
NOW=$(date +%s)
bd list --label gate --status open 2>/dev/null | while read line; do
  TASK_ID=$(echo "$line" | awk '{print $1}')
  CREATED=$(bd show "$TASK_ID" 2>/dev/null | grep "created:" | awk '{print $2}')
  [ -n "$CREATED" ] && AGE=$(( (NOW - $(date -d "$CREATED" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$CREATED" +%s 2>/dev/null || echo $NOW)) / 3600 ))
  [ "${AGE:-0}" -gt 24 ] && echo "STALE:$TASK_ID age:${AGE}h"
done
```

**Recent git activity:**
```bash
git log --oneline --since="24 hours ago" 2>/dev/null | head -15
git diff --stat $(git rev-list --max-parents=0 HEAD 2>/dev/null)..HEAD 2>/dev/null | tail -5
```

**Beads progress:**
```bash
bd stats 2>/dev/null || true
bd ready 2>/dev/null | head -10
```
If bd unavailable: read `.great_cto/tasks.md` for manual task state and show in UP NEXT.

**New artifacts:**
```bash
find docs/ -name "*.md" -mtime -1 2>/dev/null | sort | head -10
```

**Open PRs:**
```bash
gh pr list --state open 2>/dev/null | head -5 || true
```

**Production issues:**
```bash
bd list --label production --status open 2>/dev/null || true
```

**Team signals (only if files exist):**
```bash
# Overdue RFCs
[ -d "docs/rfcs" ] && ls docs/rfcs/RFC-*.md 2>/dev/null | sort | xargs grep -l "Status: DRAFT\|Status: REVIEW" 2>/dev/null | xargs grep "^Review deadline:" 2>/dev/null | awk -v today="$(date +%Y-%m-%d)" '$3 < today {print FILENAME, "OVERDUE:", $3}' | sed 's|docs/rfcs/||'

# On-call
[ -f ".great_cto/oncall-schedule.md" ] && grep "^Current:" .great_cto/oncall-schedule.md | head -5 || echo "oncall: not configured"
```

**Recent decisions** (last 3 from Decision Log):
```bash
[ -f "docs/decisions/DECISION-LOG.md" ] && grep "^## D-" docs/decisions/DECISION-LOG.md | tail -3 | sed 's/^## //' || true
```

**Tech debt signals:**
```bash
bd list --status open --priority 2 2>/dev/null | wc -l
tail -5 .great_cto/perf-baseline.log 2>/dev/null || echo "NO_BASELINE"
ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -1 | xargs grep -h "What slowed down:" 2>/dev/null | sort | uniq -c | sort -rn | head -3
ls docs/audits/AUDIT-*.md 2>/dev/null | sort | tail -1 || echo "NO_AUDIT"
```

## Format Output

```
/inbox

--- TECH DEBT RADAR ---
  P2 bugs: [N]  |  Last audit: [date from AUDIT-*.md filename, or "never"]
  Perf trend: [last 3 p95 values from perf-baseline.log, e.g. "120ms → 135ms → 128ms", or "no baseline yet"]
  Recurring pattern: [top "What slowed down" phrase × count, or "none yet"]
[Prefix header with ⚠ if P2 > 10 OR latest p95 > previous by >15%]

--- NEEDS YOUR DECISION ---
[gates and items requiring CTO approval]

  gate:arch — "Feature X" → docs/architecture/ARCH-x.md
  Approve architecture? [yes/no]

  gate:ship — "Feature Y" | QA: passed | Security: passed
  Deploy? [yes/no]

[If STALE gates detected, show immediately after each stale gate:]
  ⚠ STALE [Nh] — this gate has been open for N hours. Expires at 72h.
  Say "approve [gate-id]", "reject [gate-id]", or it will auto-expire.

--- LAST 24 HOURS ---
  Commits: [N] | Files changed: [X]
  Tasks closed: [N] | Tasks opened: [M]
  New artifacts: [list]

--- UP NEXT ---
  [bd ready output — unblocked tasks]

--- INCIDENTS ---
  [P0/P1 production issues, or "None"]

--- RECENT DECISIONS (shown only if DECISION-LOG.md has entries) ---
  [last 3 entries, one per line: D-NNNN — YYYY-MM-DD — title]

--- TEAM (shown only if configured) ---
  On-call: [@person (team) until <date> | "not configured — /oncall schedule"]
  RFCs overdue: [N — list titles with days overdue | "none overdue"]
  [⚠ if any RFC overdue >2 days: "RFC-NNN overdue Nd — review or extend deadline"]
```

If no open gates AND no P0/P1 incidents AND no stale items:
```
/inbox — clear.
No decisions needed. Backlog: [N] tasks ready. [N] PRs open.
```
Always show backlog count and PR count even when clear — "clear" means no *decisions needed*, not no activity.

If argument provided (e.g., `/inbox 48`), use that many hours for the activity window.

## Gate Responses

When CTO says "yes" / "approve" for a gate:
1. `bd close <gate-id> "Approved by CTO — $(date +%Y-%m-%d)"`
2. **Confirm explicitly**: "✅ gate:<name> approved. Pipeline unblocked — senior-dev / devops can proceed."
3. Show what happens next: "Next step: [senior-dev can start | devops can deploy]"

When CTO says "no" / "reject":
1. `bd update <gate-id> --status blocked --note "<CTO feedback>"`
2. Confirm: "🔴 gate:<name> rejected. [tech-lead / security-officer] notified to revise."

When CTO says "later" / "skip":
1. Leave gate open
2. Confirm: "gate:<name> deferred. Will reappear next /inbox."
- "later" → show again next /inbox
