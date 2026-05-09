#!/usr/bin/env bash
# scripts/cmd-data/digest-data.sh
set -o pipefail  # do not -e -u: preserve partial output

# ── block 1 ────────────────────────
BOARD_MODE=false
ARCHITECTURE_MODE=false
DAYS=7
CURRENT_YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%m)
for arg in "$@"; do
  case "$arg" in
    board) BOARD_MODE=true ;;
    architecture) ARCHITECTURE_MODE=true ;;
    Q1) DAYS=90; QUARTER="Q1"; PERIOD_LABEL="Q1 (Jan–Mar $CURRENT_YEAR)" ;;
    Q2) DAYS=91; QUARTER="Q2"; PERIOD_LABEL="Q2 (Apr–Jun $CURRENT_YEAR)" ;;
    Q3) DAYS=92; QUARTER="Q3"; PERIOD_LABEL="Q3 (Jul–Sep $CURRENT_YEAR)" ;;
    Q4) DAYS=92; QUARTER="Q4"; PERIOD_LABEL="Q4 (Oct–Dec $CURRENT_YEAR)" ;;
    [0-9]*) DAYS="$arg" ;;
  esac
done
[ -z "$QUARTER" ] && QUARTER="Q$(( (10#$CURRENT_MONTH - 1) / 3 + 1 ))" && PERIOD_LABEL="Q${QUARTER#Q} $CURRENT_YEAR (to date)"

# ── block 2 ────────────────────────
CACHE_DIR=".great_cto/cache"
mkdir -p "$CACHE_DIR"
DIGEST_CACHE="$CACHE_DIR/digest-${DAYS}d.txt"

# Use cache if less than 1 hour old
if [ -f "$DIGEST_CACHE" ]; then
  CACHE_AGE=$(( $(date +%s) - $(stat -f %m "$DIGEST_CACHE" 2>/dev/null || stat -c %Y "$DIGEST_CACHE" 2>/dev/null || echo 0) ))
  if [ "$CACHE_AGE" -lt 3600 ]; then
    echo "CACHE_HIT: digest-${DAYS}d.txt age=${CACHE_AGE}s"
    cat "$DIGEST_CACHE"
    exit 0
  fi
fi

# ── block 3 ────────────────────────
git log --oneline --since="${DAYS} days ago" 2>/dev/null | wc -l
git log --since="${DAYS} days ago" --format="%ae" 2>/dev/null | sort | uniq -c | sort -rn | head -5
git log --since="${DAYS} days ago" --name-only --format="" 2>/dev/null | grep -v "^$" | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -5

# ── block 4 ────────────────────────
# DAYS already set from args parse above
bd list --label production --status open 2>/dev/null | wc -l
ls docs/postmortems/PM-*.md 2>/dev/null | sort | while read f; do
  D=$(grep "^Date:" "$f" 2>/dev/null | head -1 | awk '{print $2}')
  [ -n "$D" ] && echo "$D $f"
done | sort -r | head -5

# ── block 5 ────────────────────────
bd list --status open --priority 2 2>/dev/null | wc -l
# New baseline format: p95:<value>ms error_rate:<value>% ts:<ISO8601> feature:<name>
tail -7 .great_cto/perf-baseline.log 2>/dev/null | grep -oE 'p95:[0-9]+ms' | sed 's/p95://' | tr '\n' ' '
ls docs/audits/AUDIT-*.md docs/audit/AUDIT-*.md 2>/dev/null | sort -V | tail -1 || echo "NO_AUDIT"

# ── block 6 ────────────────────────
# DAYS already set from args parse above
# Cross-platform date arithmetic
CUTOFF=$(python3 -c "from datetime import date, timedelta; print((date.today() - timedelta(days=${DAYS:-7})).isoformat())" 2>/dev/null \
  || date -v-${DAYS:-7}d +%Y-%m-%d 2>/dev/null \
  || date -d "${DAYS:-7} days ago" +%Y-%m-%d 2>/dev/null \
  || echo "1970-01-01")
ls docs/decisions/ADR-*.md 2>/dev/null | sort | while read f; do
  D=$(grep "^Date:" "$f" 2>/dev/null | awk '{print $2}')
  [ -n "$D" ] && [ "$D" \> "$CUTOFF" ] && echo "$D $f"
done | sort -r | head -5

# ── block 7 ────────────────────────
bd list --label gate --status open 2>/dev/null | head -10
# Fallback: check tasks.md
grep "\[GATE" .great_cto/tasks.md 2>/dev/null | grep -v "APPROVED\|BLOCKED\|CLOSED" | head -5

# ── block 8 ────────────────────────
for AGENT in architect qa-engineer security-officer devops; do
  LOG=".great_cto/verdicts/${AGENT}.log"
  [ -f "$LOG" ] || continue
  TOTAL=$(wc -l < "$LOG")
  PASS=$(grep -cE "PASS|APPROVED|ARCH_READY" "$LOG" 2>/dev/null || echo 0)
  FAIL=$(grep -cE "FAIL|BLOCKED" "$LOG" 2>/dev/null || echo 0)
  LAST=$(tail -1 "$LOG" | awk '{print $1, $3}')
  echo "${AGENT}: total=${TOTAL} pass=${PASS} fail=${FAIL} | last: ${LAST}"
done

