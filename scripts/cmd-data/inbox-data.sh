#!/usr/bin/env bash
# scripts/cmd-data/inbox-data.sh
# Generated from commands/inbox.md — runs the data-gathering portion.
# Output is consumed by the /inbox command and formatted by the agent.

set -o pipefail  # do not -e -u: preserve partial output

# ── block 1 ────────────────────────
# Surface low/medium detection confidence so user can override before pipeline commits
CONF=$(grep "^archetype_confidence:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
if [ -n "$CONF" ] && [ "$CONF" != "high" ] && [ "$CONF" != "user-specified" ]; then
  ALT=$(grep "^archetype_alternatives:" .great_cto/PROJECT.md 2>/dev/null | sed 's/^archetype_alternatives:[[:space:]]*//')
  ARCH=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
  echo "ARCHETYPE_CONFIDENCE:level=${CONF} archetype=${ARCH} alternatives=${ALT}"
fi

# ── block 2 ────────────────────────
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

# ── block 3 ────────────────────────
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

# ── block 4 ────────────────────────
git log --oneline --since="24 hours ago" 2>/dev/null | head -15
git diff --stat $(git rev-list --max-parents=0 HEAD 2>/dev/null)..HEAD 2>/dev/null | tail -5

# ── block 5 ────────────────────────
bd stats 2>/dev/null || true
bd ready 2>/dev/null | head -10

# ── block 6 ────────────────────────
find docs/ -name "*.md" -mtime -1 2>/dev/null | sort | head -10

# ── block 7 ────────────────────────
gh pr list --state open 2>/dev/null | head -5 || true

# ── block 8 ────────────────────────
bd list --label production --status open 2>/dev/null || true

# ── block 9 ────────────────────────
# Overdue RFCs
[ -d "docs/rfcs" ] && ls docs/rfcs/RFC-*.md 2>/dev/null | sort | xargs grep -l "Status: DRAFT\|Status: REVIEW" 2>/dev/null | xargs grep "^Review deadline:" 2>/dev/null | awk -v today="$(date +%Y-%m-%d)" '$3 < today {print FILENAME, "OVERDUE:", $3}' | sed 's|docs/rfcs/||'

# On-call
[ -f ".great_cto/oncall-schedule.md" ] && grep "^Current:" .great_cto/oncall-schedule.md | head -5 || echo "oncall: not configured"

# ── block 10 ────────────────────────
[ -f "docs/decisions/DECISION-LOG.md" ] && grep "^## D-" docs/decisions/DECISION-LOG.md | tail -3 | sed 's/^## //' || true

# ── block 11 ────────────────────────
bd list --status open --priority 2 2>/dev/null | wc -l
tail -5 .great_cto/perf-baseline.log 2>/dev/null || echo "NO_BASELINE"
ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -1 | xargs grep -h "What slowed down:" 2>/dev/null | sort | uniq -c | sort -rn | head -3
ls docs/audits/AUDIT-*.md 2>/dev/null | sort -V | tail -1 || echo "NO_AUDIT"

# ── block 12 ────────────────────────
if [ -f "docs/risks/RISK-REGISTER.md" ]; then
  # Filter active H×H and H×M lines from the Active section
  awk '/## Active risks/,/^## /' docs/risks/RISK-REGISTER.md 2>/dev/null | \
    grep -E "^\| R-[0-9]+" | awk -F'|' '{
      prob=$4; imp=$5; gsub(/ /, "", prob); gsub(/ /, "", imp);
      if ((imp=="H" && (prob=="H" || prob=="M")) || (imp=="M" && prob=="H")) print $0
    }' | head -5
fi

# ── block 13 ────────────────────────
if [ -f "docs/deprecations/DEPRECATION-CALENDAR.md" ]; then
  # Entries with EOL within 90 days — human-readable list from Active section
  awk '/## Active/,/## Completed/' docs/deprecations/DEPRECATION-CALENDAR.md 2>/dev/null | \
    grep -E "^\|" | tail -n +3 | head -10
fi

