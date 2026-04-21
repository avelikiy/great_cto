---
description: "DORA metrics snapshot — Deployment Frequency, Lead Time, Change Failure Rate, MTTR. Computed from local artefacts (deploys.log + postmortems + bd)."
argument-hint: "[period_days] — default 30. Examples: /dora 7 | /dora 30 | /dora 90"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

You are the DORA aggregator. Compute the four DORA metrics from local artefacts produced by `devops`, `l3-support`, and `bd`. No new services, no telemetry — only what already lives in the repo.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
PERIOD=${1:-30}
case "$PERIOD" in
  ''|*[!0-9]*) echo "Usage: /dora [period_days]  (got: $PERIOD)"; exit 2 ;;
esac
NOW_EPOCH=$(date +%s)
WINDOW_START=$(( NOW_EPOCH - PERIOD * 86400 ))
PREV_START=$(( WINDOW_START - PERIOD * 86400 ))
DORA_LOG=.great_cto/deploys.log
PM_DIR=docs/postmortems
BASELINE=.great_cto/dora-baseline.log
```

## Helper: median

```bash
median() {
  # stdin: numbers, one per line. stdout: median rounded to int. Empty → "-"
  python3 - <<'PY'
import sys, statistics
nums = [float(x) for x in sys.stdin.read().split() if x.strip()]
print(round(statistics.median(nums)) if nums else "-")
PY
}
```

## Helper: epoch from ISO8601

```bash
iso_to_epoch() {
  # arg1: ISO8601. macOS + linux compatible.
  python3 -c "import sys,datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).timestamp()))" "$1" 2>/dev/null || echo 0
}
```

## Step 1 — Deployment Frequency

```bash
# Count deploys in current window vs previous window.
# Source: .great_cto/deploys.log (one line per devops deploy, since v1.0.87).
# Fallback: count PM-postmortems is meaningless; if no log, report NO_DATA.
DF_CUR=0; DF_PREV=0; DF_ROLLBACK=0
if [ -f "$DORA_LOG" ]; then
  while IFS='|' read -r TS REST; do
    TS=$(echo "$TS" | tr -d '[:space:]')
    case "$TS" in '#'*|'') continue ;; esac
    EPOCH=$(iso_to_epoch "$TS")
    [ "$EPOCH" -ge "$WINDOW_START" ] && DF_CUR=$((DF_CUR+1))
    [ "$EPOCH" -ge "$PREV_START" ] && [ "$EPOCH" -lt "$WINDOW_START" ] && DF_PREV=$((DF_PREV+1))
    # Status field is 4th col (0-indexed 3) — strip whitespace
    STATUS=$(echo "$REST" | awk -F'|' '{print $3}' | tr -d '[:space:]')
    [ "$STATUS" = "rollback" ] && [ "$EPOCH" -ge "$WINDOW_START" ] && DF_ROLLBACK=$((DF_ROLLBACK+1))
  done < "$DORA_LOG"
fi
DF_PER_DAY=$(python3 -c "print(round($DF_CUR/$PERIOD,2))")
```

## Step 2 — Lead Time for Changes

```bash
# Source: bd closed tasks with label 'feature' or 'release', if bd available.
# Lead time = closed_at - created_at, in hours, median.
LT_HOURS="-"
if command -v bd >/dev/null 2>&1; then
  LT_HOURS=$(bd list --status closed --json 2>/dev/null \
    | python3 - "$WINDOW_START" <<'PY' || echo "-"
import sys, json, datetime, statistics
window_start = int(sys.argv[1])
try:
    data = json.loads(sys.stdin.read() or "[]")
except Exception:
    print("-"); sys.exit(0)
deltas = []
for t in data:
    labels = t.get("labels", []) or []
    if not any(l in ("feature", "release") for l in labels): continue
    created = t.get("created_at") or t.get("created"); closed = t.get("closed_at") or t.get("closed")
    if not created or not closed: continue
    try:
        c = datetime.datetime.fromisoformat(created.replace("Z","+00:00")).timestamp()
        d = datetime.datetime.fromisoformat(closed.replace("Z","+00:00")).timestamp()
    except Exception: continue
    if d < window_start: continue
    deltas.append((d - c) / 3600.0)
print(round(statistics.median(deltas), 1) if deltas else "-")
PY
  )
fi
```

## Step 3 — Change Failure Rate

```bash
# CFR = (incidents in window) / (deploys in window) * 100
# Incidents: docs/postmortems/PM-*.md whose mtime is in window.
INCIDENTS_CUR=0; INCIDENTS_PREV=0
if [ -d "$PM_DIR" ]; then
  for F in "$PM_DIR"/PM-*.md; do
    [ -f "$F" ] || continue
    MT=$(stat -f %m "$F" 2>/dev/null || stat -c %Y "$F" 2>/dev/null || echo 0)
    [ "$MT" -ge "$WINDOW_START" ] && INCIDENTS_CUR=$((INCIDENTS_CUR+1))
    [ "$MT" -ge "$PREV_START" ] && [ "$MT" -lt "$WINDOW_START" ] && INCIDENTS_PREV=$((INCIDENTS_PREV+1))
  done
fi
if [ "$DF_CUR" = "0" ]; then
  CFR_CUR="-"
else
  CFR_CUR=$(python3 -c "print(round(${INCIDENTS_CUR}/${DF_CUR}*100,1))")
fi
if [ "$DF_PREV" = "0" ]; then
  CFR_PREV="-"