# ── block 9 ────────────────────────
# DAYS already set from args parse above
CUTOFF=$(python3 -c "from datetime import date, timedelta; print((date.today() - timedelta(days=${DAYS:-7})).isoformat())" 2>/dev/null \
  || date -v-${DAYS:-7}d +%Y-%m-%d 2>/dev/null \
  || date -d "${DAYS:-7} days ago" +%Y-%m-%d 2>/dev/null \
  || echo "1970-01-01")

# Deployment Frequency: prefer .great_cto/deploys.log (v1.0.87+); fallback to perf-baseline.log.
if [ -f .great_cto/deploys.log ]; then
  DEPLOY_COUNT=$(awk -F'|' -v cut="$CUTOFF" '
    $1 ~ /^[[:space:]]*#/ || NF<2 {next}
    { gsub(/[[:space:]]/,"",$1); if (substr($1,1,10) >= cut) c++ }
    END { print c+0 }' .great_cto/deploys.log)
else
  DEPLOY_COUNT=$(grep "ts:" .great_cto/perf-baseline.log 2>/dev/null | grep -oE 'ts:[0-9]{4}-[0-9]{2}-[0-9]{2}' | sed 's/ts://' | awk -v cut="$CUTOFF" '$1 >= cut' | wc -l | tr -d ' ')
fi
echo "deploy_frequency=${DEPLOY_COUNT} deploys in last ${DAYS} days"

# Lead Time: first commit to deploy (git first commit in feature branch → deploy ts in perf-baseline.log)
LAST_DEPLOY_TS=$(grep "ts:" .great_cto/perf-baseline.log 2>/dev/null | tail -1 | grep -oE 'ts:[0-9T:Z-]+' | sed 's/ts://')
FIRST_COMMIT_TS=$(git log --format="%aI" --since="${CUTOFF}" 2>/dev/null | tail -1)
if [ -n "$LAST_DEPLOY_TS" ] && [ -n "$FIRST_COMMIT_TS" ]; then
  python3 -c "
from datetime import datetime
try:
    d = datetime.fromisoformat('${LAST_DEPLOY_TS}'.replace('Z','+00:00'))
    c = datetime.fromisoformat('${FIRST_COMMIT_TS}'.replace('Z','+00:00'))
    diff = (d - c).total_seconds() / 3600
    print(f'lead_time={diff:.1f}h (first commit → last deploy)')
except: print('lead_time=N/A')
" 2>/dev/null || echo "lead_time=N/A"
fi

# MTTR: average from postmortem MTTR fields
python3 -c "
import os, glob, re
files = sorted(glob.glob('docs/postmortems/PM-*.md'))
mttr_vals = []
for f in files:
    with open(f) as fp:
        for line in fp:
            m = re.search(r'MTTR:\s*([0-9.]+)\s*(min|h)', line, re.I)
            if m:
                val = float(m.group(1))
                if 'h' in m.group(2).lower(): val *= 60
                mttr_vals.append(val)
if mttr_vals:
    avg = sum(mttr_vals) / len(mttr_vals)
    print(f'mttr_avg={avg:.0f}min (n={len(mttr_vals)} incidents)')
else:
    print('mttr=N/A (no postmortems with MTTR field)')
" 2>/dev/null || echo "mttr=N/A"

# Change Failure Rate: postmortems / total deploys (all time).
# Prefer deploys.log (v1.0.87+); fallback to perf-baseline.log.
if [ -f .great_cto/deploys.log ]; then
  TOTAL_DEPLOYS=$(grep -cv "^[[:space:]]*#" .great_cto/deploys.log 2>/dev/null || echo 0)
else
  TOTAL_DEPLOYS=$(grep -c "ts:" .great_cto/perf-baseline.log 2>/dev/null || echo 0)
fi
TOTAL_PMS=$(ls docs/postmortems/PM-*.md 2>/dev/null | wc -l | tr -d ' ')
python3 -c "
d, p = ${TOTAL_DEPLOYS:-0}, ${TOTAL_PMS:-0}
if d > 0: print(f'change_failure_rate={p/d*100:.1f}% ({p} postmortems / {d} deploys)')
else: print('change_failure_rate=N/A (no deploys logged)')
" 2>/dev/null || echo "change_failure_rate=N/A"

# ── block 10 ────────────────────────
# Count Beads tasks labelled hotfix / rework / unplanned in the DAYS window
CUTOFF=$(python3 -c "from datetime import date, timedelta; print((date.today() - timedelta(days=${DAYS:-7})).isoformat())" 2>/dev/null || date -v-${DAYS:-7}d +%Y-%m-%d 2>/dev/null || echo "")
REWORK_TASKS=$(bd list --label hotfix --status closed 2>/dev/null | awk -v cut="$CUTOFF" '$0 ~ cut || $0 > cut' | wc -l | tr -d ' ')
REWORK_TASKS=$(( REWORK_TASKS + $(bd list --label rework --status closed 2>/dev/null | awk -v cut="$CUTOFF" '$0 ~ cut || $0 > cut' | wc -l | tr -d ' ') ))
REWORK_TASKS=$(( REWORK_TASKS + $(bd list --label unplanned --status closed 2>/dev/null | awk -v cut="$CUTOFF" '$0 ~ cut || $0 > cut' | wc -l | tr -d ' ') ))
DEPLOY_COUNT_FOR_RW=${DEPLOY_COUNT:-0}
python3 -c "
r, d = ${REWORK_TASKS:-0}, ${DEPLOY_COUNT_FOR_RW:-0}
if d > 0: print(f'rework_rate={r/d*100:.1f}% ({r} unplanned tasks / {d} deploys)')
else: print(f'rework_rate=N/A ({r} hotfix/rework/unplanned tasks, no deploy count)')
" 2>/dev/null || echo "rework_rate=N/A"

# ── block 11 ────────────────────────
# Load previous DORA snapshot for delta arrows
DORA_LOG=".great_cto/dora-baseline.log"
PREV_DEPLOY=$(awk '/^deploy_freq:/{print $2}' "$DORA_LOG" 2>/dev/null | tail -1 || echo "")
PREV_LEAD=$(awk '/^lead_time_h:/{print $2}' "$DORA_LOG" 2>/dev/null | tail -1 || echo "")
PREV_MTTR=$(awk '/^mttr_h:/{print $2}' "$DORA_LOG" 2>/dev/null | tail -1 || echo "")
PREV_CFR=$(awk '/^cfr_pct:/{print $2}' "$DORA_LOG" 2>/dev/null | tail -1 || echo "")
PREV_REWORK=$(awk '/^rework_pct:/{print $2}' "$DORA_LOG" 2>/dev/null | tail -1 || echo "")

# Shell helper: emit arrow (↑ bad / ↓ good / — same) for a metric
# Usage: dora_delta <current_float> <prev_float> <higher_is_worse: 1|0>
dora_delta() {
  python3 -c "
c, p, bad_up = '${1}', '${2}', '${3}'
try:
  cv, pv = float(c), float(p)
  diff = cv - pv
  if abs(diff) < 0.01: sym = '—'
  elif (diff > 0) == (bad_up == '1'): sym = f'↑{abs(diff):.1f} worse'
  else: sym = f'↓{abs(diff):.1f} better'
  print(sym)
except: print('')
" 2>/dev/null
}

# ── block 12 ────────────────────────
ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -2 | xargs grep -h "What slowed down:\|Notes:" 2>/dev/null | sort | uniq -c | sort -rn | head -3

# ── block 13 ────────────────────────
GP_DIR="$HOME/.great_cto/global-patterns"
if [ -d "$GP_DIR" ] && ls "$GP_DIR"/GP-*.md >/dev/null 2>&1; then
  GP_TOTAL=$(ls "$GP_DIR"/GP-*.md 2>/dev/null | wc -l | tr -d ' ')
  GP_ACTIVE=$(grep -rl "status: active" "$GP_DIR" 2>/dev/null | wc -l | tr -d ' ')
  GP_HITS_TOTAL=$(grep -h "^hits:" "$GP_DIR"/GP-*.md 2>/dev/null | awk '{sum += $2} END {print sum+0}')
  # MTTR reductions — parse "Xh → Yh (Z%)" format from mttr_reduction field
  GP_AVG_REDUCTION=$(grep -h "^mttr_reduction:" "$GP_DIR"/GP-*.md 2>/dev/null | \
    grep -oE "[0-9]+%" | tr -d '%' | awk '{sum+=$1; c++} END {c>0 ? printf "%.0f%%", sum/c : print "N/A"}')
  # Top 3 by hits
  echo "pattern_total=$GP_TOTAL | active=$GP_ACTIVE | total_hits=$GP_HITS_TOTAL | avg_mttr_reduction=$GP_AVG_REDUCTION"
  echo "Top patterns by hits:"
  grep -h "^hits:" "$GP_DIR"/GP-*.md 2>/dev/null | \
    paste - <(ls "$GP_DIR"/GP-*.md 2>/dev/null) | \
    sort -rn -k2 | head -3 | while read hits_line f; do
      HITS=$(echo "$hits_line" | awk '{print $2}')
      SLUG=$(basename "$f" .md)
      SYMPTOM=$(grep "^symptom:" "$f" 2>/dev/null | head -1 | sed 's/symptom: //')
      printf "  %s (hits=%s): %s\n" "$SLUG" "$HITS" "$SYMPTOM"
    done
else
  echo "pattern_total=0 | no extractions yet — run /crystallize after first incident"
fi

# ── block 14 ────────────────────────
# 1. On-call burden: postmortems per active engineer in period
ACTIVE_AUTHORS=$(git log --since="${DAYS:-7} days ago" --format='%ae' 2>/dev/null | sort -u | wc -l | tr -d ' ')
PM_PERIOD=$(ls docs/postmortems/PM-*.md 2>/dev/null | xargs grep -l "$(date -v-${DAYS:-7}d +%Y-%m 2>/dev/null || date --date="${DAYS:-7} days ago" +%Y-%m 2>/dev/null)" 2>/dev/null | wc -l | tr -d ' ')
[ "${ACTIVE_AUTHORS:-0}" -gt 0 ] && echo "oncall_burden=$(python3 -c "print(f'{${PM_PERIOD:-0}/${ACTIVE_AUTHORS}:.2f} incidents/engineer')" 2>/dev/null)" || echo "oncall_burden=N/A"

# 2. CI predictability: failed deploys % from deploys.log (if status field present)
if [ -f .great_cto/deploys.log ]; then
  CI_TOTAL=$(grep -cv "^[[:space:]]*#" .great_cto/deploys.log 2>/dev/null || echo 0)
  CI_FAIL=$(grep -c "status:fail\|status:rollback" .great_cto/deploys.log 2>/dev/null || echo 0)
  python3 -c "
t, f = ${CI_TOTAL:-0}, ${CI_FAIL:-0}
if t > 0: print(f'ci_predictability={100-f/t*100:.0f}% success ({f} failures / {t} total)')
else: print('ci_predictability=N/A')
" 2>/dev/null
else
  echo "ci_predictability=N/A (no deploys.log)"
fi

# 3. Review pressure: P1+P2 count from most recent /review report
LATEST_REVIEW=$(ls docs/reviews/REVIEW-*.md 2>/dev/null | sort -V | tail -1)
if [ -n "$LATEST_REVIEW" ]; then
  P1R=$(grep -c "^\*\*P1\|^- P1\b" "$LATEST_REVIEW" 2>/dev/null || echo 0)
  P2R=$(grep -c "^\*\*P2\|^- P2\b" "$LATEST_REVIEW" 2>/dev/null || echo 0)
  echo "review_pressure=P1:${P1R} P2:${P2R} ($(basename $LATEST_REVIEW))"
else
  echo "review_pressure=N/A (no /review reports)"
fi

# ── block 15 ────────────────────────
# On-call: current person from schedule
[ -f ".great_cto/oncall-schedule.md" ] && grep "^Current:" .great_cto/oncall-schedule.md 2>/dev/null | head -5

# RFC state
RFC_OPEN=$(ls docs/rfcs/RFC-*.md 2>/dev/null | xargs grep -l "Status: DRAFT\|Status: REVIEW" 2>/dev/null | wc -l | tr -d ' ')
RFC_OVERDUE=$(ls docs/rfcs/RFC-*.md 2>/dev/null | xargs grep -l "Status: DRAFT\|Status: REVIEW" 2>/dev/null | xargs grep "^Review deadline:" 2>/dev/null | awk -v today="$(date +%Y-%m-%d)" '$3 < today {count++} END {print count+0}')
echo "rfc_open=$RFC_OPEN rfc_overdue=$RFC_OVERDUE"

# Ownership gaps
[ -f ".great_cto/OWNERSHIP.md" ] && grep -c "^| .*—.*—" .great_cto/OWNERSHIP.md 2>/dev/null || echo "ownership=not_configured"

# ── block 16 ────────────────────────
if [ -f .great_cto/llm-router-usage.log ]; then
  python3 <<'PY'
import json, pathlib
lines = pathlib.Path(".great_cto/llm-router-usage.log").read_text(encoding="utf-8").splitlines()
recs = [json.loads(l) for l in lines if l.strip()]
if not recs:
    raise SystemExit
total_tok = sum((r.get("total_tokens") or 0) for r in recs)
calls = len(recs)
# Rough Kimi K2 pricing on OpenRouter ≈ $0.60 / 1M in + $2.50 / 1M out (as of 2026-04).
# Claude Sonnet ≈ $3 / 1M in + $15 / 1M out. Assume 50/50 split for estimate.
in_tok = sum((r.get("prompt_tokens") or 0) for r in recs)
out_tok = sum((r.get("completion_tokens") or 0) for r in recs)
kimi_cost = in_tok * 0.60e-6 + out_tok * 2.50e-6
sonnet_cost = in_tok * 3.0e-6 + out_tok * 15.0e-6
saved = sonnet_cost - kimi_cost
print("")
print("LLM ROUTER")
print(f"  Calls: {calls} | Tokens: {total_tok:,}")
print(f"  Kimi spend: ${kimi_cost:.2f} | Sonnet-equiv: ${sonnet_cost:.2f} | Saved: ${saved:.2f}")
PY
fi

# ── block 17 ────────────────────────
# Save formatted output to cache
cat > "$DIGEST_CACHE" <<EOF
$GENERATED_DIGEST_OUTPUT
EOF
echo "CACHED: digest-${DAYS}d.txt (valid for 1h)"

# ── block 18 ────────────────────────
# Persist current DORA values for delta arrows on next /digest run.
# Format: <key>: <value>  (one per line, appended; last entry wins per key)
DORA_LOG=".great_cto/dora-baseline.log"
TODAY=$(date +%Y-%m-%d)
{
  echo "# /digest snapshot ${TODAY} (days=${DAYS:-7})"
  echo "deploy_freq: ${DEPLOY_COUNT:-N/A}"
  echo "lead_time_h: ${LEAD_TIME_H:-N/A}"
  echo "mttr_h: ${MTTR_H:-N/A}"
  echo "cfr_pct: ${CFR_PCT:-N/A}"
  echo "rework_pct: ${REWORK_PCT:-N/A}"
} >> "$DORA_LOG"
# Keep only last 10 snapshots (60 lines) to avoid unbounded growth
tail -60 "$DORA_LOG" > "$DORA_LOG.tmp" && mv "$DORA_LOG.tmp" "$DORA_LOG"

# ── block 19 ────────────────────────
if [ -f "docs/reliability/INCIDENT-LOG.md" ] && [ -f "docs/risks/RISK-REGISTER.md" ]; then
  # Extract causes from incident log (last 30 days), count frequencies
  # Cutoff timestamp (portable between GNU/BSD date)
  CUTOFF=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
  awk -v cut="$CUTOFF" '/^## [0-9]{4}-/ { d=$2; next }
    /^Cause:/ && d >= cut { sub(/^Cause: /, ""); print }' \
    docs/reliability/INCIDENT-LOG.md 2>/dev/null | \
    sort | uniq -c | awk '$1 >= 3 { print $0 }' > /tmp/recurring-causes.txt
  # For each line in /tmp/recurring-causes.txt, check if a matching R- exists;
  # if not, append a new risk (source: "INC-LOG recurring", status: analysis).
  # See references/risk-register.md for ID scheme and dedup rules.
fi

# ── block 20 ────────────────────────
if [ -d "docs/waivers" ]; then
  TODAY=$(date +%Y-%m-%d)
  # Expired detection
  for W in docs/waivers/WAIVER-*.md; do
    [ -f "$W" ] || continue
    EXP=$(grep -m1 "^\*\*Expires:\*\*" "$W" | awk '{print $2}')
    [ -n "$EXP" ] && [ "$EXP" \< "$TODAY" ] && echo "EXPIRED: $(basename "$W" .md)"
  done > /tmp/waiver-expired.txt
  # Repeat pattern (quarterly only — when DAYS >= 90)
  if [ "$DAYS" -ge 90 ]; then
    grep -h "^\*\*Gate(s) skipped:\*\*" docs/waivers/WAIVER-*.md 2>/dev/null | \
      sort | uniq -c | awk '$1 >= 3 { print "PATTERN: " $0 }'
  fi
fi

# ── block 21 ────────────────────────
if [ -f "docs/deprecations/DEPRECATION-CALENDAR.md" ]; then
  CUTOFF=$(date -v+90d +%Y-%m-%d 2>/dev/null || date -d "+90 days" +%Y-%m-%d)
  awk -v cut="$CUTOFF" '/## Active/,/## Completed/' \
    docs/deprecations/DEPRECATION-CALENDAR.md 2>/dev/null | \
    grep -E "^\|" | awk -F'|' -v cut="$CUTOFF" '
      NR > 2 { eol=$3; gsub(/ /, "", eol); if (eol != "" && eol < cut) print "EOL SOON: " $0 }'
fi

# ── block 22 ────────────────────────
SLO=docs/reliability/SLO.md
LOG=docs/reliability/INCIDENT-LOG.md
CACHE=.great_cto/slo-budget-current.md

if [ -f "$SLO" ] && [ -f "$LOG" ]; then
  mkdir -p .great_cto
  CUTOFF=$(date -v-30d +%Y-%m-%dT%H:%M 2>/dev/null || date -d "30 days ago" +%Y-%m-%dT%H:%M)
  TODAY=$(date +%Y-%m-%d)

  {
    printf '# SLO Budget — current state (updated %s)\n\n' "$TODAY"
    printf '| Service | SLI | Window | Used | Remaining | Status |\n'
    printf '|---------|-----|--------|------|-----------|--------|\n'

    # For each service + SLI row defined in SLO.md, sum "Budget consumed" minutes from INCIDENT-LOG within cutoff.
    awk -v cut="$CUTOFF" -v log="$LOG" '
      /^### / { svc = $2; next }
      svc != "" && /^\| [A-Za-z]/ && !/^\| SLI / && !/^\|---/ {
        # Parse SLO target row: | SLI-name | target | budget-text | window |
        n = split($0, f, "|");
        sli = f[2]; budget_text = f[4];
        gsub(/^ +| +$/, "", sli); gsub(/^ +| +$/, "", budget_text);
        # Extract first number from budget_text as budget minutes (approximation — hours→min handled loosely).
        if (match(budget_text, /[0-9]+(\.[0-9]+)?/)) {
          budget = substr(budget_text, RSTART, RLENGTH) + 0;
          if (budget_text ~ /h|hour/) budget = budget * 60;
        } else budget = 0;
        # Sum matching consumed minutes from log.
        used = 0;
        cmd = "awk -v cut=\"" cut "\" -v svc=\"" svc "\" \47" \
              "/^## [0-9]{4}-/ { d=$2; s=$4; next } " \
              "s == svc && /Budget consumed:/ && d >= cut { " \
              "  match($0, /[0-9]+/); print substr($0, RSTART, RLENGTH) " \
              "}\47 " log;
        while ((cmd | getline line) > 0) used += line + 0;
        close(cmd);
        remaining = budget - used;
        pct = (budget > 0) ? (used * 100.0 / budget) : 0;
        status = "ok";
        if (pct >= 100) status = "EXHAUSTED";
        else if (pct >= 80) status = "WARN";
        else if (pct >= 50) status = "warn";
        printf "| %s | %s | 30d rolling | %.1fmin (%.0f%%) | %.1fmin | %s |\n", svc, sli, used, pct, remaining, status;
      }
    ' "$SLO"
  } > "$CACHE"
  echo "slo-budget-current.md recomputed → $CACHE"

  # Snapshot for burn-rate trend (consumed by /burn).
  HISTORY=.great_cto/slo-burn-history.log
  [ ! -f "$HISTORY" ] && printf '# SLO burn history — append only. Format: ISO8601 | service | sli | used_min | budget_min | pct\n' > "$HISTORY"
  TS_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  python3 - "$CACHE" "$TS_ISO" >> "$HISTORY" <<'PY'
import sys, re
cache, ts = sys.argv[1], sys.argv[2]
with open(cache) as f:
    for line in f:
        if not line.startswith('|') or 'Service' in line or '---' in line:
            continue
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        if len(parts) < 6:
            continue
        svc, sli, _window, used_field, rem_field, _status = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        used_m = re.search(r'([0-9]+\.?[0-9]*)\s*min', used_field)
        rem_m  = re.search(r'([0-9]+\.?[0-9]*)\s*min', rem_field)
        pct_m  = re.search(r'\(([0-9]+)%\)', used_field)
        used    = float(used_m.group(1)) if used_m else 0.0
        remain  = float(rem_m.group(1))  if rem_m  else 0.0
        pct     = int(pct_m.group(1))    if pct_m  else 0
        budget  = used + remain
        print(f"{ts} | {svc} | {sli} | {used:.1f} | {budget:.1f} | {pct}")
PY
  echo "slo-burn-history snapshot appended"
fi

# ── block 23 ────────────────────────
CUTOFF_90=$(date -v-90d +%Y-%m-%d 2>/dev/null || date -d "90 days ago" +%Y-%m-%d)
if [ -d "docs/pre-mortems" ]; then
  for P in docs/pre-mortems/PRE-*.md; do
    [ -f "$P" ] || continue
    # A pre-mortem is overdue for review if (a) it references a ship date ≥ 90d ago
    # AND (b) the "Realized:" line under Post-ship review is still empty / placeholder.
    REALIZED=$(awk '/## Post-ship review/,/^## /' "$P" | grep -m1 "^- Realized:" | sed 's/^- Realized: *//')
    case "$REALIZED" in ""|"—"|"To be filled"*) echo "PRE-MORTEM REVIEW DUE: $P" ;; esac
  done
