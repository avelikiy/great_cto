#!/usr/bin/env bash
# tests/security/run-all.sh — run every section of TESTING-PLAN-leash.md.
#
# Sections:
#   0. preflight       (tools, processes, endpoint reachability)
#   1. tenant routing  (multi-project isolation via direct proxy POSTs)
#   2. detection       (eval-record + per-rule + FP-bait + drift contract)
#   3. budgets         (cap → over-budget block → kill switch)
#   4. frontend        (board API contracts: scope, agents, budgets, export, kill, feedback)
#
# Exit 0 if every section returned 0. Otherwise exit 1 with a summary table.
#
# All per-section reports concatenated into /tmp/run-all.md (override with
# `REPORT=` env). Each individual section also writes its own /tmp/section-N-*.md.
#
# Usage:
#   bash tests/security/run-all.sh                    # full run
#   ONLY=0,2 bash tests/security/run-all.sh           # selective sections
#   QUIET=1 bash tests/security/run-all.sh            # suppress per-section log
#   REPORT=/path/to/out.md bash tests/security/run-all.sh

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

REPORT=${REPORT:-/tmp/run-all.md}
# Default: every section. Override with comma-list e.g. ONLY=0,4 or ONLY=4b
ONLY=${ONLY:-0,1,2,3,4,4b}
QUIET=${QUIET:-0}

# Format the wanted sections as a regex for grep
wanted=",${ONLY//,/,},"

SECTIONS=(
  "0:preflight:run-section-0-preflight.sh"
  "1:tenant:run-section-1-tenant.sh"
  "2:detection:run-section-2-detection.sh"
  "3:budgets:run-section-3-budgets.sh"
  "4:frontend:run-section-4-frontend.sh"
  "4b:playwright:run-section-4b-playwright.sh"
)

declare -a STATUS_LINES
overall_exit=0

: > "$REPORT"
{
  echo "# Security testing — full run"
  echo
  echo "Started: $(ts)"
  echo "Selected sections: $ONLY"
  echo
} >> "$REPORT"

for spec in "${SECTIONS[@]}"; do
  num=${spec%%:*}
  rest=${spec#*:}
  name=${rest%%:*}
  script=${rest##*:}

  if [[ "$wanted" != *",$num,"* ]]; then
    STATUS_LINES+=("$num. $name — ⊘ skipped (not in ONLY)")
    continue
  fi

  section_report="/tmp/section-${num}-${name}.md"
  [ "$QUIET" = "1" ] || log "▶ §$num $name → $section_report"
  set +e
  bash "$SCRIPT_DIR/$script" "$section_report"
  rc=$?
  set -e

  case $rc in
    0)  STATUS_LINES+=("$num. $name — ✅ PASS") ;;
    1)  STATUS_LINES+=("$num. $name — ❌ FAIL"); overall_exit=1 ;;
    *)  STATUS_LINES+=("$num. $name — ⚠ exit=$rc"); overall_exit=1 ;;
  esac

  # Append section content to the bundle
  if [ -f "$section_report" ]; then
    {
      echo
      echo "---"
      echo
      cat "$section_report"
    } >> "$REPORT"
  fi
done

# Summary table
{
  echo
  echo "---"
  echo
  echo "## Summary"
  echo
  for line in "${STATUS_LINES[@]}"; do
    echo "- $line"
  done
  echo
  echo "Finished: $(ts)"
  echo
  if [ "$overall_exit" = "0" ]; then
    echo "**Overall: PASS**"
  else
    echo "**Overall: FAIL** — at least one section reported failures"
  fi
} >> "$REPORT"

[ "$QUIET" = "1" ] || {
  echo
  echo "==================================================================="
  for line in "${STATUS_LINES[@]}"; do echo "  $line"; done
  echo
  echo "Full report: $REPORT"
  echo "==================================================================="
}

exit $overall_exit