else
  CFR_PREV=$(python3 -c "print(round(${INCIDENTS_PREV}/${DF_PREV}*100,1))")
fi
```

## Step 4 — MTTR

```bash
# Source: 'MTTR:' line inside PM-*.md (format: "MTTR: <minutes>" or "MTTR: <X>min").
MTTR=$(
  if [ -d "$PM_DIR" ]; then
    for F in "$PM_DIR"/PM-*.md; do
      [ -f "$F" ] || continue
      MT=$(stat -f %m "$F" 2>/dev/null || stat -c %Y "$F" 2>/dev/null || echo 0)
      [ "$MT" -lt "$WINDOW_START" ] && continue
      grep -iE "^MTTR:" "$F" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1
    done | median
  else
    echo "-"
  fi
)
```

## Step 5 — Trend deltas + verdict markers

```bash
# Compute deltas safely (handles "-" sentinel).
delta_pct() {
  # arg1: cur, arg2: prev → "+18%" / "-25%" / "—"
  [ "$1" = "-" ] || [ "$2" = "-" ] || [ "$2" = "0" ] && { echo "—"; return; }
  python3 -c "d=($1-$2)/$2*100; print(f'{d:+.0f}%')"
}
DF_DELTA=$(delta_pct "$DF_CUR" "$DF_PREV")
CFR_DELTA=$(delta_pct "$CFR_CUR" "$CFR_PREV")

# Verdict markers:
# DF: more is better. CFR: less is better. MTTR: less is better. LT: less is better.
mark_lower_better() { [ "$1" = "-" ] || [ "$2" = "-" ] && { echo "  "; return; }; python3 -c "import sys; print('✓ ' if $1<=$2 else '⚠ ')"; }
mark_higher_better() { [ "$1" = "-" ] || [ "$2" = "-" ] && { echo "  "; return; }; python3 -c "import sys; print('✓ ' if $1>=$2 else '⚠ ')"; }
DF_MARK=$(mark_higher_better "$DF_CUR" "$DF_PREV")
CFR_MARK=$(mark_lower_better "$CFR_CUR" "$CFR_PREV")
```

## Step 6 — Output

```bash
echo "═══ DORA — last ${PERIOD} days ═══"
echo ""
printf "  %-25s %s deploys  (%s vs prev ${PERIOD}d) %s\n" "Deployment Frequency:" "${DF_CUR} (${DF_PER_DAY}/day)" "$DF_DELTA" "$DF_MARK"
printf "  %-25s %s hours\n"   "Lead Time for Changes:" "${LT_HOURS}"
printf "  %-25s %s%%  (%s vs prev) %s\n" "Change Failure Rate:" "${CFR_CUR}" "$CFR_DELTA" "$CFR_MARK"
printf "  %-25s %s min\n"     "MTTR:" "${MTTR}"
[ "$DF_ROLLBACK" -gt 0 ] && echo "  ⚠ ${DF_ROLLBACK} rollback(s) in window"
echo ""

# Source notes when data is thin
[ ! -f "$DORA_LOG" ] && echo "  ℹ no .great_cto/deploys.log yet — run a few /devops deploys first"
[ "$LT_HOURS" = "-" ] && command -v bd >/dev/null 2>&1 && echo "  ℹ Lead Time empty — label release/feature tasks for bd to pick them up"
```

## Step 7 — Actionable signal (Ostrovok pattern)

```bash
# CFR > 15% OR rising → suggest investigation, not blame.
TRIGGER=false
[ "$CFR_CUR" != "-" ] && python3 -c "exit(0 if $CFR_CUR > 15 else 1)" 2>/dev/null && TRIGGER=true
[ "$CFR_CUR" != "-" ] && [ "$CFR_PREV" != "-" ] && python3 -c "exit(0 if $CFR_CUR > $CFR_PREV else 1)" 2>/dev/null && TRIGGER=true

if [ "$TRIGGER" = "true" ] && [ "$INCIDENTS_CUR" -gt 0 ]; then
  echo "─────────────────────────"
  echo "⚠ CFR signal — last ${INCIDENTS_CUR} incident(s):"
  ls -t "$PM_DIR"/PM-*.md 2>/dev/null | head -3 | while read F; do
    BASE=$(basename "$F" .md)
    ROOT=$(grep -A1 "^## Root Cause" "$F" 2>/dev/null | tail -1 | head -c 80)
    echo "  - $BASE — ${ROOT:-<no root cause section>}"
  done
  echo ""
  echo "  Consider: /audit on the affected service before more feature work."
  echo "  Anti-pattern: blaming code quality. Check Lead Time first — long latency"
  echo "  often produces incidents that look like quality issues."
fi
```

## Step 8 — Append baseline (for trend over time)

```bash
[ ! -f "$BASELINE" ] && printf '# date | period | df | df_per_day | lt_h | cfr | mttr_min | rollbacks\n' > "$BASELINE"
printf '%s | %s | %s | %s | %s | %s | %s | %s\n' \
  "$(date +%Y-%m-%d)" "$PERIOD" "$DF_CUR" "$DF_PER_DAY" "$LT_HOURS" "$CFR_CUR" "$MTTR" "$DF_ROLLBACK" \
  >> "$BASELINE"
```

## Reporting Contract

End with one DONE line:
- `DONE: DORA snapshot for ${PERIOD}d — DF=${DF_CUR}, LT=${LT_HOURS}h, CFR=${CFR_CUR}%, MTTR=${MTTR}min. baseline appended.`