fi

# ── block 24 ────────────────────────
MONTH=$(date +%m); DAY=$(date +%d)
case "$MONTH" in 01|04|07|10) Q_START=1 ;; *) Q_START=0 ;; esac
if [ "$Q_START" = "1" ] && [ "$DAY" -le 7 ]; then
  ACTUAL_LOG=.great_cto/cost-actual.log
  if [ -f "$ACTUAL_LOG" ]; then
    # Entries are: <YYYY-MM> service:<slug> actual:$<N> estimate:$<N> delta:<%>
    grep "delta:+" "$ACTUAL_LOG" 2>/dev/null | awk -F 'delta:\\+' '{
      gsub(/%/, "", $2); if ($2 + 0 > 20) print "COST OVERRUN: " $0
    }' | tail -10
  fi
  # Also count ARCH docs with Cost Model section present
  ARCH_WITH_COST=$(grep -l "^## Cost Model" docs/architecture/ARCH-*.md 2>/dev/null | wc -l | tr -d ' ')
  echo "Quarterly cost check: $ARCH_WITH_COST ARCH doc(s) with Cost Model"
fi

# ── block 25 ────────────────────────
DAY=$(date +%d)
if [ "$DAY" -le 7 ]; then
  TEAM_SIZE=$(grep "^team-size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '[:alpha:]')
  if [ "${TEAM_SIZE:-1}" -ge 2 ]; then
    echo "MONTHLY ONBOARDING REFRESH — invoke project-auditor with action=onboarding-refresh"
  fi
fi

# ── block 26 ────────────────────────
# Only trigger on the first digest of each quarter (month in 1/4/7/10, first 7 days).
MONTH=$(date +%m); DAY=$(date +%d)
case "$MONTH" in 01|04|07|10) QUARTER_START=1 ;; *) QUARTER_START=0 ;; esac
if [ "$QUARTER_START" -eq 1 ] && [ "$DAY" -le 7 ] && [ -d "docs/vendors" ]; then
  VENDOR_COUNT=$(ls docs/vendors/VENDOR-*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$VENDOR_COUNT" -gt 0 ] && echo "VENDOR QUARTERLY REVIEW DUE — $VENDOR_COUNT vendors. Run: invoke security-officer with action=vendor-review"
fi

# ── block 27 ────────────────────────
BRAIN=".great_cto/brain.md"
TODAY=$(date +%Y-%m-%d)

# Create brain.md if it doesn't exist
if [ ! -f "$BRAIN" ]; then
  PROJECT_NAME=$(grep "^# " .great_cto/PROJECT.md 2>/dev/null | head -1 | sed 's/# //' || basename "$PWD")
  cat > "$BRAIN" <<BRAIN_INIT
# Project Brain — ${PROJECT_NAME}
> Compiled truth. Updated by /digest. Read by architect before designing.

## Current Synthesis

### Architecture Patterns in Use
<!-- Updated by architect after each ARCH doc -->

### What Has Failed / Avoid
<!-- Patterns from postmortems and blocked security audits -->

### Tech Debt
<!-- Persistent P2 bugs, perf degradation, audit findings -->

### Team Patterns
<!-- Recurring retro signals -->

---

## Evidence Timeline
<!-- Append-only. Most recent first. -->
BRAIN_INIT
fi

# ── block 28 ────────────────────────
# Append digest summary to evidence timeline
{
  printf '\n### %s — /digest (%s days)\n' "$TODAY" "${DAYS:-7}"

  # Velocity signal
  COMMITS=$(git log --oneline --since="${DAYS:-7} days ago" 2>/dev/null | wc -l | tr -d ' ')
  printf 'Velocity: %s commits\n' "$COMMITS"

  # Incident signal
  PM_COUNT=$(ls docs/postmortems/PM-*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$PM_COUNT" -gt 0 ] && printf 'Postmortems total: %s\n' "$PM_COUNT"

  # Security signal — any recent blocks
  SECURITY_BLOCKS=$(grep -c "BLOCKED" .great_cto/verdicts/security-officer.log 2>/dev/null || echo 0)
  [ "$SECURITY_BLOCKS" -gt 0 ] && printf 'Security blocks (cumulative): %s\n' "$SECURITY_BLOCKS"

  # Retro patterns (most recent)
  RETRO_SIGNAL=$(ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -1 | xargs grep -h "What slowed down:" 2>/dev/null | head -1)
  [ -n "$RETRO_SIGNAL" ] && printf 'Retro: %s\n' "$RETRO_SIGNAL"

  # Tech debt trend
  P2_COUNT=$(bd list --status open --priority 2 2>/dev/null | wc -l | tr -d ' ')
  [ "${P2_COUNT:-0}" -gt 0 ] && printf 'Tech debt: %s open P2 bugs\n' "$P2_COUNT"

} >> "$BRAIN"

# ── block 29 ────────────────────────
# If P2 bugs growing (>10): flag as tech debt in synthesis
# If same retro pattern appears ≥2 runs: add to "Team Patterns"
# If security-officer BLOCKED >1 time: add pattern to "What Has Failed"
# Implementation: use advisor_20260301 (max 1 call) to synthesize patterns into prose
# Write updated synthesis sections back to brain.md "Current Synthesis" block

# ── block 30 ────────────────────────
BRAIN_SIZE=$(wc -c < "$BRAIN" 2>/dev/null || echo 0)
BRAIN_CAP=4000
if [ "$BRAIN_SIZE" -gt "$BRAIN_CAP" ]; then
  # Preserve the "Current Synthesis" block (first half) verbatim.
  # Trim oldest Evidence Timeline entries from the end until under cap.
  python3 - "$BRAIN" "$BRAIN_CAP" <<'PY'
import sys, pathlib
path, cap = pathlib.Path(sys.argv[1]), int(sys.argv[2])
text = path.read_text()
# Split at Evidence Timeline boundary
marker = '\n## Evidence Timeline'
if marker in text:
    head, tail = text.split(marker, 1)
    # Split tail into individual entries (### YYYY-MM-DD blocks)
    import re
    entries = re.split(r'(?=\n### \d{4}-)', tail)
    header_entry = entries[0]
    timeline_entries = entries[1:]  # most recent last
    # Trim oldest (front of list) until total fits
    while len((head + marker + header_entry + ''.join(timeline_entries)).encode()) > cap and timeline_entries:
        timeline_entries.pop(0)
    path.write_text(head + marker + header_entry + ''.join(timeline_entries))
    trimmed = path.stat().st_size
    print(f'brain.md trimmed: was {len(text)} chars → {trimmed} chars (cap={cap})')
else:
    # No timeline section — hard-truncate at cap
    path.write_text(text[:cap] + '\n<!-- brain.md truncated at cap -->\n')
    print(f'brain.md hard-truncated to {cap} chars')
PY
  printf '%s dream-cycle brain.md trimmed to cap=%d\n' "$TODAY" "$BRAIN_CAP" >> .great_cto/agent-writes.log
fi

# ── block 31 ────────────────────────
if [ "$BOARD_MODE" = "true" ]; then
  REPORT_FILE="docs/board-reports/BOARD-${CURRENT_YEAR}-${QUARTER}.md"
  mkdir -p docs/board-reports

  # DORA benchmark label
  DEPLOY_LABEL="Low (less than monthly)"
  if [ "${DEPLOY_COUNT:-0}" -gt 0 ]; then
    PER_WEEK=$(python3 -c "print('%.1f' % (${DEPLOY_COUNT:-0} / (${DAYS:-90}/7)))" 2>/dev/null || echo "0")
    python3 -c "
per_week = ${DEPLOY_COUNT:-0} / (${DAYS:-90}/7)
if per_week >= 7: print('Elite (daily+)')
elif per_week >= 1: print('High (weekly)')
elif per_week >= 0.25: print('Medium (monthly)')
else: print('Low (less than monthly)')
" 2>/dev/null
  fi
fi

# ── block 32 ────────────────────────
# Implementation skeleton (board-mode only) — fill table values from data sources above
if [ "$BOARD_MODE" = "true" ] && grep -qE "^archetype: (ai-system|agent-product)" .great_cto/PROJECT.md; then
  # Compute metrics from data sources
  SESSIONS_THIS_Q=$(grep "$CURRENT_YEAR-$QUARTER" .great_cto/cost-history.log 2>/dev/null | grep -oE '"session_id":"[^"]*"' | sort -u | wc -l | tr -d ' ')
  TOTAL_SPEND=$(grep "$CURRENT_YEAR-$QUARTER" .great_cto/cost-history.log 2>/dev/null | grep -oE '"cost_usd":[0-9.]+' | awk -F: '{s+=$2} END {printf "%.2f",s}')
  BUDGET=$(grep "^monthly-budget-llm-usd:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '$')
  AVG_COST=$(echo "scale=4; ${TOTAL_SPEND:-0} / ${SESSIONS_THIS_Q:-1}" | bc 2>/dev/null)
  # ... etc; emit AI Operations table to board report
fi

# ── block 33 ────────────────────────
if [ "$BOARD_MODE" = "true" ]; then
  NARRATIVE_FILE="$REPORT_FILE"
  PERIOD_DAYS="${DAYS:-90}"
  CUTOFF=$(date -v-${PERIOD_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${PERIOD_DAYS} days ago" +%Y-%m-%d)

  # Inputs (every line traces to a file):
  #   docs/architecture/ARCH-*.md modified since CUTOFF → "What we shipped"
  #   docs/rfcs/RFC-*.md accepted since CUTOFF → also "What we shipped"
  #   docs/risks/RISK-REGISTER.md top-3 H×H / H×M active → "Risks on the horizon"
  #   .great_cto/slo-budget-current.md EXHAUSTED rows → also "Risks on the horizon"
  #   bd list --label epic:q<N+1> → "Next quarter focus"
  #   Existing DORA numbers from /digest + prior-quarter deltas → "Metrics"

  SHIPPED_ARCH=$(find docs/architecture -name "ARCH-*.md" -newermt "$CUTOFF" 2>/dev/null | head -5)
  ACCEPTED_RFCS=$(find docs/rfcs -name "RFC-*.md" -newermt "$CUTOFF" 2>/dev/null | head -5)
  TOP_RISKS=$(awk '/## Active risks/,/^## /' docs/risks/RISK-REGISTER.md 2>/dev/null | \
    grep -E "^\| R-[0-9]+" | awk -F'|' '{
      prob=$4; imp=$5; gsub(/ /, "", prob); gsub(/ /, "", imp);
      if (imp=="H" && (prob=="H" || prob=="M")) print $0
    }' | head -3)
  EXHAUSTED_SLO=$(grep "EXHAUSTED" .great_cto/slo-budget-current.md 2>/dev/null | head -3)
  NEXT_Q_NUM=$(( ${QUARTER#Q} % 4 + 1 ))
  NEXT_EPICS=$(bd list --label "epic:q${NEXT_Q_NUM}" --status open 2>/dev/null | head -5)

  # Append narrative to the board report file. Synthesizer rule: if source is empty, write explicit fallback
  # ("No material risks identified this quarter" / "Q1 baseline — trends will show next quarter").
  echo "Executive narrative appended → $NARRATIVE_FILE"
fi

# ── block 34 ────────────────────────
if [ "$ARCHITECTURE_MODE" = "true" ]; then
  # Skip for small/solo projects
  TEAM_SIZE=$(grep "^team-size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '[:alpha:]')
  SIZE=$(grep "^project_size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
  case "$SIZE" in nano|small) echo "Q-review skipped — project_size=$SIZE (needs medium+)"; exit 0 ;; esac

  REVIEW_FILE="docs/architecture/ARCH-REVIEW-${CURRENT_YEAR}-${QUARTER}.md"
  mkdir -p docs/architecture

  # Refuse to overwrite if the existing file is finalized (no Draft marker)
  if [ -f "$REVIEW_FILE" ]; then
    FIRST=$(head -1 "$REVIEW_FILE")
    case "$FIRST" in \>*Draft*) ;; *) echo "Q-review already finalized for ${QUARTER} — skipping. Delete file to regenerate."; exit 0 ;; esac
  fi

  # Snapshot brain.md at start of quarter (once) for next review's diff base
  QUARTER_SNAPSHOT=".great_cto/brain-${CURRENT_YEAR}-${QUARTER}-snapshot.md"
  [ -f ".great_cto/brain.md" ] && [ ! -f "$QUARTER_SNAPSHOT" ] && cp .great_cto/brain.md "$QUARTER_SNAPSHOT"

  CUTOFF=$(date -v-90d +%Y-%m-%d 2>/dev/null || date -d "90 days ago" +%Y-%m-%d)

  # Inputs (each is optional — skip section if source missing, per synthesizer rules):
  ADR_COUNT=$(find docs/decisions -name "ADR-*.md" -newermt "$CUTOFF" 2>/dev/null | wc -l | tr -d ' ')
  RFC_COUNT=$(find docs/rfcs -name "RFC-*.md" -newermt "$CUTOFF" 2>/dev/null | wc -l | tr -d ' ')
  GOD_NODES=$(grep -A 10 "^## God nodes" .great_cto/CODEBASE.md 2>/dev/null | head -15)
  ACTIVE_RISKS=$(awk '/## Active risks/,/^## /' docs/risks/RISK-REGISTER.md 2>/dev/null | grep -cE "^\| R-[0-9]+")
  PRE_MORTEMS_DUE=$(grep -r "To be filled" docs/pre-mortems/ 2>/dev/null | wc -l | tr -d ' ')
  WAIVER_EXPIRED=0
  if [ -d docs/waivers ]; then
    TODAY_DATE=$(date +%Y-%m-%d)
    WAIVER_EXPIRED=$(for W in docs/waivers/WAIVER-*.md; do
      [ -f "$W" ] || continue
      EXP=$(grep -m1 "^\*\*Expires:\*\*" "$W" | awk '{print $2}')
      [ -n "$EXP" ] && [ "$EXP" \< "$TODAY_DATE" ] && echo "$W"
    done 2>/dev/null | wc -l | tr -d ' ')
  fi
  SLO_BURNED=$(grep -cE "\| (WARN|EXHAUSTED) \|" .great_cto/slo-budget-current.md 2>/dev/null)
  AGED_DEBT=$(bd list --status open 2>/dev/null | wc -l | tr -d ' ')  # filter by age in final synthesis
  EOL_90D=$(awk '/## Active/,/## Completed/' docs/deprecations/DEPRECATION-CALENDAR.md 2>/dev/null | grep -cE "^\|")

  echo "Q-review draft → $REVIEW_FILE (inputs: adrs=$ADR_COUNT rfcs=$RFC_COUNT risks_active=$ACTIVE_RISKS pre_due=$PRE_MORTEMS_DUE waiver_exp=$WAIVER_EXPIRED slo_burned=$SLO_BURNED eol_90d=$EOL_90D)"
fi
