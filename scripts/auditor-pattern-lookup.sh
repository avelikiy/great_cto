#!/usr/bin/env bash
# scripts/auditor-pattern-lookup.sh — project-auditor Step 0 Pattern Lookup.
#
# Surfaces recurring debt categories and known audit patterns for the
# current archetype/stack. A matched pattern with `source_type:
# audit-recurrence` means the same debt class was found in two consecutive
# audits and needs a structural fix, not just a finding.
#
# Usage:
#   bash scripts/auditor-pattern-lookup.sh
#   (reads .great_cto/PROJECT.md primary/stack fields; scans
#    ~/.great_cto/global-patterns/GP-*.md)
#
# Output: one block per matched pattern (slug, source_type, hits, RECURRING
# flag, symptom). Matched patterns must be flagged as RECURRING in the audit
# report — they require structural remediation.
#
# KE trigger (caller's responsibility, not this script's): if the same debt
# category appears in this audit AND was in the previous audit report for
# this project, write ~/.great_cto/extractions/KE-<date>-<slug>.yaml with
# source_type: audit-recurrence. Schema:
# skills/great_cto/references/knowledge-extraction.md

set -uo pipefail

GP_DIR="$HOME/.great_cto/global-patterns"
ARCH=$(grep "^primary:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)
STACK=$(grep "^stack:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | head -1)

echo "=== KNOWN AUDIT PATTERNS for archetype=${ARCH:-unknown} stack=${STACK:-unknown} ==="
if [ -d "$GP_DIR" ] && ls "$GP_DIR"/GP-*.md >/dev/null 2>&1; then
  grep -rl "status: active" "$GP_DIR" 2>/dev/null | while read -r f; do
    if grep -qiE "applies_to:.*${ARCH}|applies_to:.*${STACK}|stack_fingerprint:.*${STACK}" "$f" 2>/dev/null; then
      SLUG=$(basename "$f" .md)
      SOURCE=$(grep "^source_type:" "$f" 2>/dev/null | awk '{print $2}')
      SYMPTOM=$(grep "^symptom:" "$f" 2>/dev/null | head -1 | sed 's/symptom: //')
      HITS=$(grep "^hits:" "$f" 2>/dev/null | awk '{print $2}')
      RECURRENT=""
      grep -qi "audit-recurrence" "$f" 2>/dev/null && RECURRENT=" ⚠ RECURRING"
      printf "  %s [%s] (hits=%s)%s\n  known debt: %s\n\n" \
        "$SLUG" "${SOURCE:-incident}" "${HITS:-0}" "$RECURRENT" "$SYMPTOM"
    fi
  done
  echo "  Flag matched patterns as RECURRING in the audit report — they require structural remediation."
else
  echo "  No global patterns yet. Run /crystallize after first audit with recurring findings."
fi
