#!/usr/bin/env bash
# scripts/auditor-ai-cost-cap-check.sh — project-auditor Phase 4D AI cost-cap check.
#
# For archetype ai-system | agent-product, verifies actual LLM spend has not
# exceeded the declared `monthly-budget-llm-usd` in PROJECT.md. Files a P0
# Beads task if the budget is unset, or if spend has crossed 80% (P1) or
# 100% (P0) of the cap. No-op for other archetypes.
#
# Usage:
#   bash scripts/auditor-ai-cost-cap-check.sh
#   (reads .great_cto/PROJECT.md; sums cost_usd entries for the current UTC
#    month from .great_cto/cost-history.log, logs/llm-cost.log, logs/cost.log,
#    logs/audit.jsonl — whichever exist)
#
# Dedup: skips bd create if an open/in-progress task already matches the
# search keyword (same pattern as Phase 8's bd_create_if_new).

set -uo pipefail

ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')

if [ "$ARCHETYPE" = "ai-system" ] || [ "$ARCHETYPE" = "agent-product" ]; then
  BUDGET=$(grep "^monthly-budget-llm-usd:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '$')

  if [ -z "$BUDGET" ] || [ "$BUDGET" = "0" ]; then
    # Dedup: skip if open task already exists for cost cap
    if ! bd search "cost cap" 2>/dev/null | grep -qi "open\|in.progress"; then
      bd create "AI cost cap unset for $ARCHETYPE archetype" \
        --priority P0 --label compliance --label cost \
        --notes "PROJECT.md missing monthly-budget-llm-usd. ai-system / agent-product archetypes require explicit LLM spend cap. Fill in PROJECT.md ## Budget section." 2>/dev/null
    fi
    echo "⚠ P0: monthly-budget-llm-usd not set for $ARCHETYPE archetype"
  else
    # Look for cost telemetry: standard locations
    SPEND_THIS_MONTH=0
    for SOURCE in \
      .great_cto/cost-history.log \
      logs/llm-cost.log \
      logs/cost.log \
      logs/audit.jsonl; do
      if [ -f "$SOURCE" ]; then
        # Sum cost_usd entries from current month (jsonl-style log expected)
        MONTH_PREFIX=$(date -u +"%Y-%m")
        SUM=$(grep "$MONTH_PREFIX" "$SOURCE" 2>/dev/null \
          | grep -oE '"cost_usd"[[:space:]]*:[[:space:]]*[0-9.]+' \
          | awk -F: '{s += $2} END {printf "%.2f", s}')
        SPEND_THIS_MONTH=$(echo "$SPEND_THIS_MONTH + ${SUM:-0}" | bc 2>/dev/null || echo "$SPEND_THIS_MONTH")
      fi
    done

    # Compare against budget — flag at 80% (warning) and 100% (P0)
    PCT=$(echo "scale=0; $SPEND_THIS_MONTH * 100 / $BUDGET" | bc 2>/dev/null || echo 0)

    if [ "${PCT:-0}" -ge 100 ]; then
      if ! bd search "LLM spend exceeded" 2>/dev/null | grep -qi "open\|in.progress"; then
        bd create "LLM spend exceeded budget ($SPEND_THIS_MONTH USD vs $BUDGET cap)" \
          --priority P0 --label compliance --label cost \
          --notes "Audit detected LLM spend over the declared monthly cap. Either raise budget after CTO sign-off or kill-switch the runaway path. See ARCH-*.md § Cost Model." 2>/dev/null
      fi
      echo "⚠ P0: LLM spend $SPEND_THIS_MONTH USD exceeds budget $BUDGET (${PCT}%)"
    elif [ "${PCT:-0}" -ge 80 ]; then
      if ! bd search "LLM spend approaching" 2>/dev/null | grep -qi "open\|in.progress"; then
        bd create "LLM spend approaching budget cap (${PCT}%)" \
          --priority P1 --label cost \
          --notes "Spend is at ${PCT}% of monthly cap. Investigate runaway sessions or raise cap." 2>/dev/null
      fi
      echo "P1: LLM spend at ${PCT}% of monthly cap"
    fi
  fi
fi
