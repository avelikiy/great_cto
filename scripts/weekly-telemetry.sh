#!/usr/bin/env bash
# scripts/weekly-telemetry.sh — weekly product insights from telemetry Worker.
#
# Fetches aggregate JSON from `https://telemetry.greatcto.systems/v1/report`
# (Worker reads D1 via its own binding — no CF API token needed by caller)
# and renders a markdown report.
#
# Usage:
#   scripts/weekly-telemetry.sh                  # write to docs/insights/<week>.md
#   scripts/weekly-telemetry.sh --dry-run        # print to stdout, no file
#   scripts/weekly-telemetry.sh --week 2026-W19  # specific ISO week
#
# Requires: curl, jq. No auth, no wrangler, no CF token. Works for any
# maintainer or contributor without admin access — same data they could
# already see via /v1/stats per PRIVACY.md.

set -uo pipefail

WORKER_URL="${WORKER_URL:-https://telemetry.greatcto.systems}"
DRY_RUN=0
WEEK_OVERRIDE=""

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --week)    WEEK_OVERRIDE="${2:-}"; shift 2 ;;
    --week=*)  WEEK_OVERRIDE="${1#--week=}"; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *)         echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Resolve ISO year-week (last completed week if not overridden)
if [ -n "$WEEK_OVERRIDE" ]; then
  YEAR_WEEK="$WEEK_OVERRIDE"
else
  YEAR_WEEK=$(date -u -v-1w '+%G-W%V' 2>/dev/null || date -u --date='last week' '+%G-W%V')
fi

OUT_DIR="$ROOT/docs/insights"
OUT_FILE="$OUT_DIR/$YEAR_WEEK.md"

# Dependency check
for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: $cmd not installed" >&2
    exit 2
  fi
done

# --- Fetch report from Worker ----------------------------------------------
TMP_JSON=$(mktemp)
trap 'rm -f "$TMP_JSON"' EXIT

HTTP=$(curl -sS -o "$TMP_JSON" -w '%{http_code}' \
  "$WORKER_URL/v1/report?week=$YEAR_WEEK")
if [ "$HTTP" != "200" ]; then
  echo "error: $WORKER_URL/v1/report returned HTTP $HTTP" >&2
  head -c 500 "$TMP_JSON" >&2; echo >&2
  exit 3
fi

# Parse window dates for header
WINDOW_FROM=$(jq -r '.range.from[:10]' "$TMP_JSON")
WINDOW_TO=$(jq -r '.range.to[:10]' "$TMP_JSON")
TOTAL=$(jq -r '.headline.total_events // 0' "$TMP_JSON")
UNIQUE=$(jq -r '.headline.unique_users // 0' "$TMP_JSON")

