---
description: "What needs your attention? Shows open gates, recent activity, blocked items, and pending decisions."
argument-hint: "[optional: hours — default 24]"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

Show the CTO everything that needs attention: pending gates, recent activity digest, and blocked items. This combines the old /inbox and /digest into one view.

## Gather Data (run all in parallel)

**POC mode banner (fires only if `mode: poc` in PROJECT.md):**
```bash
if grep -q "^mode:\s*poc" .great_cto/PROJECT.md 2>/dev/null; then
  POC_SLUG=$(grep "^poc_slug:" .great_cto/PROJECT.md | awk '{print $2}')
  POC_EXPIRES=$(grep "^poc_expires:" .great_cto/PROJECT.md | awk '{print $2}')
  TODAY=$(date +%Y-%m-%d)
  if [ -n "$POC_EXPIRES" ]; then
    DAYS_LEFT=$(python3 -c "import datetime; d=(datetime.date.fromisoformat('$POC_EXPIRES')-datetime.date.fromisoformat('$TODAY')).days; print(d)" 2>/dev/null || echo "?")
    if [ "$DAYS_LEFT" -lt 0 ] 2>/dev/null; then
      echo "POC_EXPIRED:slug=${POC_SLUG} overdue=$((-DAYS_LEFT))d expires=${POC_EXPIRES}"
    elif [ "$DAYS_LEFT" -le 1 ] 2>/dev/null; then
      echo "POC_URGENT:slug=${POC_SLUG} days_left=${DAYS_LEFT} expires=${POC_EXPIRES}"
    else
      echo "POC_ACTIVE:slug=${POC_SLUG} days_left=${DAYS_LEFT} expires=${POC_EXPIRES}"
    fi
  fi
fi
```

