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
# Detect stale gates (open > 24h) — pre-compute epoch outside arithmetic to survive zsh subshell scoping
NOW=$(date +%s)
bd list --label gate --status open 2>/dev/null | while read line; do
  TASK_ID=$(echo "$line" | awk '{print $1}')
  CREATED=$(bd show "$TASK_ID" 2>/dev/null | grep "created:" | awk '{print $2}')
  [ -z "$CREATED" ] && continue
  CREATED_EPOCH=$(date -d "$CREATED" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$CREATED" +%s 2>/dev/null || echo "$NOW")
  CREATED_EPOCH=${CREATED_EPOCH:-$NOW}
  AGE=$(( (NOW - CREATED_EPOCH) / 3600 ))
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

**Top risks (if register exists):**
```bash
if [ -f "docs/risks/RISK-REGISTER.md" ]; then
  # Filter active H×H and H×M lines from the Active section
  awk '/## Active risks/,/^## /' docs/risks/RISK-REGISTER.md 2>/dev/null | \
    grep -E "^\| R-[0-9]+" | awk -F'|' '{
      prob=$4; imp=$5; gsub(/ /, "", prob); gsub(/ /, "", imp);
      if ((imp=="H" && (prob=="H" || prob=="M")) || (imp=="M" && prob=="H")) print $0
    }' | head -5
fi
```

**Upcoming EOLs (if calendar exists):**
```bash
if [ -f "docs/deprecations/DEPRECATION-CALENDAR.md" ]; then
  # Entries with EOL within 90 days — human-readable list from Active section
  awk '/## Active/,/## Completed/' docs/deprecations/DEPRECATION-CALENDAR.md 2>/dev/null | \
    grep -E "^\|" | tail -n +3 | head -10
fi
```

**SLO budget (if cache exists):**
```bash
if [ -f ".great_cto/slo-budget-current.md" ]; then
  # Show any row at WARN or EXHAUSTED status — these need attention
  grep -E "\| (WARN|EXHAUSTED) \|" .great_cto/slo-budget-current.md 2>/dev/null | head -5
fi
```

**Waivers (if directory exists):**
```bash
if [ -d "docs/waivers" ]; then
  ACTIVE=$(ls docs/waivers/WAIVER-*.md 2>/dev/null | wc -l | tr -d ' ')
  # Expired: any active waiver whose Expires date is in the past
  TODAY=$(date +%Y-%m-%d)
  EXPIRED=$(for W in docs/waivers/WAIVER-*.md; do
    [ -f "$W" ] || continue
    EXP=$(grep -m1 "^\*\*Expires:\*\*" "$W" | awk '{print $2}')
    [ -n "$EXP" ] && [ "$EXP" \< "$TODAY" ] && echo "$W"
  done 2>/dev/null | wc -l | tr -d ' ')
  echo "waivers_active=$ACTIVE expired_unresolved=$EXPIRED"
fi
```

### SLO burn alert (proactive — fires before exhaustion)

```bash
# Cheap check: only compute for the most-burning service+SLI in latest snapshot.
# Full breakdown lives in /burn.
if [ -f .great_cto/slo-burn-history.log ]; then
  python3 - <<'PY' 2>/dev/null
import datetime, collections, sys
from pathlib import Path
p = Path(".great_cto/slo-burn-history.log")
series = collections.defaultdict(list)
for line in p.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#'): continue
    parts = [x.strip() for x in line.split('|')]
    if len(parts) < 6: continue
    try:
        ts = datetime.datetime.fromisoformat(parts[0].replace('Z','+00:00')).timestamp()
        used = float(parts[3]); budget = float(parts[4])
    except Exception: continue
    series[(parts[1], parts[2])].append((ts, used, budget))
for k, snaps in series.items():
    snaps.sort()
    if len(snaps) < 2: continue
    ts_now, used_now, budget = snaps[-1]
    if budget <= 0: continue
    # Look at 24h window for fast-burn signal
    target = ts_now - 86400
    prev = next((s for s in reversed(snaps) if s[0] <= target), snaps[0])
    delta_secs = ts_now - prev[0]
    if delta_secs <= 0: continue
    actual = (used_now - prev[1]) / delta_secs
    normal = budget / (30 * 86400)
    if normal <= 0: continue
    mult = actual / normal
    if mult >= 14.4:
        print(f"BURN_ALERT:{k[0]}/{k[1]} fast={mult:.1f}× window=24h")
    elif mult >= 6.0:
        # Also check 7d slow-burn separately
        target7 = ts_now - 604800
        prev7 = next((s for s in reversed(snaps) if s[0] <= target7), snaps[0])
        d7 = ts_now - prev7[0]
        if d7 > 0:
            mult7 = ((used_now - prev7[1]) / d7) / normal
            if mult7 >= 6.0:
                print(f"BURN_ALERT:{k[0]}/{k[1]} slow={mult7:.1f}× window=7d")
PY
fi
```

If `BURN_ALERT` lines emitted, include in output:
```
--- BURN ALERTS ---
  🔴 <service>/<sli>: burn = <N>× normal (<window>) — projected exhaustion soon
  → run /burn for full breakdown and remediation context
```

### DORA signal (CFR spike)

```bash
# Lightweight check — only fires if there's enough data and CFR is concerning.
# Full breakdown lives in /dora.
if [ -f .great_cto/deploys.log ] && [ -d docs/postmortems ]; then
  WIN_START=$(( $(date +%s) - 7 * 86400 ))
  DEPLOYS_7D=$(awk -F'|' -v ws="$WIN_START" '
    $1 ~ /^[[:space:]]*#/ || NF<2 {next}
    { gsub(/[[:space:]]/,"",$1)
      cmd = "python3 -c \"import datetime; print(int(datetime.datetime.fromisoformat(\\\""$1"\\\".replace(\\\"Z\\\",\\\"+00:00\\\")).timestamp()))\" 2>/dev/null"
      cmd | getline ep; close(cmd)
      if (ep+0 >= ws) c++ }
    END { print c+0 }' .great_cto/deploys.log)
  INC_7D=0
  for F in docs/postmortems/PM-*.md; do
    [ -f "$F" ] || continue
    MT=$(stat -f %m "$F" 2>/dev/null || stat -c %Y "$F" 2>/dev/null || echo 0)
    [ "$MT" -ge "$WIN_START" ] && INC_7D=$((INC_7D+1))
  done
  if [ "$DEPLOYS_7D" -gt 0 ]; then
    CFR=$(python3 -c "print(round($INC_7D/$DEPLOYS_7D*100))")
    [ "$CFR" -gt 15 ] && echo "DORA_TRIGGER:CFR=${CFR}% deploys=${DEPLOYS_7D} incidents=${INC_7D}"
  fi
fi
```

If `DORA_TRIGGER` line emitted, include in output:
```
--- DORA SIGNAL ---
  ⚠ Change Failure Rate (7d) = <CFR>%  (<deploys> deploys, <incidents> incidents)
  → run /dora 30 for context
  → consider pausing feature work until next 3 deploys are clean
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

--- TOP RISKS (shown only if docs/risks/RISK-REGISTER.md has H×H or H×M active entries) ---
  [Top 5 active risks sorted by Impact desc then Probability desc]
  Format per line: R-NNN | <title> | P:<L/M/H> I:<L/M/H> | <owner> | <status>
  Suppress section entirely if 0 active risks at H×H or H×M.

--- UPCOMING EOLS (shown only if DEPRECATION-CALENDAR.md has entries within 90 days) ---
  [list entries sorted by EOL ascending, any Active status]
  Format: <what> | EOL <date> (<N>d remaining) | <owner> | <status>

--- SLO BUDGETS (shown only if .great_cto/slo-budget-current.md has WARN or EXHAUSTED rows) ---
  [list each WARN/EXHAUSTED row from cache — 1 per SLI]
  Format per line: <service> | <SLI> | <used> / <budget> (<%>) | <status>
  Suppress section if all SLIs at ok.
  ⚠ prefix on any EXHAUSTED row — deploys for that service are blocked.

--- WAIVERS (shown only if docs/waivers/ has active entries) ---
  Active: [count] | Expired unresolved: [count]
  [list each expired with open follow-up: ⚠ WAIVER-NNN EXPIRED — follow-up <task-id> open Nd overdue]

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