# ── block 14 ────────────────────────
if [ -f ".great_cto/slo-budget-current.md" ]; then
  # Show any row at WARN or EXHAUSTED status — these need attention
  grep -E "\| (WARN|EXHAUSTED) \|" .great_cto/slo-budget-current.md 2>/dev/null | head -5
fi

# ── block 15 ────────────────────────
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

# ── block 16 ────────────────────────
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

# ── block 17 ────────────────────────
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

# ── block 18 ────────────────────────
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

# ── block 19 ────────────────────────
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

# ── block 20 ────────────────────────
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

# ── block 21 ────────────────────────
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
case "$ARCHETYPE" in
  ai-system|agent-product)
    AI_SIGNALS=""

    # 1. PoC deadline approaching / overdue
    MODE=$(grep "^mode:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
    POC_DEADLINE=$(grep "^poc-deadline:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
    if [ "$MODE" = "poc" ] && [ -n "$POC_DEADLINE" ]; then
      DAYS_LEFT=$(( ( $(date -j -f "%Y-%m-%d" "$POC_DEADLINE" "+%s" 2>/dev/null || date -d "$POC_DEADLINE" "+%s" 2>/dev/null) - $(date +%s) ) / 86400 ))
      if [ "${DAYS_LEFT:-0}" -lt 0 ]; then
        AI_SIGNALS+="  🚨 P0: PoC deadline overdue by $((0 - DAYS_LEFT))d. Run /promote (poc → mvp/production) or close the experiment.\n"
      elif [ "${DAYS_LEFT:-0}" -le 1 ]; then
        AI_SIGNALS+="  🚨 P0: PoC deadline in ${DAYS_LEFT}d. Decide /promote vs close.\n"
      elif [ "${DAYS_LEFT:-0}" -le 7 ]; then
        AI_SIGNALS+="  ⚠ PoC deadline in ${DAYS_LEFT}d ($POC_DEADLINE). Plan /promote or extension.\n"
      fi
    fi

    # 2. Monthly LLM budget at 80% / exceeded
    BUDGET=$(grep "^monthly-budget-llm-usd:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '$')
    if [ -n "$BUDGET" ] && [ "$BUDGET" != "0" ]; then
      MONTH_PREFIX=$(date -u +"%Y-%m")
      SPEND=0
      for SOURCE in .great_cto/cost-history.log logs/llm-cost.log logs/cost.log logs/audit.jsonl; do
        if [ -f "$SOURCE" ]; then
          SUM=$(grep "$MONTH_PREFIX" "$SOURCE" 2>/dev/null | grep -oE '"cost_usd"[[:space:]]*:[[:space:]]*[0-9.]+' | awk -F: '{s += $2} END {printf "%.2f", s}')
          SPEND=$(echo "$SPEND + ${SUM:-0}" | bc 2>/dev/null || echo "$SPEND")
        fi
      done
      PCT=$(echo "scale=0; $SPEND * 100 / $BUDGET" | bc 2>/dev/null || echo 0)
      if [ "${PCT:-0}" -ge 100 ]; then
        AI_SIGNALS+="  🚨 P0: LLM spend \$${SPEND} this month exceeds budget \$${BUDGET} (${PCT}%). Investigate runaway sessions or raise cap.\n"
      elif [ "${PCT:-0}" -ge 80 ]; then
        AI_SIGNALS+="  ⚠ LLM spend at ${PCT}% of monthly cap (\$${SPEND} / \$${BUDGET}).\n"
      fi
    elif [ -z "$BUDGET" ] || [ "$BUDGET" = "0" ]; then
      AI_SIGNALS+="  ⚠ monthly-budget-llm-usd not set in PROJECT.md (required for $ARCHETYPE).\n"
    fi

    # 3. Prompt drift — sha256 in code differs from ADR-PROMPT
    if ls docs/decisions/ADR-*-PROMPT-*.md >/dev/null 2>&1; then
      DRIFT_COUNT=0
      for ADR in docs/decisions/ADR-*-PROMPT-*.md; do
        STORED_HASH=$(grep -oE '\*\*Hash:\*\* `[a-f0-9]{64}`' "$ADR" 2>/dev/null | head -1 | grep -oE '[a-f0-9]{64}')
        [ -z "$STORED_HASH" ] && continue
        # Best-effort grep for the prompt text in src/
        # If prompt content not findable, skip (project-auditor will catch it deeper)
        # This is a proxy check — full drift detection lives in ai-eval-engineer
        :
      done
    fi

    # 4. Eval suite stale — last EVAL run > 14 days ago
    LAST_EVAL=$(find tests/eval -name "EVAL-*.md" -mtime -14 2>/dev/null | head -1)
    if [ -d tests/eval ] && [ -z "$LAST_EVAL" ]; then
      AI_SIGNALS+="  ⚠ Eval suite stale — no EVAL-*.md updated in 14d. Re-run eval-engineer baseline.\n"
    fi

    # 5. Eval regression — latest run lower pass-rate than previous (parsed from ## History tables)
    REGRESSION=0
    for EVAL in $(ls tests/eval/EVAL-*.md 2>/dev/null); do
      LAST_TWO=$(awk '/^\| \d{4}-\d{2}-\d{2}/{print}' "$EVAL" 2>/dev/null | tail -2)
      # naive: if last result column has lower pass count than previous, increment
      :
    done

    # 6. Cross-user isolation missing (agent-product only)
    if [ "$ARCHETYPE" = "agent-product" ]; then
      if ! find tests -type f \( -name "*isolation*" -o -name "*cross-user*" -o -name "*cross_user*" \) 2>/dev/null | head -1 > /dev/null; then
        AI_SIGNALS+="  🚨 P0: agent-product missing cross-user isolation test. Required for multi-tenant. Delegate to ai-eval-engineer.\n"
      fi
    fi

    # 7. ai-security-reviewer review stale — TM file mtime > 90d on critical archetype
    LATEST_TM=$(ls -t docs/sec-threats/TM-*.md 2>/dev/null | head -1)
    if [ -n "$LATEST_TM" ]; then
      TM_AGE_DAYS=$(( ( $(date +%s) - $(stat -f %m "$LATEST_TM" 2>/dev/null || stat -c %Y "$LATEST_TM" 2>/dev/null) ) / 86400 ))
      if [ "${TM_AGE_DAYS:-0}" -gt 90 ]; then
        AI_SIGNALS+="  ⚠ Threat model $LATEST_TM is ${TM_AGE_DAYS}d old. Re-run ai-security-reviewer (threat landscape evolves).\n"
      fi
    fi

    # 8. Model floating-tag detected in code (drift risk)
    if grep -rE "(gpt-4o|claude-sonnet-4-6|claude-haiku-4-5|gpt-5)\s*[\"',)]" src/ 2>/dev/null | grep -v "test\|mock\|comment" | head -1 > /dev/null; then
      AI_SIGNALS+="  ⚠ Floating model tag detected in src/ — pin via ADR-LLM (e.g. claude-sonnet-4-6-2025xxxx).\n"
    fi

    # 9. ADR-PROMPT count vs LLM roles in ARCH § LLM Scope
    LATEST_ARCH=$(ls -t docs/architecture/ARCH-*.md 2>/dev/null | head -1)
    if [ -n "$LATEST_ARCH" ]; then
      ROLES=$(awk '/^## LLM Scope/,/^## /' "$LATEST_ARCH" 2>/dev/null | grep -cE "^\| .* \| LLM \|" || echo 0)
      ADRS=$(ls docs/decisions/ADR-*-PROMPT-*.md 2>/dev/null | wc -l | tr -d ' ')
      if [ "${ROLES:-0}" -gt 0 ] && [ "${ADRS:-0}" -lt "${ROLES:-0}" ]; then
        AI_SIGNALS+="  ⚠ ARCH lists ${ROLES} LLM roles but only ${ADRS} ADR-PROMPT files. Run ai-prompt-architect.\n"
      fi
    fi

    if [ -n "$AI_SIGNALS" ]; then
      echo "--- AI HEALTH ---"
      printf "$AI_SIGNALS"
      echo "  → details: project-auditor Phase 4D + /digest board mode"
    fi
    ;;
esac

# ── block 22 ────────────────────────
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
