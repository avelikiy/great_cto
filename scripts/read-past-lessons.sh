#!/usr/bin/env bash
# scripts/read-past-lessons.sh — print cross-project decisions + project-local
# lessons relevant to the current task, filtered to the top 5 by memory-filter.mjs.
#
# Usage:
#   TASK="design auth system with SAML SSO" bash scripts/read-past-lessons.sh
#
# Reads:
#   ~/.great_cto/decisions.md   — cross-project decisions (higher confidence, checked first)
#   .great_cto/lessons.md       — project-local lessons
#   .great_cto/PROJECT.md       — for archetype fallback filtering
#
# Falls back to archetype-filtered awk scan (no relevance ranking) if
# memory-filter.mjs is unavailable, or set GREAT_CTO_DISABLE_MEMORY_FILTER=1
# to force the fallback path.

set -uo pipefail

TASK="${TASK:-}"
ARCH=$(grep -E '^archetype:|^primary:' .great_cto/PROJECT.md 2>/dev/null | head -1 | awk '{print $2}')

# Locate memory-filter script (plugin install path or local dev path)
_MF=$(ls ~/.claude/plugins/cache/local/great_cto/*/scripts/memory-filter.mjs 2>/dev/null | sort -V | tail -1)
[ -z "$_MF" ] && _MF="scripts/memory-filter.mjs"

# 1. Cross-project decisions — filtered to top-5 relevant to TASK
if [ -f ~/.great_cto/decisions.md ]; then
  echo "=== CROSS-PROJECT DECISIONS (top-5 relevant to: $TASK) ==="
  if [ -f "$_MF" ] && [ "${GREAT_CTO_DISABLE_MEMORY_FILTER:-0}" != "1" ]; then
    node "$_MF" "$TASK" ~/.great_cto/decisions.md --k=5 --stats 2>/dev/null
  else
    # Fallback: archetype-filtered subset (legacy)
    awk -v arch="$ARCH" '
      /^---/ { in_fm = !in_fm; next }
      in_fm && /^archetypes:/ { match_arch = index($0, arch) > 0 }
      /^## / { print_block = match_arch }
      print_block { print }
    ' ~/.great_cto/decisions.md | head -60
  fi
fi

# 2. Project-local lessons — filtered to top-5 relevant to TASK
if [ -f .great_cto/lessons.md ]; then
  echo "=== PROJECT LESSONS (top-5 relevant to: $TASK) ==="
  if [ -f "$_MF" ] && [ "${GREAT_CTO_DISABLE_MEMORY_FILTER:-0}" != "1" ]; then
    node "$_MF" "$TASK" .great_cto/lessons.md --k=5 --stats 2>/dev/null
  else
    tail -100 .great_cto/lessons.md
  fi
fi
