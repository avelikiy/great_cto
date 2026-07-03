#!/usr/bin/env bash
# scripts/auditor-validate-type.sh — project-auditor type validation
# (mandatory before PROJECT.md write).
#
# Rule: the detected type MUST exist verbatim in TYPE_MAP.md. No invented
# types, no approximations — hallucinating a type (e.g. a fintech vertical
# label like "neobroker" with no TYPE_MAP mapping) silently corrupts the
# pipeline routing for this project forever.
#
# Usage:
#   ARCHETYPES_MD=<path> DETECTED_PRIMARY=<type> DETECTED_SECONDARY=<type|-> \
#     bash scripts/auditor-validate-type.sh
#
# Exit: 0 = primary type valid (secondary dropped with a WARN if invalid).
#       1 = BLOCKED — primary type not found in TYPE_MAP.md.
#
# If blocked: either add a matching keyword line to TYPE_MAP.md (commit it
# as part of the audit) or pick the nearest existing type from the printed
# list. Verticals (fintech/crypto/healthcare) belong in PROJECT.md's
# `## Domain` section, not `## Type` — do not invent a secondary type to
# capture them.

set -uo pipefail

# Extract canonical type list from TYPE_MAP.md (backticked tokens in the right column)
TYPE_MAP_PATH="${ARCHETYPES_MD%ARCHETYPES.md}TYPE_MAP.md"
[ -f "$TYPE_MAP_PATH" ] || TYPE_MAP_PATH=$(find ~/.claude -name "TYPE_MAP.md" -path "*/great_cto/*" 2>/dev/null | sort -V | tail -1)
VALID_TYPES=$(grep -oE '`[a-z0-9-]+`' "$TYPE_MAP_PATH" 2>/dev/null | tr -d '`' | sort -u)

validate_type() {
  local t="$1"
  [ -z "$t" ] && return 1
  echo "$VALID_TYPES" | grep -qx "$t"
}

# Apply to primary and secondary before writing PROJECT.md
if ! validate_type "$DETECTED_PRIMARY"; then
  echo "ERROR: detected primary type '$DETECTED_PRIMARY' is NOT in TYPE_MAP.md"
  echo "Valid types nearest to this description:"
  echo "$VALID_TYPES" | head -10
  echo "BLOCKED — refusing to write a hallucinated type. Either:"
  echo "  1. Add a matching keyword line to TYPE_MAP.md, or"
  echo "  2. Pick the closest existing type from the list above"
  exit 1
fi

if [ -n "${DETECTED_SECONDARY:-}" ] && ! validate_type "$DETECTED_SECONDARY"; then
  echo "WARN: secondary type '$DETECTED_SECONDARY' is NOT in TYPE_MAP.md — dropping"
  DETECTED_SECONDARY=""
fi
