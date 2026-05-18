#!/usr/bin/env bash
# tests/security/inject-hitl.sh — create a synthetic HITL request via the
# leash admin API so a human reviewer can practice approve/reject from
# the board's Security tab.
#
# Used by docs/security/TESTING-PLAN-leash.md §4.C.
#
# Usage:
#   ./tests/security/inject-hitl.sh                 # 1 synthetic request
#   COUNT=5 ./tests/security/inject-hitl.sh         # 5 synthetic requests
#
# Cleanup:
#   COUNT=N ./tests/security/inject-hitl.sh clear   # rejects all pending

set -euo pipefail

PROXY=${LEASH_PROXY_URL:-http://localhost:8765}
COUNT=${COUNT:-1}
ACTION=${1:-create}

if [ "$ACTION" = "clear" ]; then
  pending=$(curl -sS "$PROXY/admin/hitl/pending" | python3 -c "import sys,json; [print(r['request_id']) for r in json.load(sys.stdin)]" || true)
  for id in $pending; do
    curl -sS -X POST "$PROXY/admin/hitl/$id/reject" \
      -H 'Content-Type: application/json' \
      -d '{"reason":"qa-cleanup"}' > /dev/null
    echo "rejected $id"
  done
  exit 0
fi

for i in $(seq 1 "$COUNT"); do
  request_id="synthetic-hitl-$(date +%s)-$i"
  payload=$(python3 -c "
import json
print(json.dumps({
    'agent_name': 'qa_test_agent',
    'tenant_id': 'leash-test',
    'session_id': 'qa-session-$i',
    'reason': 'manual-injection for /docs/security/TESTING-PLAN-leash.md §4.C',
    'tool': 'anthropic.messages.create',
    'rule_id': 'review_sensitive_sessions',
}))
")
  if curl -sS -X POST "$PROXY/admin/hitl/$request_id" \
    -H 'Content-Type: application/json' \
    -d "$payload" > /tmp/hitl-resp.json; then
    echo "injected $request_id"
  else
    echo "failed to inject $request_id"
    cat /tmp/hitl-resp.json
  fi
done

echo
echo "open http://localhost:3141 → Security → Review to approve / reject"
