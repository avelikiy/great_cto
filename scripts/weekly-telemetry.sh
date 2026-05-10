#!/usr/bin/env bash
# scripts/weekly-telemetry.sh — weekly product insights from telemetry D1.
#
# Runs the 5 canonical queries against the deployed Worker's D1 database
# and emits a markdown report at docs/insights/<YYYY>-W<WW>.md.
#
# Why: telemetry data is only useful if you actually look at it on a
# cadence. This script is the "weekly review" — opened as a PR by the
# GitHub Action so decisions are tied to commits, not vibes.
#
# Usage:
#   scripts/weekly-telemetry.sh              # write file
#   scripts/weekly-telemetry.sh --dry-run    # print to stdout, no file
#   scripts/weekly-telemetry.sh --week 2026-W19  # specific week
#
# Auth: requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env.
# Token needs Account → D1 → Read (Edit also works).

set -uo pipefail

DRY_RUN=0
WEEK_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --week)    : ;;  # consumed below
    --week=*)  WEEK_OVERRIDE="${arg#--week=}" ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \?//'; exit 0 ;;
  esac
done
# allow --week 2026-W19 (separate arg form)
i=0
for a in "$@"; do
  i=$((i+1))
  if [ "$a" = "--week" ]; then
    NEXT_IDX=$((i+1))
    WEEK_OVERRIDE="${!NEXT_IDX:-}"
  fi
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- Resolve ISO year-week --------------------------------------------------
if [ -n "$WEEK_OVERRIDE" ]; then
  YEAR_WEEK="$WEEK_OVERRIDE"
else
  # Last completed ISO week. We always report on a closed window.
  YEAR_WEEK=$(date -u -v-1w '+%G-W%V' 2>/dev/null || date -u --date='last week' '+%G-W%V')
fi

OUT_DIR="$ROOT/docs/insights"
OUT_FILE="$OUT_DIR/$YEAR_WEEK.md"

# --- Auth check -------------------------------------------------------------
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "error: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required in env" >&2
  exit 2
fi
if ! command -v wrangler >/dev/null 2>&1; then
  echo "error: wrangler not installed (npm install -g wrangler)" >&2
  exit 2
fi

# --- Helper: run SQL via wrangler, return JSON results array ---------------
DB_NAME="great-cto-telemetry"
d1() {
  local sql="$1"
  wrangler d1 execute "$DB_NAME" --remote --json --command="$sql" 2>/dev/null \
    | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  print(json.dumps(data[0].get('results', [])))
except Exception:
  print('[]')
"
}

# --- Helper: emit markdown table from a JSON array ------------------------
# Reads JSON from stdin; takes headers + fields as positional args.
# Implemented as a single-line python invocation to avoid heredoc-vs-stdin
# collision (heredocs replace stdin).
md_table() {
  local headers="$1"
  local fields="$2"
  python3 -c '
import json, sys
headers = sys.argv[1].split(",")
fields  = sys.argv[2].split(",")
try:
  rows = json.load(sys.stdin)
except Exception:
  rows = []
if not rows:
  print("_(no data)_"); sys.exit(0)
print("| " + " | ".join(headers) + " |")
print("|" + "|".join(["---"] * len(headers)) + "|")
for r in rows:
  vals = []
  for f in fields:
    v = r.get(f, "")
    if v is None: v = ""
    vals.append(str(v))
  print("| " + " | ".join(vals) + " |")
' "$headers" "$fields"
}