If `POC_*` line emitted, display at top of `/inbox` output (before everything else):
```
--- POC MODE ---
  ⚠ POC-<slug> — <N> days remaining (expires <date>)
  → Hypothesis: <read from docs/poc/POC-<slug>.md "Hypothesis" line>
  → Out of scope: <read "Out of scope" bullets>
  → When timebox hits: /poc decide  (required — ship/pivot/kill)
```
For `POC_EXPIRED`: use 🔴 red banner, add `DEPLOY BLOCKED — /poc decide required`.
For `POC_URGENT`: use 🟡 yellow banner.

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
  → spawn l3-support with the burn alert line to get ranked hypotheses against prior PMs
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
  if [ "$DEPLOYS_7D" -ge 3 ]; then
    CFR=$(python3 -c "print(round($INC_7D/$DEPLOYS_7D*100))")
    # Thresholds per 2024 DORA: elite <5%, high 5–15%, concerning >15%.
    # Require ≥3 deploys in the window so we don't cry wolf on a single bad deploy.
    if [ "$CFR" -gt 15 ]; then
      echo "DORA_TRIGGER:level=alert CFR=${CFR}% deploys=${DEPLOYS_7D} incidents=${INC_7D}"
    elif [ "$CFR" -gt 5 ]; then
      echo "DORA_TRIGGER:level=warn CFR=${CFR}% deploys=${DEPLOYS_7D} incidents=${INC_7D}"
    fi
  fi

  # Deployment Rework Rate (5th DORA metric, 2024) — fires >10% in 7d window.
  # Kind lives in column 6 (added in v1.0.92). Legacy rows without KIND are treated as feature.
  REWORK_7D=$(awk -F'|' -v ws="$WIN_START" '
    $1 ~ /^[[:space:]]*#/ || NF<2 {next}
    { gsub(/[[:space:]]/,"",$1); gsub(/[[:space:]]/,"",$6)
      cmd = "python3 -c \"import datetime; print(int(datetime.datetime.fromisoformat(\\\""$1"\\\".replace(\\\"Z\\\",\\\"+00:00\\\")).timestamp()))\" 2>/dev/null"
      cmd | getline ep; close(cmd)
      if (ep+0 >= ws && ($6=="hotfix" || $6=="rollback" || $6=="patch")) c++ }
    END { print c+0 }' .great_cto/deploys.log)
  if [ "$DEPLOYS_7D" -ge 3 ] && [ "$REWORK_7D" -gt 0 ]; then
    RWR=$(python3 -c "print(round($REWORK_7D/$DEPLOYS_7D*100))")
    [ "$RWR" -gt 10 ] && echo "REWORK_TRIGGER:rate=${RWR}% rework=${REWORK_7D}/${DEPLOYS_7D}"
  fi
fi
```

If `DORA_TRIGGER` line emitted, include in output:
```
--- DORA SIGNAL ---
  ⚠ Change Failure Rate (7d) = <CFR>% [<level>]  (<deploys> deploys, <incidents> incidents)
  → run /dora 30 for context
  → spawn l3-support with "CFR spike 7d, <N> incidents" for hypotheses from prior PMs
  level=warn:  CFR is above elite (<5%) — watch the trend, don't panic
  level=alert: pause feature work until next 3 deploys are clean
```

If `REWORK_TRIGGER` line emitted, include in output:
```
--- REWORK SIGNAL ---
  ⚠ Deployment Rework Rate (7d) = <rate>%  (<rework>/<deploys> unplanned)
  → hotfixes/rollbacks/patches are consuming capacity without delivering value
  → run /dora for breakdown; check whether staging mirrors prod
```

### Gate drift signal (rubber-stamping check)

```bash
# Fires when a gate is at >85% pass AND drifted +10pp vs prior 30d window.
# Gate drift — cheap inline check. Rubber-stamping shows as >85% pass + rising trend.
if [ -d .great_cto/verdicts ]; then
  python3 - <<'PY' 2>/dev/null
import os, re, glob, datetime, collections
NOW = datetime.datetime.now().timestamp()
WIN = 30 * 86400
PASS = {"PASS","APPROVED","ARCH_READY","DEPLOYED","DONE"}
FAIL = {"FAIL","BLOCKED","ROLLED_BACK","ROLLBACK"}
verdicts = collections.defaultdict(list)
for path in glob.glob(".great_cto/verdicts/*.log"):
    base = os.path.basename(path)
    is_per_agent = not re.match(r'^\d{4}-\d{2}-\d{2}\.log$', base)
    default_agent = base[:-4] if is_per_agent else None
    try:
        for line in open(path):
            line = line.strip()
            if not line or line.startswith('#'): continue
            if '|' in line:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) < 3: continue
                ts_s, agent, status = parts[0], parts[1], parts[2]
            else:
                bits = line.split(None, 3)
                if len(bits) < 3: continue
                ts_s, agent, status = bits[0], bits[1], bits[2]
                if default_agent and agent.upper() in PASS | FAIL:
                    status, agent = agent, default_agent
            try:
                ts = datetime.datetime.fromisoformat(ts_s.replace('Z','+00:00')).timestamp()
            except Exception: continue
            su = status.upper()
            norm = "PASS" if su in PASS else "FAIL" if su in FAIL else "OTHER"
            verdicts[agent].append((ts, norm))
    except Exception: continue
for agent, snaps in verdicts.items():
    cur = [s for s in snaps if s[0] >= NOW - WIN and s[1] in ("PASS","FAIL")]
    prev = [s for s in snaps if NOW - 2*WIN <= s[0] < NOW - WIN and s[1] in ("PASS","FAIL")]
    if len(cur) < 5 or len(prev) < 5: continue
    cur_rate = sum(1 for s in cur if s[1]=="PASS") / len(cur) * 100
    prev_rate = sum(1 for s in prev if s[1]=="PASS") / len(prev) * 100
    drift = cur_rate - prev_rate
    if cur_rate > 85 and drift >= 10:
        print(f"GATE_DRIFT:{agent} pass={cur_rate:.0f}% drift=+{drift:.0f}pp n={len(cur)}")
PY
fi
```

If `GATE_DRIFT` line emitted, include in output:
```
--- GATE HEALTH ---
  ⚠ <agent>: pass=<N>% (drift +<M>pp over prior 30d) — likely rubber-stamping
  → inspect recent verdicts in .great_cto/verdicts/ to see if <agent> is auto-approving without reading artefacts
```

### Cost alert (run-rate vs budget or top mover spike)

```bash
# Fires when run-rate crosses alert_threshold of budget OR any service +30% MoM.
# Cheap version — full breakdown lives in /cost.
if [ -f .great_cto/cost-history.log ]; then
  python3 - <<'PY' 2>/dev/null