# --- Render markdown -------------------------------------------------------
{
cat <<EOF
# Telemetry Insights — $YEAR_WEEK

**Window:** $WINDOW_FROM → $WINDOW_TO (UTC)
**Source:** \`$WORKER_URL/v1/report?week=$YEAR_WEEK\` · aggregate-only (no anon_id)
**Generator:** \`scripts/weekly-telemetry.sh\` (mailed by \`.github/workflows/weekly-insights-email.yml\`)

## Headline

EOF

if [ "$TOTAL" -eq 0 ]; then
  echo '_(no events this week)_'
  echo
else
  echo '| metric | value |'
  echo '|---|---|'
  jq -r '.headline | to_entries[] | select(.value != null) | "| " + .key + " | " + (.value | tostring) + " |"' "$TMP_JSON"
  echo
fi

# --- §1 Popularity --------------------------------------------------------
cat <<'EOF'
## 1. Command popularity — what users actually run

`COUNT(*) GROUP BY command` over the week.

EOF
COUNT_POP=$(jq '.popularity | length' "$TMP_JSON")
if [ "$COUNT_POP" -eq 0 ]; then
  echo '_(no data)_'
else
  echo '| command | runs | users |'
  echo '|---|---|---|'
  jq -r '.popularity[] | "| " + .command + " | " + (.runs|tostring) + " | " + (.users|tostring) + " |"' "$TMP_JSON"
fi
cat <<'EOF'

> **Decision rule:** top-3 commands by `runs` get UX/perf polish first.
> Commands with `runs < 1% of top` are deprecation candidates.

EOF

# --- §2 Failures ----------------------------------------------------------
cat <<'EOF'
## 2. Failure rate — where users hit pain

`exit_code > 2` (rejecting normal-failure semantics like scan exit 1 = found vulns).

EOF
COUNT_FAIL=$(jq '.failures | length' "$TMP_JSON")
if [ "$COUNT_FAIL" -eq 0 ]; then
  echo '_(no commands above failure threshold)_'
else
  echo '| command | total | fails | fail_pct |'
  echo '|---|---|---|---|'
  jq -r '.failures[] | "| " + .command + " | " + (.total|tostring) + " | " + (.fails|tostring) + " | " + (.fail_pct|tostring) + "% |"' "$TMP_JSON"
fi
cat <<'EOF'

> **Decision rule:** any command with `fail_pct > 10` and `total >= 30` = open a P1 bug.
> Empty table = no commands hit threshold this week.

EOF

# --- §3 Archetypes --------------------------------------------------------
cat <<'EOF'
## 3. Archetype distribution — which reviewers matter

`init` events grouped by archetype. Shows which archetypes new users actually pick.

EOF
COUNT_ARCH=$(jq '.archetypes | length' "$TMP_JSON")
if [ "$COUNT_ARCH" -eq 0 ]; then
  echo '_(no init events)_'
else
  echo '| archetype | runs | users |'
  echo '|---|---|---|'
  jq -r '.archetypes[] | "| " + .archetype + " | " + (.runs|tostring) + " | " + (.users|tostring) + " |"' "$TMP_JSON"
fi
cat <<'EOF'

> **Decision rule:** if 5 archetypes cover 80% of `init`, the README hero
> table can be trimmed. Archetypes with 0 users for 3+ months = candidates
> for consolidation in the next major.

EOF

# --- §4 Performance -------------------------------------------------------
cat <<'EOF'
## 4. Performance — duration p50 (avg) + max

EOF
COUNT_PERF=$(jq '.performance | length' "$TMP_JSON")
if [ "$COUNT_PERF" -eq 0 ]; then
  echo '_(no data)_'
else
  echo '| command | runs | avg_ms | max_ms |'
  echo '|---|---|---|---|'
  jq -r '.performance[] | "| " + .command + " | " + (.runs|tostring) + " | " + (.avg_ms|tostring) + " | " + (.max_ms|tostring) + " |"' "$TMP_JSON"
fi
cat <<'EOF'

> **Decision rule:** compare to last week's report. Any command with `avg_ms`
> jump >20% or `max_ms` jump >50% on stable run count = perf regression.
> Open issue, bisect by version.

EOF

# --- §5 OS/Node -----------------------------------------------------------
cat <<EOF
## 5. OS / Node distribution — sunset signal

This week: $UNIQUE unique users.

EOF
COUNT_OSNODE=$(jq '.os_node | length' "$TMP_JSON")
if [ "$COUNT_OSNODE" -eq 0 ]; then
  echo '_(no data)_'
else
  echo '| os | node | users |'
  echo '|---|---|---|'
  jq -r '.os_node[] | "| " + .os + " | " + .node + " | " + (.users|tostring) + " |"' "$TMP_JSON"
fi
cat <<'EOF'

> **Decision rule:** Node 18.17 EOL April 2025. If <5% of users on a Node
> version, drop it in next major. Same for OS — if 0% Windows, stop testing
> Windows in CI.

---

## Action items for this week

- [ ] Review the failure table (§2) — anything >10% on >=30 runs?
- [ ] Compare §4 perf row-by-row with the previous week's report.
- [ ] If a new archetype appeared in §3 with users>5, consider featuring it.
- [ ] If any command in §1 dropped >50% week-over-week, investigate.

EOF

echo "_Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)._"

} > "${TMP_JSON}.md"

# Output
if [ "$DRY_RUN" -eq 1 ]; then
  cat "${TMP_JSON}.md"
  rm -f "${TMP_JSON}.md"
else
  mkdir -p "$OUT_DIR"
  mv "${TMP_JSON}.md" "$OUT_FILE"
  echo "wrote: $OUT_FILE" >&2
fi