# --- Window calculation: ISO week → date range ---------------------------
WEEK_START=$(python3 -c "
from datetime import date
import sys
yw = sys.argv[1]
year, week = yw.split('-W')
d = date.fromisocalendar(int(year), int(week), 1)
print(d.isoformat())
" "$YEAR_WEEK")
WEEK_END=$(python3 -c "
from datetime import date, timedelta
import sys
yw = sys.argv[1]
year, week = yw.split('-W')
d = date.fromisocalendar(int(year), int(week), 1) + timedelta(days=6)
print(d.isoformat())
" "$YEAR_WEEK")

WHERE_WEEK="received_at >= '${WEEK_START}T00:00:00Z' AND received_at <= '${WEEK_END}T23:59:59Z'"

# --- Q1: command popularity ------------------------------------------------
Q1=$(d1 "SELECT command, COUNT(*) AS runs, COUNT(DISTINCT anon_id) AS users
         FROM events WHERE $WHERE_WEEK
         GROUP BY command ORDER BY runs DESC")

# --- Q2: failure rate per command -----------------------------------------
Q2=$(d1 "SELECT command,
                COUNT(*) AS total,
                SUM(CASE WHEN exit_code > 2 THEN 1 ELSE 0 END) AS failures,
                ROUND(100.0 * SUM(CASE WHEN exit_code > 2 THEN 1 ELSE 0 END) / COUNT(*), 1) AS fail_pct
         FROM events WHERE $WHERE_WEEK
         GROUP BY command HAVING fail_pct > 0 ORDER BY fail_pct DESC")

# --- Q3: archetype distribution (init only — adoption signal) -------------
Q3=$(d1 "SELECT archetype, COUNT(DISTINCT anon_id) AS users, COUNT(*) AS runs
         FROM events WHERE $WHERE_WEEK AND command = 'init'
         GROUP BY archetype ORDER BY users DESC")

# --- Q4: performance per command (avg + max ms) ---------------------------
Q4=$(d1 "SELECT command,
                COUNT(*) AS runs,
                ROUND(AVG(duration_ms)) AS avg_ms,
                MAX(duration_ms)        AS max_ms
         FROM events WHERE $WHERE_WEEK AND duration_ms > 0
         GROUP BY command ORDER BY runs DESC")

# --- Q5: OS / Node distribution -------------------------------------------
TOTAL_USERS=$(d1 "SELECT COUNT(DISTINCT anon_id) AS u FROM events WHERE $WHERE_WEEK" | python3 -c "
import json,sys; r=json.load(sys.stdin); print(r[0].get('u', 0) if r else 0)")

Q5=$(d1 "SELECT os, node, COUNT(DISTINCT anon_id) AS users
         FROM events WHERE $WHERE_WEEK
         GROUP BY os, node ORDER BY users DESC LIMIT 20")

# --- Headline numbers -----------------------------------------------------
HEADLINE_JSON=$(d1 "SELECT
  COUNT(*) AS total_events,
  COUNT(DISTINCT anon_id) AS unique_users,
  COUNT(DISTINCT command) AS distinct_commands,
  COUNT(DISTINCT version) AS distinct_versions
FROM events WHERE $WHERE_WEEK")
HEADLINE_MD=$(echo "$HEADLINE_JSON" | python3 -c '
import json, sys
r = json.load(sys.stdin)
if not r:
  print("_(no events this week)_"); sys.exit(0)
d = r[0]
print("| metric | value |")
print("|---|---|")
for label, key in [
  ("total events", "total_events"),
  ("unique users", "unique_users"),
  ("distinct commands", "distinct_commands"),
  ("distinct versions", "distinct_versions"),
]:
  print("| " + label.ljust(18) + " | " + str(d.get(key, 0)) + " |")
')

# --- Render report --------------------------------------------------------
render() {
  cat <<EOF
# Telemetry Insights — $YEAR_WEEK

**Window:** $WEEK_START → $WEEK_END (UTC)
**Source:** \`great-cto-telemetry\` D1 · \`workers/telemetry/index.ts\`
**Generator:** \`scripts/weekly-telemetry.sh\` (mailed by \`.github/workflows/weekly-insights-email.yml\`)

## Headline

$HEADLINE_MD

## 1. Command popularity — what users actually run

\`COUNT(*) GROUP BY command\` over the week.

$(echo "$Q1" | md_table "command,runs,users" "command,runs,users")

> **Decision rule:** top-3 commands by \`runs\` get UX/perf polish first.
> Commands with \`runs < 1% of top\` are deprecation candidates.

## 2. Failure rate — where users hit pain

\`exit_code > 2\` (rejecting normal-failure semantics like scan exit 1 = found vulns).

$(echo "$Q2" | md_table "command,total,failures,fail_pct" "command,total,failures,fail_pct")

> **Decision rule:** any command with \`fail_pct > 10\` and \`total >= 30\` = open a P1 bug.
> Empty table = no commands hit threshold this week.

## 3. Archetype distribution — which reviewers matter

\`init\` events grouped by archetype. Shows which archetypes new users actually pick.

$(echo "$Q3" | md_table "archetype,users,runs" "archetype,users,runs")

> **Decision rule:** if 5 archetypes cover 80% of \`init\`, the README hero
> table can be trimmed. Archetypes with 0 users for 3+ months = candidates
> for consolidation in the next major.

## 4. Performance — duration p50 (avg) + max

$(echo "$Q4" | md_table "command,runs,avg_ms,max_ms" "command,runs,avg_ms,max_ms")

> **Decision rule:** compare to last week's report. Any command with \`avg_ms\`
> jump >20% or \`max_ms\` jump >50% on stable run count = perf regression.
> Open issue, bisect by version.

## 5. OS / Node distribution — sunset signal

Last week: $TOTAL_USERS unique users.

$(echo "$Q5" | md_table "os,node,users" "os,node,users")

> **Decision rule:** Node 18.17 EOL April 2025. If <5% of users on a Node
> version, drop it in next major. Same for OS — if 0% Windows, stop testing
> Windows in CI.

---

## Action items for this week

- [ ] Review the failure table (§2) — anything >10% on >=30 runs?
- [ ] Compare §4 perf row-by-row with the previous week's report.
- [ ] If a new archetype appeared in §3 with users>5, consider featuring it.
- [ ] If any command in §1 dropped >50% week-over-week, investigate.

_Generated $(date -u +'%Y-%m-%dT%H:%M:%SZ')._
EOF
}

# --- Output ---------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  render
else
  mkdir -p "$OUT_DIR"
  render > "$OUT_FILE"
  echo "wrote: $OUT_FILE"
fi