import datetime, collections
from pathlib import Path
import re
p = Path(".great_cto/cost-history.log")
proj = Path(".great_cto/PROJECT.md")
budget = 0.0
threshold = 80.0
if proj.exists():
    for line in proj.read_text().splitlines():
        m = re.match(r'^monthly-budget:\s*\$?([0-9.]+)', line)
        if m:
            try: budget = float(m.group(1))
            except: pass
        m = re.match(r'^budget-alert-threshold:\s*([0-9.]+)', line)
        if m:
            try: threshold = float(m.group(1))
            except: pass

rows = []
for line in p.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#'): continue
    parts = [x.strip() for x in line.split('|')]
    if len(parts) < 6: continue
    try:
        ts = datetime.datetime.fromisoformat(parts[0].replace('Z','+00:00')).timestamp()
    except: continue
    try: est = float(parts[2]) if parts[2] not in ('-','') else None
    except: est = None
    try: actual = float(parts[3]) if parts[3] not in ('-','') else None
    except: actual = None
    rows.append((ts, parts[1], est, actual))

if not rows: exit()
rows.sort()
# Latest per service (for run-rate)
latest = {}
for ts, svc, est, actual in rows:
    if svc not in latest or ts > latest[svc][0]:
        latest[svc] = (ts, est, actual)
runrate = sum((v[2] if v[2] is not None else (v[1] or 0)) for v in latest.values())

# Budget alert
if budget > 0:
    pct = runrate / budget * 100
    if pct >= 100:
        print(f"COST_ALERT:OVER_BUDGET runrate=${runrate:.0f} budget=${budget:.0f} pct={pct:.0f}%")
    elif pct >= threshold:
        print(f"COST_ALERT:NEAR_BUDGET runrate=${runrate:.0f} budget=${budget:.0f} pct={pct:.0f}%")

# Top-mover alert (30d window, +30% service MoM)
now = datetime.datetime.now(datetime.timezone.utc).timestamp()
cur_start = now - 30*86400
prev_start = now - 60*86400
cur = collections.defaultdict(float); prev = collections.defaultdict(float)
for ts, svc, est, _ in rows:
    if est is None: continue
    if ts >= cur_start: cur[svc] += est
    elif ts >= prev_start: prev[svc] += est
for svc in cur:
    if prev.get(svc, 0) > 0:
        delta = (cur[svc] - prev[svc]) / prev[svc] * 100
        if delta >= 30:
            print(f"COST_MOVER:{svc} delta=+{delta:.0f}% added=${cur[svc]:.0f}")
PY
fi
```

If `COST_ALERT` or `COST_MOVER` emitted, include in output:
```
--- COST ---
  ⚠ Run-rate $<N>/mo = <pct>% of $<budget> budget (threshold <threshold>%)
  ⚠ Mover: <service> +<pct>% MoM ($<added> added this 30d)
  → run /cost 30 for top movers and actions
```

### Security signals (cheap checks — full breakdown lives in /sec)

```bash
# SEC_CVE_ALERT — ≥1 critical CVE still open > 14 days
if [ -f docs/cve-log.md ]; then
  python3 - <<'PY' 2>/dev/null
import datetime, re
from pathlib import Path
today = datetime.date.today()
open_crit = 0
overdue = 0
for line in Path("docs/cve-log.md").read_text().splitlines():
    m = re.match(r'^\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(CVE-\d+-\d+)\s*\|\s*(\w+)\s*\|\s*(\w+)', line)
    if not m: continue
    disclosed_s, cve, sev, status = m.groups()
    if status.lower() in ("resolved", "fixed", "closed", "mitigated"): continue
    try: disclosed = datetime.date.fromisoformat(disclosed_s)
    except: continue
    age = (today - disclosed).days
    if sev.lower() == "critical":
        open_crit += 1
        if age > 14: overdue += 1
if overdue > 0:
    print(f"SEC_CVE_ALERT:open_critical={open_crit} overdue_14d={overdue}")
PY
fi

