#!/usr/bin/env bash
# scripts/architect-discovery-gate.sh — architect Step 0a Discovery hard-gate.
#
# Blocks architecture work for high-risk archetypes when PROJECT.md is
# missing the fields Discovery is supposed to have filled in. Without this,
# architect silently invents assumptions (team size, budget, geography) that
# propagate through the whole downstream pipeline.
#
# Usage:
#   bash scripts/architect-discovery-gate.sh
#   (reads .great_cto/PROJECT.md in cwd; no args)
#
# Exit: 0 = proceed, 1 = BLOCKED (prints the reason + remediation to stdout).
# On exit 1 the caller (architect agent) must not write ARCH doc, ADRs, or
# call sub-agents — return control to the user with the printed message.

set -uo pipefail

ARCH=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
DISCOVERY=$(grep "^discovery:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
MODE=$(grep "^mode:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
TEAM_SIZE=$(grep "^team-size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
COST_CAP=$(grep "^cost-cap-usd-month:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
GEO=$(grep "^geo:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)

# Tier 1: AI-archetypes — Discovery is non-negotiable (eval set, kill-switch, EU AI Act trigger)
case "$ARCH" in
  ai-system|agent-product)
    if [ "$DISCOVERY" != "completed" ] && [ "$DISCOVERY" != "skipped" ]; then
      echo "BLOCKED: ai-system / agent-product archetype requires discovery: completed in PROJECT.md"
      echo "Re-run /start with full Discovery (audience, compliance, data residency, kill-switch, cost cap, eval set)."
      echo "If this is a deliberate skip (interview demo, throwaway PoC), set 'discovery: skipped' in PROJECT.md and re-invoke."
      exit 1
    fi
    if [ -z "$MODE" ]; then
      echo "BLOCKED: ai-system / agent-product requires 'mode: poc|mvp|production' in PROJECT.md"
      exit 1
    fi
    ;;
esac

# Tier 2: high-compliance archetypes — minimum-fields gate (mode + team + cost + geo)
# Without these, architect would invent assumptions (e.g. "US-only", "$5k/mo", "team of 6") that
# silently propagate to ARCH doc and downstream pipeline.
case "$ARCH" in
  fintech|healthcare|regulated|enterprise-saas|commerce|web3)
    MISSING=""
    [ -z "$MODE" ] && MISSING="$MISSING mode"
    [ -z "$TEAM_SIZE" ] && MISSING="$MISSING team-size"
    [ -z "$COST_CAP" ] && MISSING="$MISSING cost-cap-usd-month"
    [ -z "$GEO" ] && MISSING="$MISSING geo"
    if [ -n "$MISSING" ] && [ "$DISCOVERY" != "completed" ] && [ "$DISCOVERY" != "skipped" ]; then
      echo "BLOCKED: $ARCH archetype requires these PROJECT.md fields:$MISSING"
      echo ""
      echo "These four shape every downstream decision (compliance scope, parallelism in pm, infra sizing in arch)."
      echo "Architect will not invent defaults — re-run /start which asks them in one batch (Step 2.5)."
      echo ""
      echo "Override: set 'discovery: skipped' in PROJECT.md to proceed with explicitly-default values"
      echo "(mode=mvp, team-size=1, cost-cap-usd-month=500, geo=us-only)."
      exit 1
    fi
    ;;
esac

exit 0
