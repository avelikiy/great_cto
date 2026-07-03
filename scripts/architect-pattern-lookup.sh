#!/usr/bin/env bash
# scripts/architect-pattern-lookup.sh — architect Step 0 Pattern Lookup.
#
# Surfaces global patterns (learned from past incidents / superseded ADRs)
# matching the current archetype or stack, so architect doesn't repeat an
# architecture decision that was already proven wrong.
#
# Usage:
#   bash scripts/architect-pattern-lookup.sh
#   (reads .great_cto/PROJECT.md primary/stack fields; scans
#    ~/.great_cto/global-patterns/GP-*.md)
#
# Output: one block per matched pattern (slug, hits, mttr_reduction, symptom,
# design constraint) to stdout. If a matched pattern has `source_type:
# arch-rework`, architect must treat it as a hard constraint in the new ARCH
# doc — document why the design choice was not taken.

set -uo pipefail

GP_DIR="$HOME/.great_cto/global-patterns"
ARCH=$(grep "^primary:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
STACK=$(grep "^stack:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)

echo "=== KNOWN PATTERNS for archetype=${ARCH:-unknown} stack=${STACK:-unknown} ==="
if [ -d "$GP_DIR" ] && ls "$GP_DIR"/GP-*.md >/dev/null 2>&1; then
  grep -rl "status: active" "$GP_DIR" 2>/dev/null | while read -r f; do
    if grep -qiE "applies_to:.*${ARCH}|applies_to:.*${STACK}|stack_fingerprint:.*${STACK}" "$f" 2>/dev/null; then
      SLUG=$(basename "$f" .md)
      SYMPTOM=$(grep "^symptom:" "$f" 2>/dev/null | head -1 | sed 's/symptom: //')
      DETECT=$(grep -A 2 "^detection_order:" "$f" 2>/dev/null | grep "^  - " | head -1 | sed 's/^  - //')
      HITS=$(grep "^hits:" "$f" 2>/dev/null | awk '{print $2}')
      MTTR=$(grep "^mttr_reduction:" "$f" 2>/dev/null | awk -F': ' '{print $2}')
      printf "  %s (hits=%s, mttr=%s)\n  known issue: %s\n  → design constraint: %s\n\n" \
        "$SLUG" "${HITS:-0}" "${MTTR:-?}" "$SYMPTOM" "$DETECT"
    fi
  done
  echo "  Apply matched patterns as architecture constraints before writing ARCH doc."
else
  echo "  No global patterns yet. After first incident, run /crystallize to build the library."
fi
