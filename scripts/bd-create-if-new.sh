#!/usr/bin/env bash
# scripts/bd-create-if-new.sh — create a Beads task only if no similar open
# task already exists. Prevents /audit from filing duplicate tickets on
# every re-run (root cause of a real PoC run producing 8 duplicate pairs —
# see CHANGELOG v1.0.150).
#
# Usage (as a standalone command):
#   bash scripts/bd-create-if-new.sh <search-keyword> <full title> [bd create flags...]
#
# Usage (sourced, to call the function directly without a subshell per task):
#   source scripts/bd-create-if-new.sh
#   bd_create_if_new "CVE-XXXX" "SEC: CVE-XXXX in <dep> — update to <version>" \
#     --type task --priority 0 --label security
#
# Strategy: search open tasks for the keyword. If a match is found → skip
# (prints "SKIP (duplicate)"). Keywords should be the most distinctive word
# from the title (dep name, filename, metric) — not generic words like
# "fix"/"update"/"add", which would false-positive against unrelated tasks.

bd_create_if_new() {
  local SEARCH_KEY="$1"; shift
  local TITLE="$1"; shift
  local FLAGS=("$@")

  # Check if any open task contains the search keyword (case-insensitive)
  if bd search "$SEARCH_KEY" 2>/dev/null | grep -qi "open\|in.progress"; then
    echo "  SKIP (duplicate): '$TITLE' — open task already exists for '$SEARCH_KEY'"
    return 0
  fi

  # No duplicate found — create the task
  bd create "$TITLE" "${FLAGS[@]}" 2>/dev/null && \
    echo "  CREATED: $TITLE" || \
    echo "  bd create failed: $TITLE (bd may be unavailable)"
}

# Only run as a command (not when sourced) — lets callers `source` this file
# to get the function without triggering a bd_create_if_new call themselves.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  bd_create_if_new "$@"
fi
