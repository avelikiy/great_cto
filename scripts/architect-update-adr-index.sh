#!/usr/bin/env bash
# scripts/architect-update-adr-index.sh — append/update a row in
# docs/decisions/DECISIONS.md after writing an ADR.
#
# Usage:
#   bash scripts/architect-update-adr-index.sh docs/decisions/ADR-<NNN>-<slug>.md
#
# Idempotent — skips if a row for this ADR number already exists. Creates
# DECISIONS.md with the table header if missing.

set -uo pipefail

ADR_FILE="${1:?usage: $0 <path-to-ADR-file>}"
mkdir -p docs/decisions

NNN=$(basename "$ADR_FILE" | sed -n 's/^ADR-\([0-9]*\)-.*/\1/p')
TITLE=$(grep "^# ADR-" "$ADR_FILE" 2>/dev/null | head -1 | sed 's/^# //')
DATE=$(grep "^Date:" "$ADR_FILE" 2>/dev/null | awk '{print $2}')
STATUS=$(grep "^Status:" "$ADR_FILE" 2>/dev/null | awk '{print $2}')
INDEX="docs/decisions/DECISIONS.md"

[ ! -f "$INDEX" ] && printf '# Architecture Decision Records\n\n| ADR | Title | Date | Status |\n|-----|-------|------|--------|\n' > "$INDEX"

# Add row if not already present
grep -q "ADR-${NNN}" "$INDEX" 2>/dev/null || \
  printf '| ADR-%s | %s | %s | %s |\n' "$NNN" "${TITLE#ADR-${NNN}: }" "$DATE" "$STATUS" >> "$INDEX"

echo "DECISIONS.md updated → $TITLE"