# SEC_ROTATION — ≥1 secret past rotation_due
if [ -f .great_cto/secrets.md ]; then
  TODAY=$(date +%Y-%m-%d)
  OVERDUE=$(grep -E "^\s*rotation_due:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}" .great_cto/secrets.md 2>/dev/null | awk -v today="$TODAY" '{ if ($2 < today) c++ } END { print c+0 }')
  [ "${OVERDUE:-0}" -gt 0 ] && echo "SEC_ROTATION:overdue=${OVERDUE}"
fi

# SEC_TM_GAP — threat-model coverage <60% for security-critical archetypes
if [ -d docs/architecture ] && [ -f .great_cto/PROJECT.md ]; then
  ARCHETYPE=$(grep -E "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
  case "$ARCHETYPE" in
    ai-system|commerce|web3|iot-embedded|regulated|fintech)
      TOTAL=0; COVERED=0
      for A in docs/architecture/ARCH-*.md; do
        [ -f "$A" ] || continue
        TOTAL=$((TOTAL+1))
        SLUG=$(basename "$A" .md | sed 's/^ARCH-//')
        grep -q "^## Security" "$A" && [ -f "docs/threat-models/TM-${SLUG}.md" ] && COVERED=$((COVERED+1))
      done
      if [ "$TOTAL" -ge 3 ]; then
        PCT=$(python3 -c "print(round($COVERED/$TOTAL*100))")
        [ "$PCT" -lt 60 ] && echo "SEC_TM_GAP:coverage=${PCT}% covered=${COVERED}/${TOTAL} archetype=${ARCHETYPE}"
      fi
      ;;
  esac
fi
```

If any `SEC_*` line emitted, include in output:
```
--- SECURITY ---
  ⚠ Critical CVEs open > 14 days: <overdue_14d>  (total open critical: <open_critical>)
  ⚠ Secrets past rotation_due: <overdue>
  ⚠ Threat-model coverage <PCT>% for <archetype> — below 60% threshold
  → run /sec for full snapshot and remediation
```

### Backlog hygiene (replaces former /triage)

Cheap signals only — emit line if a problem is worth surfacing. Do NOT
restructure backlog automatically; just name the issue.

```bash
OPEN_TASKS=$(bd list --status open 2>/dev/null | wc -l | tr -d ' ')
# Duplicate titles (case-insensitive, exact match)
DUP_COUNT=$(bd list --status open 2>/dev/null | awk -F'  +' '{print tolower($NF)}' | sort | uniq -d | wc -l | tr -d ' ')
# P0/P1 without assignee (if OWNERSHIP.md exists)
UNOWNED_URGENT=$(bd list --status open 2>/dev/null | grep -E 'P[01]' | grep -v '@' | wc -l | tr -d ' ')
# Tasks older than 60 days
STALE_TASKS=0
if [ -f .beads/tasks.db ] || command -v bd >/dev/null 2>&1; then
  STALE_TASKS=$(bd list --status open --older-than 60d 2>/dev/null | wc -l | tr -d ' ' || echo 0)
fi

if [ "$OPEN_TASKS" -gt 100 ] || [ "$DUP_COUNT" -gt 0 ] || [ "$UNOWNED_URGENT" -gt 2 ] || [ "$STALE_TASKS" -gt 10 ]; then
  HYGIENE_LINES=()
  [ "$OPEN_TASKS" -gt 100 ] && HYGIENE_LINES+=("Backlog: ${OPEN_TASKS} open tasks — consider pruning")
  [ "$DUP_COUNT" -gt 0 ] && HYGIENE_LINES+=("Duplicates: ${DUP_COUNT} task titles appear multiple times")
  [ "$UNOWNED_URGENT" -gt 2 ] && HYGIENE_LINES+=("Unowned urgent: ${UNOWNED_URGENT} P0/P1 tasks without an assignee")
  [ "$STALE_TASKS" -gt 10 ] && HYGIENE_LINES+=("Stale: ${STALE_TASKS} tasks untouched for 60+ days")
  printf 'HYGIENE_%s\n' "${HYGIENE_LINES[@]}"
fi
```

If any `HYGIENE_*` line emitted, include in output (only when thresholds tripped — do not show on healthy backlog):
```
--- BACKLOG HYGIENE ---
  ⚠ <hygiene line>
  → prune stale tasks with `bd close <id>`; fix duplicates with `bd merge`
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
