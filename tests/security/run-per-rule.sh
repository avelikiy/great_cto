#!/usr/bin/env bash
# tests/security/run-per-rule.sh — drive per-rule positive prompts through
# the local llm-leash proxy and assert that the expected action fires.
#
# Used by docs/security/TESTING-PLAN-leash.md §2.B.
#
# Reads:
#   tests/security/fixtures/per-rule-prompts.jsonl  (one JSON record per row)
#
# Each fixture row may carry:
#   rule              the rule expected to fire (informational)
#   prompt            a string sent as user message
#   tool_result       a string injected as tool result (for tool_result_scanner)
#   tool_name/args    a tool call (for blocked_shell/sql)
#   expected_action   one of: block | redact | hitl | warn
#   tolerance         list of also-accepted actions
#
# Outputs: a markdown report at /tmp/per-rule-report.md
#
# Required env:
#   LEASH_PROXY_URL   (default: http://localhost:8765)
#   LEASH_TENANT      (default: leash-test)
#   ADMIN_TOKEN       (optional — when proxy enforces admin auth)

set -euo pipefail

FIXTURES=${FIXTURES:-tests/security/fixtures/per-rule-prompts.jsonl}
PROXY=${LEASH_PROXY_URL:-http://localhost:8765}
TENANT=${LEASH_TENANT:-leash-test}
REPORT=${REPORT:-/tmp/per-rule-report.md}

if [ ! -f "$FIXTURES" ]; then
  echo "fixtures not found: $FIXTURES" >&2
  exit 2
fi

PASS=0
FAIL=0
TOTAL=0
{
  echo "# Per-rule positive-prompt run"
  echo
  echo "Fixtures: \`$FIXTURES\`"
  echo "Proxy: \`$PROXY\`"
  echo "Tenant: \`$TENANT\`"
  echo "Date: $(date -u +%FT%TZ)"
  echo
  echo "| rule | expected | actual | verdict |"
  echo "|---|---|---|---|"
} > "$REPORT"

while IFS= read -r line; do
  [ -z "$line" ] && continue
  TOTAL=$((TOTAL + 1))

  rule=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('rule',''))")
  expected=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('expected_action',''))")
  tolerance=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(' '.join(d.get('tolerance',[])))")

  # Build the request body based on which fields the fixture carries.
  prompt=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('prompt',''))")
  if [ -z "$prompt" ]; then
    # Non-text fixtures (tool_result, tool calls, sequences) need a richer
    # driver — out of scope for this shell script; recorded as "skipped".
    echo "| \`$rule\` | $expected | — | ⊘ skipped (non-text fixture) |" >> "$REPORT"
    continue
  fi

  session="rule-test-$rule-$RANDOM"
  body=$(python3 -c "
import json
print(json.dumps({
    'model': 'claude-haiku-4-5',
    'messages': [{'role':'user','content': $(echo "$prompt" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))') }],
    'max_tokens': 32,
}))
")
  http_code=$(curl -sS -o /tmp/per-rule-resp.json -w "%{http_code}" \
    -X POST "$PROXY/v1/messages" \
    -H "X-LLM-Leash-Tenant-Id: $TENANT" \
    -H "X-LLM-Leash-Session-Id: $session" \
    -H "Content-Type: application/json" \
    ${ADMIN_TOKEN:+-H "Authorization: Bearer $ADMIN_TOKEN"} \
    -d "$body" || true)

  # Map HTTP code → action heuristic.
  case "$http_code" in
    402) actual="block" ;;
    403) actual="block" ;;
    408) actual="warn" ;;   # leash uses 408 for HITL hold
    200)
      # Could still be redact (response body modified). Look at response.
      if grep -q '"redacted"' /tmp/per-rule-resp.json 2>/dev/null; then actual="redact"; else actual="allow"; fi
      ;;
    *) actual="error-$http_code" ;;
  esac

  verdict="❌"
  for accept in $expected $tolerance; do
    if [ "$actual" = "$accept" ]; then
      verdict="✓"
      PASS=$((PASS + 1))
      break
    fi
  done
  [ "$verdict" = "❌" ] && FAIL=$((FAIL + 1))

  echo "| \`$rule\` | $expected | $actual | $verdict |" >> "$REPORT"
done < "$FIXTURES"

{
  echo
  echo "## Summary"
  echo
  echo "- total: $TOTAL"
  echo "- pass:  $PASS"
  echo "- fail:  $FAIL"
} >> "$REPORT"

echo "wrote $REPORT"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
